import { embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_API_KEY } from '../config.js';

const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});
import { db } from '../db/db.js';
import { retrievability, reviewPriority } from '../srs/fsrs_metrics.js';

// Calculate cosine similarity between two vectors
export function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function generateEmbedding(text) {
  const { embedding } = await embed({
    model: google.textEmbeddingModel('gemini-embedding-2'),
    value: text,
  });
  return embedding;
}

// Get or create embedding for a word
export async function getWordEmbedding(wordId, text) {
  const row = db.prepare('SELECT embedding_json FROM word_embeddings WHERE word_id = ?').get(wordId);
  if (row) {
    return JSON.parse(row.embedding_json);
  }
  
  const embedding = await generateEmbedding(text);
  db.prepare('INSERT OR IGNORE INTO word_embeddings (word_id, embedding_json) VALUES (?, ?)').run(wordId, JSON.stringify(embedding));
  return embedding;
}

// Get all known embeddings into memory (fast for small datasets)
export function loadAllEmbeddings() {
  const rows = db.prepare('SELECT word_id, embedding_json FROM word_embeddings').all();
  const embeddings = new Map();
  for (const row of rows) {
    embeddings.set(row.word_id, JSON.parse(row.embedding_json));
  }
  return embeddings;
}

/**
 * Discovery Algorithm:
 * Mixes "due" review words with "new" words via Intersection Filter.
 */
export async function getDiscoveryWords(scenarioTopic, limit = 4) {
  // 1. Due filter for known words
  const knownWordsRows = db.prepare('SELECT * FROM words WHERE reps > 0').all();
  
  const dueWords = knownWordsRows
    .map(w => {
      const r = retrievability({ 
        stability: w.stability, 
        last_review_at: w.last_review_at 
      });
      return { ...w, r, priority: reviewPriority({ retrievability: r, difficulty: w.difficulty, lapses: w.lapses }) };
    })
    .filter(w => w.r < 0.9)
    .sort((a, b) => b.priority - a.priority);

  // Take up to 2 due words
  const selectedDue = dueWords.slice(0, 2);
  const remainingSlots = limit - selectedDue.length;

  const sanitize = w => { delete w.r; delete w.priority; return w; };
  if (remainingSlots <= 0) return selectedDue.map(sanitize);

  // 2. Intersection filter for new words
  const scenarioEmbedding = await generateEmbedding(scenarioTopic);
  
  // Identify user's known anchors (high stability words)
  const anchorWords = db.prepare('SELECT id, expression, meaning FROM words WHERE stability >= 2').all();
  
  const unknownWords = db.prepare('SELECT * FROM words WHERE reps = 0').all();
  
  if (unknownWords.length === 0) {
    return selectedDue.map(sanitize);
  }
  
  // Ensure we have embeddings for unknown words
  for (const word of unknownWords) {
    await getWordEmbedding(word.id, `${word.expression} (${word.meaning})`);
  }
  // Ensure we have embeddings for known anchor words
  for (const word of anchorWords) {
    await getWordEmbedding(word.id, `${word.expression} (${word.meaning})`);
  }
  
  const allEmbeddings = loadAllEmbeddings();
  const anchorEmbeddings = anchorWords.map(w => allEmbeddings.get(w.id)).filter(Boolean);
  
  const candidates = [];
  
  for (const word of unknownWords) {
    const wordEmbedding = allEmbeddings.get(word.id);
    if (!wordEmbedding) continue;
    
    // Similarity to scenario
    const scenarioRelevance = cosineSimilarity(wordEmbedding, scenarioEmbedding);
    
    // Proximity to closest known anchor
    let anchorProximity = 0;
    if (anchorEmbeddings.length > 0) {
      anchorProximity = Math.max(...anchorEmbeddings.map(anchorEmb => cosineSimilarity(wordEmbedding, anchorEmb)));
    }
    
    // Combined Score: weights can be adjusted.
    const combinedScore = (scenarioRelevance * 0.7) + (anchorProximity * 0.3);
    
    candidates.push({ word, combinedScore });
  }
  
  // Sort by combined score descending
  candidates.sort((a, b) => b.combinedScore - a.combinedScore);
  
  const selectedNew = candidates.slice(0, remainingSlots).map(c => c.word);
  return [...selectedDue.map(sanitize), ...selectedNew];
}

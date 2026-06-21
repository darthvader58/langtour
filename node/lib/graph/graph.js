import { embed, embedMany } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_API_KEY } from '../config.js';

const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});
import { db, getWordsByIds } from '../db/db.js';

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

// Generate embedding for text
export async function generateEmbedding(text) {
  const { embedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004'),
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
  db.prepare('INSERT INTO word_embeddings (word_id, embedding_json) VALUES (?, ?)').run(wordId, JSON.stringify(embedding));
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
 * Intersection Filter algorithm
 * Discovers optimal words for a scenario by ranking words that are:
 * 1. Conceptually related to the scenario topic
 * 2. Semantically "close" to the user's existing known words (anchors)
 */
export async function getOptimalWordsForScenario(scenarioTopic, count = 3) {
  // 1. Get embedding for the scenario concept
  const scenarioEmbedding = await generateEmbedding(scenarioTopic);
  
  // 2. Identify user's "known anchors" (high stability words)
  const knownWords = db.prepare('SELECT id, expression, meaning FROM words WHERE stability >= 2').all();
  
  // 3. Get all "unknown/new" words
  const unknownWords = db.prepare('SELECT id, expression, meaning FROM words WHERE state = 0').all();
  
  if (unknownWords.length === 0) return [];
  
  // 4. Ensure we have embeddings for unknown words
  for (const word of unknownWords) {
    await getWordEmbedding(word.id, `${word.expression} (${word.meaning})`);
  }
  // Ensure we have embeddings for known words
  for (const word of knownWords) {
    await getWordEmbedding(word.id, `${word.expression} (${word.meaning})`);
  }
  
  const allEmbeddings = loadAllEmbeddings();
  const knownEmbeddings = knownWords.map(w => allEmbeddings.get(w.id)).filter(Boolean);
  
  const candidates = [];
  
  for (const word of unknownWords) {
    const wordEmbedding = allEmbeddings.get(word.id);
    if (!wordEmbedding) continue;
    
    // Similarity to scenario
    const scenarioRelevance = cosineSimilarity(wordEmbedding, scenarioEmbedding);
    
    // Proximity to closest known anchor (defaults to 0 if no anchors exist yet)
    let anchorProximity = 0;
    if (knownEmbeddings.length > 0) {
      anchorProximity = Math.max(...knownEmbeddings.map(anchorEmb => cosineSimilarity(wordEmbedding, anchorEmb)));
    }
    
    // Combined Score: weights can be adjusted. We want high relevance to scenario AND high proximity to anchors.
    const combinedScore = (scenarioRelevance * 0.7) + (anchorProximity * 0.3);
    
    candidates.push({ word, scenarioRelevance, anchorProximity, combinedScore });
  }
  
  // Sort by combined score descending
  candidates.sort((a, b) => b.combinedScore - a.combinedScore);
  
  return candidates.slice(0, count).map(c => c.word);
}

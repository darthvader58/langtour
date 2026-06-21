import { embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_API_KEY } from '../config.js';

const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});
import {
  getAllWordEmbeddings,
  listUserWords,
  saveWordEmbedding,
} from '../db/db.js';
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

// Scenario topic strings repeat across players and turns; the Gemini call is the
// slowest hop on the discovery path, so we memoize the result in-process.
const scenarioEmbeddingCache = new Map();
async function getScenarioEmbedding(topic) {
  const cached = scenarioEmbeddingCache.get(topic);
  if (cached) return cached;
  const embedding = await generateEmbedding(topic);
  scenarioEmbeddingCache.set(topic, embedding);
  return embedding;
}

// Get all known embeddings into memory (fast for small datasets)
export async function loadAllEmbeddings() {
  const rows = await getAllWordEmbeddings();
  const embeddings = new Map();
  for (const row of rows) {
    embeddings.set(row.word_id, row.embedding);
  }
  return embeddings;
}

/**
 * Discovery Algorithm:
 * Mixes "due" review words with "new" words via Intersection Filter.
 */
export async function getDiscoveryWords(userId, scenarioTopic, langCode, limit = 4) {
  // Load the user's full word view, the scenario embedding, and all cached
  // word embeddings concurrently — the per-user word view is two round trips,
  // so the three filtered lists below all reuse the same fetch.
  const [allUserWords, scenarioEmbedding, allEmbeddings] = await Promise.all([
    listUserWords(userId, { language: langCode }),
    getScenarioEmbedding(scenarioTopic),
    loadAllEmbeddings(),
  ]);

  const knownWordsRows = allUserWords.filter((w) => w.reps > 0);
  const dueWords = knownWordsRows
    .map((w) => {
      const r = retrievability({ stability: w.stability, last_review_at: w.last_review_at });
      return { ...w, r, priority: reviewPriority({ retrievability: r, difficulty: w.difficulty, lapses: w.lapses }) };
    })
    .filter((w) => w.r < 0.9)
    .sort((a, b) => b.priority - a.priority);

  const selectedDue = dueWords.slice(0, 2);
  const remainingSlots = limit - selectedDue.length;

  const sanitize = (w) => { delete w.r; delete w.priority; return w; };
  if (remainingSlots <= 0) return selectedDue.map(sanitize);

  const anchorWords = allUserWords.filter((w) => w.stability >= 2);
  const unknownWords = allUserWords.filter((w) => w.reps === 0);
  if (unknownWords.length === 0) {
    return selectedDue.map(sanitize);
  }

  // Fill any holes for words missing an embedding, generating in parallel so the
  // Gemini calls overlap instead of serializing.
  const missing = [...unknownWords, ...anchorWords].filter(w => !allEmbeddings.has(w.id));
  if (missing.length > 0) {
    await Promise.all(missing.map(async (word) => {
      const embedding = await generateEmbedding(`${word.expression} (${word.meaning})`);
      allEmbeddings.set(word.id, embedding);
      await saveWordEmbedding(word.id, embedding);
    }));
  }

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

// Graph engine — simplified for langtour. Provides the API surface the
// /api/graph endpoints expect, working against the local SQLite db.
// Also exports getDiscoveryWords for the scenario route.

import { embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_API_KEY } from '../config.js';
import { db } from '../db/sqlite.js';
import {
  getAllWordEmbeddings,
  listUserWords,
  saveWordEmbedding,
} from '../db/db.js';
import { retrievability, reviewPriority } from '../srs/fsrs_metrics.js';

const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});

// ── Cosine similarity ──
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

const scenarioEmbeddingCache = new Map();
async function getScenarioEmbedding(topic) {
  const cached = scenarioEmbeddingCache.get(topic);
  if (cached) return cached;
  const embedding = await generateEmbedding(topic);
  scenarioEmbeddingCache.set(topic, embedding);
  return embedding;
}

export async function loadAllEmbeddings() {
  const rows = await getAllWordEmbeddings();
  const embeddings = new Map();
  for (const row of rows) {
    embeddings.set(row.word_id, row.embedding);
  }
  return embeddings;
}

export async function getDiscoveryWords(userId, scenarioTopic, langCode, limit = 4) {
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
    const scenarioRelevance = cosineSimilarity(wordEmbedding, scenarioEmbedding);
    let anchorProximity = 0;
    if (anchorEmbeddings.length > 0) {
      anchorProximity = Math.max(...anchorEmbeddings.map(anchorEmb => cosineSimilarity(wordEmbedding, anchorEmb)));
    }
    const combinedScore = (scenarioRelevance * 0.7) + (anchorProximity * 0.3);
    candidates.push({ word, combinedScore });
  }
  candidates.sort((a, b) => b.combinedScore - a.combinedScore);
  const selectedNew = candidates.slice(0, remainingSlots).map(c => c.word);
  return [...selectedDue.map(sanitize), ...selectedNew];
}

// ── Graph API functions ──

function decodeEmbedding(buf) {
  if (!buf) return null;
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

function getAllWords() {
  return db.prepare('SELECT id, expression, reading, meaning, stability, difficulty, state, lapses, embedding, created_at FROM words').all();
}

function getLatestReviewForWord(wordId, asOfMs = Date.now()) {
  const row = db.prepare(`
    SELECT fsrs_state_after_json, review_datetime
    FROM review_logs
    WHERE word_id = ? AND review_datetime <= datetime(?/1000, 'unixepoch')
    ORDER BY review_datetime DESC LIMIT 1
  `).get(wordId, asOfMs);
  if (!row) return null;
  try {
    return { ...JSON.parse(row.fsrs_state_after_json || 'null'), last_review: row.review_datetime };
  } catch { return null; }
}

export async function graphData({ threshold, clusters, topK, maxNodes, reviewedOnly }) {
  const words = getAllWords().slice(0, maxNodes);
  const nodes = words.map(w => ({
    id: w.id, expression: w.expression, reading: w.reading, meaning: w.meaning,
    stability: Number(w.stability) || 0, difficulty: Number(w.difficulty) || 0,
    state: w.state, lapses: w.lapses,
  }));
  return { nodes, edges: [], metrics: {}, clusters: [] };
}

export async function graphNodes({ maxNodes, reviewedOnly }) {
  const words = getAllWords().slice(0, maxNodes);
  return {
    nodes: words.map(w => ({
      id: w.id, expression: w.expression,
      stability: Number(w.stability) || 0, difficulty: Number(w.difficulty) || 0,
    })),
  };
}

export async function graphEdges(ids, { k = 6 } = {}) {
  return { edges: [] };
}

export async function graphMetrics(ids) {
  const now = Date.now();
  const metrics = {};
  for (const id of ids) {
    const row = db.prepare('SELECT stability, difficulty, state FROM words WHERE id = ?').get(id);
    if (!row) continue;
    const review = getLatestReviewForWord(id);
    const R = review ? retrievability({ stability: review.stability || 0, last_review_at: review.last_review, now }) : 0;
    metrics[id] = {
      retrievability: R,
      stability: Number(row.stability) || 0,
      difficulty: Number(row.difficulty) || 0,
      connectivity: 0, density: 0, hubness: 0,
    };
  }
  return { metrics };
}

export async function* graphStreamChunks({ maxNodes, reviewedOnly, k = 6 }) {
  const words = getAllWords().slice(0, maxNodes);
  const now = Date.now();

  yield { type: 'status', stage: 'streaming', maxNodes: words.length, reviewedOnly: !!reviewedOnly, k };
  yield { type: 'manifest', nodeCount: words.length, totalWords: words.length };

  const nodes = words.map((w, i) => {
    // Random positions in a sphere-like distribution — spread across ~6 units radius
    // so the 3D camera (which starts at distance ~9) can see the cloud
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const radius = 2 + Math.random() * 4;
    const stability = Number(w.stability) || 0;
    const difficulty = Number(w.difficulty) || 0;

    // Compute retrievability from last review
    const lastReview = getLatestReviewForWord(w.id, now);
    const R = lastReview
      ? retrievability({ stability: lastReview.stability || 0, last_review_at: lastReview.last_review, now })
      : 0;

    return {
      id: w.id,
      expression: w.expression,
      reading: w.reading,
      meaning: w.meaning,
      umapX: Math.cos(theta) * Math.sin(phi) * radius,
      umapY: Math.sin(theta) * Math.sin(phi) * radius * 0.6,
      umapZ: Math.cos(phi) * radius,
      pcScores: Array.from({ length: 384 }, () => (Math.random() - 0.5) * 2),
      retrievability: Number(R.toFixed(3)),
      stability,
      difficulty: Number(difficulty.toFixed(3)),
      connectivity: 0,
      density: 0,
      hubness: 0,
      state: w.state ?? 0,
      state_label: { 0: 'new', 1: 'learning', 2: 'review', 3: 'relearning' }[w.state] || 'new',
      lapses: w.lapses ?? 0,
      reps: w.reps ?? 0,
      last_review_at: lastReview?.last_review || null,
      created_at: w.created_at,
      due_at: w.due_at || null,
    };
  });

  yield { type: 'nodes', nodes, totalWords: words.length };

  // Build per-node metrics
  const metrics = {};
  for (const n of nodes) {
    const review = getLatestReviewForWord(n.id, now);
    metrics[n.id] = {
      retrievability: n.retrievability,
      stability: n.stability,
      difficulty: n.difficulty,
      connectivity: 0,
      density: 0,
      hubness: 0,
    };
  }
  yield { type: 'metrics', metrics };
  yield { type: 'edges', edges: [] };
  yield { type: 'done' };
}

export async function warmupGraphCache() {}
export function invalidateGraphCache() {}

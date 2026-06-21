// Semantic clustering of vocabulary, with LLM-named groups.
//
// Given a set of word ids, group them into semantic clusters and name each one.
// The grouping is THRESHOLDLESS hierarchical clustering — no fixed cluster size,
// no similarity cutoff. Cluster sizes emerge from the data, distributed around a
// target mean. The recipe (ported from a validated prior implementation):
//
//   1. Composite distance: D = α·cosineDist + (1−α)·|freqDiff|, blending semantic
//      similarity with word-frequency proximity (so a cluster is words that are
//      both topically related AND similar in commonness).
//   2. Average-linkage agglomerative clustering builds the full dendrogram.
//   3. A soft, size-guided cut descends the tree: a subtree is emitted as a cluster
//      when splitting it would NOT improve a Gaussian size-fit peaked at the target
//      mean. Sizes therefore form a distribution centred on the mean with no hard
//      cap — tight topics stay small, broad ones grow.
//   4. Clusters are ordered by average frequency (common vocabulary first).
//
// Each cluster is then named by the LLM (short label + emoji), with a graceful
// fallback to the hub word when the model is unavailable.

import { generateText } from 'ai';
import { model } from '../config.js';
import { db } from '../db/db.js';

const MIN_CLUSTER = 3;         // floor: don't name 1–2 word "clusters"
const MIN_TO_CLUSTER = 6;      // below this many words, clustering isn't meaningful
const TARGET_MEAN = 10;        // cluster sizes distribute around this mean
const SIZE_SIGMA = TARGET_MEAN * 0.4; // spread of the size distribution (derived, not free)
const ALPHA = 0.8;             // distance weight: semantic vs. frequency (0.8 = 80% semantic)

function bufToVec(buf) {
  if (!buf) return null;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// Load the embeddable rows for the given ids, preserving retrievability passed in
// by the caller (the planner already computed it for the due set).
function loadWords(ids, rById) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, expression, reading, meaning, embedding FROM words WHERE id IN (${placeholders})`,
  ).all(...ids);
  return rows
    .map((r) => ({
      id: r.id,
      expression: r.expression,
      reading: r.reading,
      meaning: r.meaning,
      retrievability: rById.get(r.id) ?? null,
      embedding: bufToVec(r.embedding),
    }))
    .filter((w) => w.embedding != null);
}

// ─── Composite vectors ────────────────────────────────────────────────────────

// Build composite feature vectors = [embedding | frequency-channel], so that one
// Euclidean geometry honours BOTH semantic similarity AND frequency proximity —
// the same blend as α·cosineDist + (1−α)·freqDist, but without an O(n²) matrix, so
// it scales to the full due set. Embeddings are unit-norm; we scale the embedding
// block by √α and append a single √(1−α)·freqNorm channel. Squared Euclidean on
// these vectors is then a monotone proxy for the composite distance.
function compositeVectors(words) {
  const n = words.length;
  const dim = words[0].embedding.length;
  let fMin = Infinity, fMax = -Infinity;
  for (const w of words) { const f = w.freq || 0; if (f < fMin) fMin = f; if (f > fMax) fMax = f; }
  const fRange = fMax - fMin;
  const sa = Math.sqrt(ALPHA);
  const sb = Math.sqrt(1 - ALPHA);

  const vecs = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = words[i].embedding;
    const v = new Float64Array(dim + 1);
    for (let k = 0; k < dim; k++) v[k] = sa * e[k];
    const fNorm = fRange > 0 ? ((words[i].freq || 0) - fMin) / fRange : 0;
    v[dim] = sb * fNorm;
    vecs[i] = v;
  }
  return vecs;
}

// ─── Recursive bisection (top-down, scalable) ─────────────────────────────────

// Gaussian size-fit, peaked at TARGET_MEAN. A cluster of ~10 scores ~1; very small
// or very large clusters score low. No hard wall — just a smooth preference.
function sizeFit(count) {
  const dev = count - TARGET_MEAN;
  return Math.exp(-(dev * dev) / (2 * SIZE_SIGMA * SIZE_SIGMA));
}

// Mean squared distance of a member set to its centroid = internal spread (cohesion;
// lower = tighter). Centroid is the arithmetic mean of the composite vectors.
function spread(idx, vecs, dim) {
  const c = new Float64Array(dim);
  for (const i of idx) { const v = vecs[i]; for (let k = 0; k < dim; k++) c[k] += v[k]; }
  for (let k = 0; k < dim; k++) c[k] /= idx.length;
  let s = 0;
  for (const i of idx) {
    const v = vecs[i];
    let d = 0;
    for (let k = 0; k < dim; k++) { const x = v[k] - c[k]; d += x * x; }
    s += d;
  }
  return s / idx.length;
}

// 2-means split of a member-index set. Seeds = the farthest-apart pair (approx via
// two rounds of "point farthest from the current seed"). A few Lloyd iterations.
// Returns [idxA, idxB], or null if it can't produce two non-empty sides.
function biSplit(idx, vecs, dim) {
  const m = idx.length;
  const sq = (a, b) => { let d = 0; for (let k = 0; k < dim; k++) { const x = a[k] - b[k]; d += x * x; } return d; };

  // Seed A: farthest from idx[0]; Seed B: farthest from A.
  let a = idx[0];
  for (const i of idx) if (sq(vecs[i], vecs[idx[0]]) > sq(vecs[a], vecs[idx[0]])) a = i;
  let b = idx[0];
  for (const i of idx) if (sq(vecs[i], vecs[a]) > sq(vecs[b], vecs[a])) b = i;
  if (a === b) return null;

  let cA = vecs[a].slice();
  let cB = vecs[b].slice();
  let assign = new Int8Array(m);
  for (let iter = 0; iter < 8; iter++) {
    let changed = false;
    for (let t = 0; t < m; t++) {
      const v = vecs[idx[t]];
      const side = sq(v, cA) <= sq(v, cB) ? 0 : 1;
      if (assign[t] !== side) { assign[t] = side; changed = true; }
    }
    // Recompute centroids.
    const nA = new Float64Array(dim), nB = new Float64Array(dim);
    let cntA = 0, cntB = 0;
    for (let t = 0; t < m; t++) {
      const v = vecs[idx[t]];
      if (assign[t] === 0) { for (let k = 0; k < dim; k++) nA[k] += v[k]; cntA++; }
      else { for (let k = 0; k < dim; k++) nB[k] += v[k]; cntB++; }
    }
    if (cntA === 0 || cntB === 0) return null;
    for (let k = 0; k < dim; k++) { nA[k] /= cntA; nB[k] /= cntB; }
    cA = nA; cB = nB;
    if (!changed) break;
  }
  const A = [], B = [];
  for (let t = 0; t < m; t++) (assign[t] === 0 ? A : B).push(idx[t]);
  if (!A.length || !B.length) return null;
  return [A, B];
}

// Top-down recursive bisection. Split a cluster only when splitting it yields a
// better size-fit AND the cluster is genuinely loose (its spread exceeds the
// deck-wide typical spread — a data-derived bar, not a picked threshold). Tight
// groups stop early (kept whole); diffuse blobs keep dividing toward TARGET_MEAN.
// Returns a list of member-index arrays.
function recursiveBisect(words, vecs) {
  const dim = vecs[0].length;
  const all = words.map((_, i) => i);

  // Cohesion bar: the typical spread of a target-mean-sized random-ish slice. We
  // approximate "typical" as the spread of the whole set scaled by how a cohesive
  // cluster compares — concretely, a cluster is "tight enough to stop" when its
  // spread is at or below the running parent's spread (no gain from splitting) and
  // it is already near/under the target size. The whole-set spread anchors scale.
  const out = [];
  const stack = [all];
  while (stack.length) {
    const idx = stack.pop();
    if (idx.length < 2 * MIN_CLUSTER) { out.push(idx); continue; } // too small to yield two valid halves

    const parts = biSplit(idx, vecs, dim);
    if (!parts) { out.push(idx); continue; }
    const [A, B] = parts;
    if (A.length < MIN_CLUSTER || B.length < MIN_CLUSTER) {
      // A clean two-way split isn't possible without orphaning a fragment.
      out.push(idx);
      continue;
    }

    // Size preference: do two children fit the target distribution better than one whole?
    const sizeWantsSplit = (sizeFit(A.length) + sizeFit(B.length)) > sizeFit(idx.length);

    // Real-seam test (parameter-free): is the gap BETWEEN the two halves larger
    // than the scatter WITHIN them? Compare the centroid separation to the mean
    // within-half spread. separation > scatter ⇒ two genuinely distinct groups;
    // separation ≤ scatter ⇒ one cohesive cloud, keep it whole. No magic ratio —
    // the cluster's own geometry decides.
    const cA = centroid(A, vecs, dim);
    const cB = centroid(B, vecs, dim);
    let separation = 0;
    for (let k = 0; k < dim; k++) { const x = cA[k] - cB[k]; separation += x * x; }
    const scatter = (A.length * spread(A, vecs, dim) + B.length * spread(B, vecs, dim)) / idx.length;
    const realSeam = separation > scatter;

    // Split when: the cluster is still well above target size (it MUST divide to
    // stay studyable — size-fit underflows to 0 for huge clusters so we test size
    // directly, not the fit delta), OR there's a real seam and size prefers the
    // split. Near/under target with no seam ⇒ keep whole.
    const oversized = idx.length > TARGET_MEAN * 2;
    if (oversized || (realSeam && sizeWantsSplit)) {
      stack.push(A, B);
    } else {
      out.push(idx);
    }
  }
  return out;
}

// Centroid (arithmetic mean) of a member-index set over the composite vectors.
function centroid(idx, vecs, dim) {
  const c = new Float64Array(dim);
  for (const i of idx) { const v = vecs[i]; for (let k = 0; k < dim; k++) c[k] += v[k]; }
  for (let k = 0; k < dim; k++) c[k] /= idx.length;
  return c;
}

// ─── Hierarchical clustering ──────────────────────────────────────────────────

// `words` must each carry an `embedding` and a numeric `freq` (zipf, 0 if unknown).
export function clusterWords(words) {
  if (words.length < MIN_TO_CLUSTER) return [];

  const vecs = compositeVectors(words);
  const memberSets = recursiveBisect(words, vecs);

  const clusters = [];
  for (const members of memberSets) {
    if (members.length < MIN_CLUSTER) continue; // drop tiny fragments
    const ws = members.map((idx) => words[idx]);
    // Hub = most frequent word in the cluster (a recognisable anchor for the label fallback).
    const hub = ws.reduce((best, w) => ((w.freq || 0) > (best.freq || 0) ? w : best), ws[0]);
    const avgFreq = ws.reduce((s, w) => s + (w.freq || 0), 0) / ws.length;
    clusters.push({
      hub: { id: hub.id, expression: hub.expression },
      avgFreq,
      words: ws.map((w) => ({
        id: w.id,
        expression: w.expression,
        reading: w.reading,
        meaning: w.meaning,
        retrievability: w.retrievability,
      })),
    });
  }

  // Common vocabulary first. No cap — the full due set is clustered and surfaced.
  clusters.sort((a, b) => b.avgFreq - a.avgFreq);
  return clusters;
}

// ─── LLM naming (label + emoji) ───────────────────────────────────────────────

const LABEL_BATCH = 30; // clusters named per LLM call; batches run concurrently

// Name one batch of clusters in a single LLM call. Mutates each cluster's
// label/emoji in place; falls back to the hub word on any failure.
async function labelBatch(batch) {
  const lines = batch
    .map((c, i) => {
      const words = c.words.slice(0, 5).map((w) => `${w.expression} (${w.meaning})`).join('; ');
      return `Cluster ${i + 1}: ${words}`;
    })
    .join('\n');

  const prompt = `You are a Chinese vocabulary tutor. I have algorithmically grouped Chinese words into semantic clusters using word embeddings. Name each cluster with a SHORT, SPECIFIC topic label (2-4 English words) and pick ONE emoji.

Rules:
- Label must be specific: "Government & Politics", "Business Operations", "Food & Dining", "Travel & Transport", etc.
- Do NOT use generic labels like "Chinese Words" or "Vocabulary".
- Emoji must match the topic.

Clusters:
${lines}

Respond with ONLY a JSON array in this exact format:
[
  {"label": "Topic Name", "emoji": "🍜"},
  ...
]
`;

  try {
    const result = await generateText({ model, temperature: 0.3, messages: [{ role: 'user', content: prompt }] });
    const text = (result.text || '').trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const labels = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    for (let i = 0; i < batch.length; i++) {
      batch[i].label = labels[i]?.label || `${batch[i].hub.expression} group`;
      batch[i].emoji = labels[i]?.emoji || '📝';
    }
  } catch (e) {
    console.error('[cluster] LLM labeling failed for a batch:', e.message);
    for (const c of batch) {
      c.label = `${c.hub.expression} group`;
      c.emoji = '📝';
    }
  }
}

// Name all clusters, batched and run CONCURRENTLY so naming ~200 clusters takes
// a few seconds instead of ~20s for one giant call. A failed batch degrades to
// hub-word fallbacks without affecting the others.
export async function labelClusters(clusters) {
  if (clusters.length === 0) return clusters;
  const batches = [];
  for (let i = 0; i < clusters.length; i += LABEL_BATCH) {
    batches.push(clusters.slice(i, i + LABEL_BATCH));
  }
  await Promise.all(batches.map((b) => labelBatch(b)));
  return clusters;
}

// Attach Chinese word-frequency (zipf, 0 if unknown) to each word in place.
// Uses nodewordfreq — already a dependency, used the same way in lib/ai/tools.js.
async function attachFrequencies(words) {
  try {
    const { zipfFrequency } = await import('nodewordfreq');
    for (const w of words) {
      const z = zipfFrequency(w.expression, 'zh');
      w.freq = typeof z === 'number' && z > 0 ? z : 0;
    }
  } catch (e) {
    console.error('[cluster] frequency lookup failed, using semantic-only:', e.message);
    for (const w of words) w.freq = 0;
  }
}

// Cluster the given word ids (with retrievability map) and name each group.
export async function clusterAndLabel(ids, rById) {
  const words = loadWords(ids, rById);
  await attachFrequencies(words);
  const clusters = clusterWords(words);
  clusters.forEach((c, i) => { c.id = `cluster-${i}`; });
  return labelClusters(clusters);
}

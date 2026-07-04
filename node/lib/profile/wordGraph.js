import { retrievability } from '../srs/fsrs_metrics.js';

export const COUNTRY_LANGUAGE = Object.freeze({
  china: 'zh', cn: 'zh',
  india: 'hi', in: 'hi',
  france: 'fr', fr: 'fr',
  mexico: 'es', mx: 'es',
  egypt: 'ar', eg: 'ar',
  brazil: 'pt', br: 'pt',
});

export function languageForCountry(countryCode) {
  return COUNTRY_LANGUAGE[String(countryCode ?? '').trim().toLowerCase()] ?? null;
}

export function normalizeVocabularyValue(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
}

export function filterWordsForScenario(words, vocabularyRows) {
  if (!vocabularyRows) return words;
  const terms = new Set(vocabularyRows.flatMap((row) => [row.english, row.chinese, row.pinyin])
    .map(normalizeVocabularyValue).filter(Boolean));
  return words.filter((word) => [word.expression, word.reading, word.meaning]
    .map(normalizeVocabularyValue).some((value) => terms.has(value)));
}

export function parseEmbedding(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const vector = parsed.map(Number);
  return vector.every(Number.isFinite) ? vector : null;
}

export function cosineSimilarity(a, b) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

function centeredVectors(vectors) {
  const dimensions = Math.min(...vectors.map((vector) => vector.length));
  const means = Array(dimensions).fill(0);
  for (const vector of vectors) {
    for (let d = 0; d < dimensions; d += 1) means[d] += vector[d] / vectors.length;
  }
  return vectors.map((vector) => Array.from({ length: dimensions }, (_, d) => vector[d] - means[d]));
}

function multiply(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function normalize(vector) {
  const norm = Math.hypot(...vector);
  return norm ? vector.map((value) => value / norm) : vector.map(() => 0);
}

function topEigenvectors(matrix, count) {
  const size = matrix.length;
  const working = matrix.map((row) => [...row]);
  const results = [];
  for (let component = 0; component < Math.min(count, size); component += 1) {
    let vector = normalize(Array.from({ length: size }, (_, index) => 1 + ((index + component) % 7)));
    for (let iteration = 0; iteration < 80; iteration += 1) {
      const next = normalize(multiply(working, vector));
      const delta = next.reduce((sum, value, index) => sum + Math.abs(value - vector[index]), 0);
      vector = next;
      if (delta < 1e-9) break;
    }
    const multiplied = multiply(working, vector);
    const eigenvalue = Math.max(0, vector.reduce((sum, value, index) => sum + value * multiplied[index], 0));
    results.push({ vector, eigenvalue });
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        working[row][column] -= eigenvalue * vector[row] * vector[column];
      }
    }
  }
  return results;
}

function normalizeAxis(values) {
  const max = Math.max(...values.map(Math.abs), 0);
  return max ? values.map((value) => value / max) : values.map(() => 0);
}

export function pca3(vectors) {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return [[0, 0, 0]];
  const centered = centeredVectors(vectors);
  const gram = centered.map((a) => centered.map((b) => a.reduce((sum, value, index) => sum + value * b[index], 0)));
  const components = topEigenvectors(gram, 3);
  const axes = components.map(({ vector, eigenvalue }) => normalizeAxis(vector.map((value) => value * Math.sqrt(eigenvalue))));
  while (axes.length < 3) axes.push(Array(vectors.length).fill(0));
  return vectors.map((_, index) => axes.map((axis) => axis[index]));
}

export function topNeighborEdges(items, neighbors = 3) {
  const pairSimilarity = new Map();
  for (let i = 0; i < items.length; i += 1) {
    const ranked = [];
    for (let j = 0; j < items.length; j += 1) {
      if (i === j) continue;
      ranked.push({ index: j, similarity: cosineSimilarity(items[i].embedding, items[j].embedding) });
    }
    ranked.sort((a, b) => b.similarity - a.similarity || items[a.index].id - items[b.index].id);
    for (const candidate of ranked.slice(0, neighbors)) {
      const source = Math.min(items[i].id, items[candidate.index].id);
      const target = Math.max(items[i].id, items[candidate.index].id);
      const key = `${source}:${target}`;
      pairSimilarity.set(key, Math.max(pairSimilarity.get(key) ?? -1, candidate.similarity));
    }
  }
  return [...pairSimilarity.entries()].map(([key, similarity]) => {
    const [source, target] = key.split(':').map(Number);
    return { source, target, similarity: Number(similarity.toFixed(6)) };
  }).sort((a, b) => a.source - b.source || a.target - b.target);
}

// Words absent from the learning_user_word_forest mirror fall back to
// superset: null, masteryTier: 0, lastUsedAt: null (LEFT JOIN semantics,
// applied in memory since the forest rows and word catalog are separate
// queries -- matching this file's existing progress/embedding merge style).
export function buildForestIndex(forestRows) {
  return new Map((forestRows ?? []).map((row) => [Number(row.word_id), row]));
}

// One entry per superset actually present among the given nodes, for
// root -> tree -> word rendering. Nodes without a superset aren't grouped.
export function buildTrees(nodes) {
  const wordIdsBySuperset = new Map();
  for (const node of nodes) {
    if (!node.superset) continue;
    if (!wordIdsBySuperset.has(node.superset)) wordIdsBySuperset.set(node.superset, []);
    wordIdsBySuperset.get(node.superset).push(node.id);
  }
  return [...wordIdsBySuperset.entries()].map(([superset, wordIds]) => ({ superset, wordIds }));
}

export function buildWordGraph(words, embeddingRows, { now = Date.now(), forestRows = [] } = {}) {
  const embeddingById = new Map(embeddingRows.map((row) => [Number(row.word_id), parseEmbedding(row.embedding)]));
  const forestById = buildForestIndex(forestRows);
  const embedded = words.map((word) => ({ ...word, embedding: embeddingById.get(Number(word.id)) }))
    .filter((word) => word.embedding);
  const positions = pca3(embedded.map((word) => word.embedding));
  const nodes = embedded.map((word, index) => {
    const recall = retrievability({ stability: word.stability, last_review_at: word.last_review_at, now });
    const forest = forestById.get(Number(word.id));
    return {
      id: Number(word.id),
      expression: word.expression,
      reading: word.reading,
      meaning: word.meaning,
      language: word.language,
      x: positions[index][0], y: positions[index][1], z: positions[index][2],
      state: Number(word.state) || 0,
      stability: Number(word.stability) || 0,
      difficulty: Number(word.difficulty) || 0,
      lapses: Number(word.lapses) || 0,
      reps: Number(word.reps) || 0,
      lastReviewAt: word.last_review_at,
      retrievability: recall,
      mastered: recall >= 0.9 && Number(word.stability) >= 7,
      due: recall < 0.9,
      superset: forest?.superset ?? null,
      masteryTier: Number(forest?.mastery_tier) || 0,
      lastUsedAt: forest?.last_used_at ?? null,
    };
  });
  return {
    nodes,
    edges: topNeighborEdges(embedded),
    trees: buildTrees(nodes),
    meta: { encountered: words.length, embedded: embedded.length, missingEmbeddings: words.length - embedded.length },
  };
}

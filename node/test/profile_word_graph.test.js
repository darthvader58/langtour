import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForestIndex,
  buildTrees,
  buildWordGraph,
  cosineSimilarity,
  filterWordsForScenario,
  languageForCountry,
  pca3,
  topNeighborEdges,
} from '../lib/profile/wordGraph.js';

test('country mappings preserve language isolation', () => {
  assert.equal(languageForCountry('china'), 'zh');
  assert.equal(languageForCountry('CN'), 'zh');
  assert.equal(languageForCountry('france'), 'fr');
  assert.equal(languageForCountry('unknown'), null);
});

test('scenario vocabulary matches expression, reading or meaning only', () => {
  const words = [
    { id: 1, expression: '市场', reading: 'shìchǎng', meaning: 'market' },
    { id: 2, expression: '火车', reading: 'huǒchē', meaning: 'train' },
  ];
  const vocabulary = [{ chinese: ' 市场 ', pinyin: 'shichang', english: 'street market' }];
  assert.deepEqual(filterWordsForScenario(words, vocabulary).map((word) => word.id), [1]);
});

test('PCA returns finite normalized 3D coordinates', () => {
  const positions = pca3([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0]]);
  assert.equal(positions.length, 4);
  for (const position of positions) {
    assert.equal(position.length, 3);
    assert.ok(position.every((value) => Number.isFinite(value) && Math.abs(value) <= 1));
  }
});

test('topNeighborEdges deduplicates pairs and limits each neighbor selection', () => {
  const items = [
    { id: 1, embedding: [1, 0] },
    { id: 2, embedding: [0.9, 0.1] },
    { id: 3, embedding: [0, 1] },
  ];
  const edges = topNeighborEdges(items, 1);
  assert.ok(edges.length >= 1 && edges.length <= 3);
  assert.equal(new Set(edges.map((edge) => `${edge.source}:${edge.target}`)).size, edges.length);
  assert.ok(edges.every((edge) => edge.source < edge.target));
  assert.ok(cosineSimilarity([1, 0], [1, 0]) > cosineSimilarity([1, 0], [0, 1]));
});

test('buildWordGraph includes encountered embedded words only and exposes missing count', () => {
  const words = [
    { id: 1, expression: '你好', reading: 'nǐ hǎo', meaning: 'hello', language: 'zh', reps: 2, state: 2, stability: 8, difficulty: 3, lapses: 0, last_review_at: '2026-06-21T12:00:00Z' },
    { id: 2, expression: '谢谢', reading: 'xièxie', meaning: 'thanks', language: 'zh', reps: 1, state: 1, stability: 1, difficulty: 4, lapses: 0, last_review_at: '2026-06-01T12:00:00Z' },
  ];
  const result = buildWordGraph(words, [{ word_id: 1, embedding: [1, 2, 3] }], { now: Date.parse('2026-06-21T12:00:00Z') });
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].language, 'zh');
  assert.equal(result.nodes[0].mastered, true);
  assert.deepEqual(result.meta, { encountered: 2, embedded: 1, missingEmbeddings: 1 });
  assert.deepEqual(result.edges, []);
});

test('buildWordGraph LEFT JOINs forest rows onto nodes, defaulting words absent from the mirror', () => {
  const words = [
    { id: 1, expression: '你好', reading: 'nǐ hǎo', meaning: 'hello', language: 'zh', reps: 2, state: 2, stability: 8, difficulty: 3, lapses: 0, last_review_at: '2026-06-21T12:00:00Z' },
    { id: 2, expression: '谢谢', reading: 'xièxie', meaning: 'thanks', language: 'zh', reps: 1, state: 1, stability: 5, difficulty: 4, lapses: 0, last_review_at: '2026-06-01T12:00:00Z' },
  ];
  const embeddings = [
    { word_id: 1, embedding: [1, 2, 3] },
    { word_id: 2, embedding: [3, 2, 1] },
  ];
  const forestRows = [
    { word_id: 1, superset: 'food & stuff', mastery_tier: 2, last_used_at: '2026-06-20T00:00:00Z' },
  ];
  const result = buildWordGraph(words, embeddings, { now: Date.parse('2026-06-21T12:00:00Z'), forestRows });
  const withForest = result.nodes.find((node) => node.id === 1);
  const withoutForest = result.nodes.find((node) => node.id === 2);
  assert.deepEqual(
    { superset: withForest.superset, masteryTier: withForest.masteryTier, lastUsedAt: withForest.lastUsedAt },
    { superset: 'food & stuff', masteryTier: 2, lastUsedAt: '2026-06-20T00:00:00Z' },
  );
  assert.deepEqual(
    { superset: withoutForest.superset, masteryTier: withoutForest.masteryTier, lastUsedAt: withoutForest.lastUsedAt },
    { superset: null, masteryTier: 0, lastUsedAt: null },
  );
});

test('buildWordGraph exposes a top-level trees array grouped by superset', () => {
  const words = [
    { id: 1, expression: '市场', reading: 'shìchǎng', meaning: 'market', language: 'zh', reps: 1, state: 1, stability: 1, difficulty: 1, lapses: 0, last_review_at: '2026-06-21T12:00:00Z' },
    { id: 2, expression: '面包', reading: 'miànbāo', meaning: 'bread', language: 'zh', reps: 1, state: 1, stability: 1, difficulty: 1, lapses: 0, last_review_at: '2026-06-21T12:00:00Z' },
    { id: 3, expression: '护照', reading: 'hùzhào', meaning: 'passport', language: 'zh', reps: 1, state: 1, stability: 1, difficulty: 1, lapses: 0, last_review_at: '2026-06-21T12:00:00Z' },
  ];
  const embeddings = [
    { word_id: 1, embedding: [1, 0, 0] },
    { word_id: 2, embedding: [0.9, 0.1, 0] },
    { word_id: 3, embedding: [0, 1, 0] },
  ];
  const forestRows = [
    { word_id: 1, superset: 'food & stuff', mastery_tier: 1, last_used_at: null },
    { word_id: 2, superset: 'food & stuff', mastery_tier: 0, last_used_at: null },
  ];
  const result = buildWordGraph(words, embeddings, { now: Date.parse('2026-06-21T12:00:00Z'), forestRows });
  assert.deepEqual(result.trees, [{ superset: 'food & stuff', wordIds: [1, 2] }]);
});

test('buildForestIndex keys rows by numeric word_id', () => {
  const index = buildForestIndex([{ word_id: '7', superset: 'market', mastery_tier: 3, last_used_at: '2026-06-01T00:00:00Z' }]);
  assert.equal(index.get(7).superset, 'market');
  assert.equal(index.get(99), undefined);
});

test('buildTrees groups word ids by superset and skips nodes without one', () => {
  const nodes = [
    { id: 1, superset: 'food & stuff' },
    { id: 2, superset: 'food & stuff' },
    { id: 3, superset: null },
    { id: 4, superset: 'transit' },
  ];
  assert.deepEqual(buildTrees(nodes), [
    { superset: 'food & stuff', wordIds: [1, 2] },
    { superset: 'transit', wordIds: [4] },
  ]);
});

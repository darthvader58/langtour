// Tests for the forward-chaining target-word engine (T-E Part B).
//
// Tests verify:
//   - Empty forest_edges falls back to catalog display_order.
//   - Already-attested words are filtered out.
//   - Non-empty forest_edges traverses one hop to reachable children.
//   - Deterministic ordering (catalog order for fallback, reachable order for forest).
//   - Missing scenario vocab returns an empty array without throwing.
//   - The limit option is respected (default CHAIN_TARGET_LIMIT = 5).

import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => {
  mock.restoreAll();
});

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

// A Supabase query builder mock that resolves to `result` regardless of which
// chained methods are called (.select, .eq, .in, .order, .limit …).
// Making it thenable (via `then`) means `await db.from(...).select(...).eq(...)` works.
function mockQuery(result) {
  const b = {
    select: () => b,
    eq: () => b,
    in: () => b,
    order: () => b,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return b;
}

function makeDb({ grantRows = [], vocabRows = [], wordRows = [], edgeRows = [] } = {}) {
  return {
    from(table) {
      if (table === 'scenario_turn_grants') return mockQuery({ data: grantRows, error: null });
      if (table === 'game_scenario_vocabulary') return mockQuery({ data: vocabRows, error: null });
      if (table === 'learning_words') return mockQuery({ data: wordRows, error: null });
      if (table === 'forest_edges') return mockQuery({ data: edgeRows, error: null });
      return mockQuery({ data: [], error: null });
    },
  };
}

let chainCounter = 0;
async function importFreshChain(db) {
  chainCounter++;
  mock.module(new URL('../lib/db/db.js', import.meta.url).href, {
    namedExports: { db },
  });
  return import(`../lib/graph/forwardChain.js?chainTest=${chainCounter}`);
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const VOCAB_ROWS = [
  { scenario_id: 'street-market', display_order: 0, english: 'Market', chinese: '市场', pinyin: 'shìchǎng' },
  { scenario_id: 'street-market', display_order: 1, english: 'How much?', chinese: '多少钱？', pinyin: 'duōshao qián' },
  { scenario_id: 'street-market', display_order: 2, english: 'Too expensive', chinese: '太贵了', pinyin: 'tài guì le' },
  { scenario_id: 'street-market', display_order: 3, english: 'Discount', chinese: '打折', pinyin: 'dǎzhé' },
  { scenario_id: 'street-market', display_order: 4, english: 'Fresh', chinese: '新鲜', pinyin: 'xīnxiān' },
  { scenario_id: 'street-market', display_order: 5, english: 'Bargain', chinese: '还价', pinyin: 'huánjià' },
];

const WORD_ROWS = [
  { id: 1, expression: '市场', reading: 'shìchǎng', meaning: 'Market', language: 'zh' },
  { id: 2, expression: '多少钱？', reading: 'duōshao qián', meaning: 'How much?', language: 'zh' },
  { id: 3, expression: '太贵了', reading: 'tài guì le', meaning: 'Too expensive', language: 'zh' },
  { id: 4, expression: '打折', reading: 'dǎzhé', meaning: 'Discount', language: 'zh' },
  { id: 5, expression: '新鲜', reading: 'xīnxiān', meaning: 'Fresh', language: 'zh' },
  { id: 6, expression: '还价', reading: 'huánjià', meaning: 'Bargain', language: 'zh' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('empty forest_edges falls back to catalog display_order', async () => {
  const db = makeDb({ vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  // Default limit is 5; catalog has 6 words; should return first 5 in order.
  assert.equal(result.length, 5);
  assert.equal(result[0].expression, '市场');
  assert.equal(result[1].expression, '多少钱？');
  assert.equal(result[4].expression, '新鲜');
});

test('already-attested words are filtered out in fallback path', async () => {
  // User has attested word id=1 (市场) and id=2 (多少钱？) in prior turns.
  const grantRows = [
    { used_word_ids: [1, 2] },
  ];
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  // Should skip ids 1 and 2 and return the next 4 (limit=5 but only 4 remain under that cap).
  const expressions = result.map((w) => w.expression);
  assert.ok(!expressions.includes('市场'), '市场 (id=1) must be filtered out');
  assert.ok(!expressions.includes('多少钱？'), '多少钱？ (id=2) must be filtered out');
  assert.equal(result[0].expression, '太贵了'); // display_order 2 is next
});

test('attested ids from multiple turns are unioned', async () => {
  // Turn 0 attested 1; turn 1 attested 2; both should be filtered.
  const grantRows = [
    { used_word_ids: [1] },
    { used_word_ids: [2] },
  ];
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  const ids = result.map((w) => w.id);
  assert.ok(!ids.includes(1), 'id=1 attested in turn 0 must not appear');
  assert.ok(!ids.includes(2), 'id=2 attested in turn 1 must not appear');
  assert.ok(result.length <= 5);
});

test('limit option is respected', async () => {
  const db = makeDb({ vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
    limit: 3,
  });

  assert.equal(result.length, 3);
  assert.equal(result[0].expression, '市场');
});

test('empty scenario vocab returns an empty array without throwing', async () => {
  const db = makeDb({ vocabRows: [], wordRows: WORD_ROWS });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'empty-scenario',
  });

  assert.deepEqual(result, []);
});

test('all catalog words attested returns empty array', async () => {
  const grantRows = [{ used_word_ids: [1, 2, 3, 4, 5, 6] }];
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  assert.deepEqual(result, []);
});

test('non-empty forest_edges: reachable children of attested words are returned', async () => {
  // User has attested id=1 (市场). The forest has an edge: 市场 → 太贵了.
  // Expect the engine to return 太贵了 (reachable) before the catalog fallback order.
  const grantRows = [{ used_word_ids: [1] }];
  const edgeRows = [
    { parent_id: '市场', child_id: '太贵了' }, // forest edge
  ];
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS, edgeRows });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
    limit: 3,
  });

  // 太贵了 (id=3) is reachable from 市场 via the forest edge.
  const expressions = result.map((w) => w.expression);
  assert.ok(expressions.includes('太贵了'), '太贵了 must be included via forest traversal');
  // 市场 itself (the parent, already attested) must not appear.
  assert.ok(!expressions.includes('市场'), '市场 is attested and must be excluded');
});

test('non-empty forest: already-attested reachable children are excluded', async () => {
  // User has attested BOTH the parent (市场, id=1) AND the forest-reachable child (太贵了, id=3).
  // The engine should skip the child and fall back to catalog order for un-attested words.
  const grantRows = [{ used_word_ids: [1, 3] }];
  const edgeRows = [{ parent_id: '市场', child_id: '太贵了' }];
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS, edgeRows });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  const ids = result.map((w) => w.id);
  assert.ok(!ids.includes(1), '市场 (id=1) attested → must not appear');
  assert.ok(!ids.includes(3), '太贵了 (id=3) attested → must not appear even if reachable via forest');
});

test('forest with no matching catalog words falls back to catalog order', async () => {
  // Forest has edges to words NOT in the scenario's catalog.
  const edgeRows = [
    { parent_id: '市场', child_id: '外国表达' }, // '外国表达' is not in VOCAB_ROWS
  ];
  const grantRows = [{ used_word_ids: [1] }]; // 市场 attested
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS, edgeRows });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
    limit: 3,
  });

  // Forest child doesn't map to a catalog word → fallback to catalog order.
  // id=1 (市场) is attested so the first returned should be id=2 (多少钱？).
  assert.ok(result.length > 0);
  assert.equal(result[0].expression, '多少钱？');
});

test('result shape matches the TargetWord contract', async () => {
  const db = makeDb({ vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getForwardChainTargetWords } = await importFreshChain(db);

  const result = await getForwardChainTargetWords({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
    limit: 1,
  });

  assert.equal(result.length, 1);
  const word = result[0];
  assert.equal(typeof word.id, 'number', 'id must be a number');
  assert.equal(typeof word.expression, 'string', 'expression must be a string');
  assert.equal(typeof word.meaning, 'string', 'meaning must be a string');
  // reading is optional but if present must be a string.
  if (word.reading !== undefined) {
    assert.equal(typeof word.reading, 'string');
  }
});

test('CHAIN_TARGET_LIMIT default is exported and equals 5', async () => {
  const { CHAIN_TARGET_LIMIT } = await importFreshChain(makeDb());
  assert.equal(CHAIN_TARGET_LIMIT, 5);
});

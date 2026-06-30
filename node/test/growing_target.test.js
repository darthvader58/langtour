// Tests for the growing-target policy engine (Ticket T-H).
//
// Tests verify:
//
//   Pure function (computeGrowingTarget) — no DB, no I/O:
//   - Constants are exported with expected defaults.
//   - 0 attestations → initial window of INITIAL_TARGET_SIZE words, not complete.
//   - N attestations → window grows by GROW_PER_ATTEST per attestation.
//   - Window is capped at catalog length.
//   - essentialCount = ceil(catalogLength * ESSENTIAL_FRACTION).
//   - scenarioComplete is false when fewer than essentialCount essential words attested.
//   - scenarioComplete is true when all essential words attested.
//   - targetWords excludes already-attested words.
//   - 3-word catalog: essentialCount=2; complete after 2 words; third word visible.
//   - All words attested: targetWords=[], scenarioComplete=true.
//   - Empty catalog: targetWords=[], scenarioComplete=false, window=0.
//   - Result shape: id (number), expression (string), meaning (string).
//
//   DB-calling wrapper (getGrowingTargetState) — DB mocked via mock.module:
//   - Empty scenario vocab returns zeroed state without throwing.
//   - With catalog + no grants → delegates to computeGrowingTarget (window=2).
//   - With catalog + grants → attestation reduces targetWords set.

import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Prevent createClient in db.js from throwing at import time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

afterEach(() => {
  mock.restoreAll();
});

// ---------------------------------------------------------------------------
// Pure-function import — no DB dependency.  growingTargetPolicy.js is the
// policy-only module with no db.js import, so it is safe to import statically.
// ---------------------------------------------------------------------------

import {
  computeGrowingTarget,
  INITIAL_TARGET_SIZE,
  GROW_PER_ATTEST,
  ESSENTIAL_FRACTION,
} from '../lib/graph/growingTargetPolicy.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// 6-word catalog (mirrors a typical China scenario like street-market).
const SIX_CATALOG = [
  { id: 1, expression: 'w0', meaning: 'Word 0' },
  { id: 2, expression: 'w1', meaning: 'Word 1' },
  { id: 3, expression: 'w2', meaning: 'Word 2' },
  { id: 4, expression: 'w3', meaning: 'Word 3' },
  { id: 5, expression: 'w4', meaning: 'Word 4' },
  { id: 6, expression: 'w5', meaning: 'Word 5' },
];

// 3-word catalog (mirrors a typical India scenario).
const THREE_CATALOG = [
  { id: 1, expression: 'w0', meaning: 'Word 0' },
  { id: 2, expression: 'w1', meaning: 'Word 1' },
  { id: 3, expression: 'w2', meaning: 'Word 2' },
];

// ---------------------------------------------------------------------------
// Policy constant tests
// ---------------------------------------------------------------------------

test('INITIAL_TARGET_SIZE is 2', () => {
  assert.equal(INITIAL_TARGET_SIZE, 2);
});

test('GROW_PER_ATTEST is 2', () => {
  assert.equal(GROW_PER_ATTEST, 2);
});

test('ESSENTIAL_FRACTION is between 0 and 1 exclusive', () => {
  assert.ok(ESSENTIAL_FRACTION > 0 && ESSENTIAL_FRACTION < 1);
});

// ---------------------------------------------------------------------------
// computeGrowingTarget — zero-attestation baseline
// ---------------------------------------------------------------------------

test('0 attestations: returns first INITIAL_TARGET_SIZE words, not complete', () => {
  const { targetWords, scenarioComplete, windowSize } = computeGrowingTarget(SIX_CATALOG, []);
  assert.equal(windowSize, INITIAL_TARGET_SIZE, 'window must start at INITIAL_TARGET_SIZE');
  assert.equal(targetWords.length, INITIAL_TARGET_SIZE);
  assert.equal(targetWords[0].expression, 'w0');
  assert.equal(targetWords[1].expression, 'w1');
  assert.equal(scenarioComplete, false);
});

// ---------------------------------------------------------------------------
// Window growth
// ---------------------------------------------------------------------------

test('1 attestation: window = INITIAL + 1 * GROW_PER_ATTEST', () => {
  // Attest id=1 (w0)
  const { windowSize } = computeGrowingTarget(SIX_CATALOG, [1]);
  assert.equal(windowSize, INITIAL_TARGET_SIZE + 1 * GROW_PER_ATTEST);
});

test('1 attestation: attested word excluded from targetWords, next words present', () => {
  const { targetWords } = computeGrowingTarget(SIX_CATALOG, [1]);
  const exprs = targetWords.map((w) => w.expression);
  assert.ok(!exprs.includes('w0'), 'w0 is attested and must not appear');
  assert.ok(exprs.includes('w1'), 'w1 must be in target (in window, not attested)');
  assert.ok(exprs.includes('w2'), 'w2 must be in target (window now = 4)');
  assert.ok(exprs.includes('w3'), 'w3 must be in target (window now = 4)');
});

test('2 attestations: window = INITIAL + 2 * GROW_PER_ATTEST, both excluded', () => {
  const { windowSize, targetWords } = computeGrowingTarget(SIX_CATALOG, [1, 2]);
  assert.equal(windowSize, INITIAL_TARGET_SIZE + 2 * GROW_PER_ATTEST);
  const exprs = targetWords.map((w) => w.expression);
  assert.ok(!exprs.includes('w0'), 'w0 attested — must not appear');
  assert.ok(!exprs.includes('w1'), 'w1 attested — must not appear');
  // All 4 remaining words (w2..w5) are in window and not attested.
  assert.ok(exprs.includes('w2'));
  assert.ok(exprs.includes('w5'));
});

test('window is capped at catalog length when attestedCount is high', () => {
  // 5 attested in a 6-word catalog: raw window = 2 + 5*2 = 12 → capped at 6.
  const { windowSize } = computeGrowingTarget(SIX_CATALOG, [1, 2, 3, 4, 5]);
  assert.equal(windowSize, SIX_CATALOG.length);
});

// ---------------------------------------------------------------------------
// Essential count and scenarioComplete
// ---------------------------------------------------------------------------

test('6-word catalog: essentialCount = ceil(6 * ESSENTIAL_FRACTION) = 4', () => {
  const { essentialCount } = computeGrowingTarget(SIX_CATALOG, []);
  assert.equal(essentialCount, Math.ceil(SIX_CATALOG.length * ESSENTIAL_FRACTION));
  assert.equal(essentialCount, 4);
});

test('scenarioComplete is false when 3 of 4 essential words are attested', () => {
  const { scenarioComplete } = computeGrowingTarget(SIX_CATALOG, [1, 2, 3]);
  assert.equal(scenarioComplete, false);
});

test('scenarioComplete is true when exactly all 4 essential words are attested', () => {
  const { scenarioComplete } = computeGrowingTarget(SIX_CATALOG, [1, 2, 3, 4]);
  assert.equal(scenarioComplete, true);
});

test('scenarioComplete stays true when supplementary words are also attested', () => {
  const { scenarioComplete } = computeGrowingTarget(SIX_CATALOG, [1, 2, 3, 4, 5, 6]);
  assert.equal(scenarioComplete, true);
});

test('all 6 words attested: targetWords is empty, scenarioComplete true', () => {
  const { targetWords, scenarioComplete } = computeGrowingTarget(SIX_CATALOG, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(targetWords, []);
  assert.equal(scenarioComplete, true);
});

// ---------------------------------------------------------------------------
// 3-word catalog (shallow tourist scenario)
// ---------------------------------------------------------------------------

test('3-word catalog: essentialCount = ceil(3 * ESSENTIAL_FRACTION) = 2', () => {
  const { essentialCount } = computeGrowingTarget(THREE_CATALOG, []);
  assert.equal(essentialCount, Math.ceil(THREE_CATALOG.length * ESSENTIAL_FRACTION));
  assert.equal(essentialCount, 2);
});

test('3-word catalog, 0 attested: window=2, target=[w0,w1], not complete', () => {
  const { targetWords, scenarioComplete } = computeGrowingTarget(THREE_CATALOG, []);
  assert.equal(targetWords.length, 2);
  assert.equal(targetWords[0].expression, 'w0');
  assert.equal(targetWords[1].expression, 'w1');
  assert.equal(scenarioComplete, false);
});

test('3-word catalog, 2 essential words attested: complete=true, w2 visible in target', () => {
  // After 2 attested: window = 2 + 2*2 = 6 → capped at 3.
  const { scenarioComplete, targetWords } = computeGrowingTarget(THREE_CATALOG, [1, 2]);
  assert.equal(scenarioComplete, true, 'both essential words attested → complete');
  // w2 is the only un-attested word in the (capped) full window.
  assert.equal(targetWords.length, 1);
  assert.equal(targetWords[0].expression, 'w2');
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('empty catalog: targetWords=[], scenarioComplete=false, window=0, essentialCount=0', () => {
  const { targetWords, scenarioComplete, windowSize, essentialCount } = computeGrowingTarget([], []);
  assert.deepEqual(targetWords, []);
  assert.equal(scenarioComplete, false);
  assert.equal(windowSize, 0);
  assert.equal(essentialCount, 0);
});

test('attestedWordIds may contain IDs not in catalog — they are ignored', () => {
  // id=99 is not in SIX_CATALOG; should not inflate the attestedCount.
  const { windowSize } = computeGrowingTarget(SIX_CATALOG, [99]);
  assert.equal(windowSize, INITIAL_TARGET_SIZE, 'foreign id does not widen the window');
});

test('attested IDs can be passed as a Set', () => {
  const result = computeGrowingTarget(SIX_CATALOG, new Set([1]));
  assert.equal(result.windowSize, INITIAL_TARGET_SIZE + GROW_PER_ATTEST);
});

// ---------------------------------------------------------------------------
// Result shape contract
// ---------------------------------------------------------------------------

test('each targetWord has id (number), expression (string), meaning (string)', () => {
  const { targetWords } = computeGrowingTarget(SIX_CATALOG, []);
  assert.ok(targetWords.length > 0);
  for (const w of targetWords) {
    assert.equal(typeof w.id, 'number', `id must be a number, got ${typeof w.id}`);
    assert.equal(typeof w.expression, 'string');
    assert.equal(typeof w.meaning, 'string');
    // reading is optional but, if present, must be a string.
    if (w.reading !== undefined) {
      assert.equal(typeof w.reading, 'string');
    }
  }
});

// ---------------------------------------------------------------------------
// DB wrapper (getGrowingTargetState) — mock.module tests
// ---------------------------------------------------------------------------

// A Supabase query builder mock that resolves to `result` regardless of
// which chained methods are called (.select, .eq, .in, .order, …).
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

function makeDb({ grantRows = [], vocabRows = [], wordRows = [] } = {}) {
  return {
    from(table) {
      if (table === 'scenario_turn_grants') return mockQuery({ data: grantRows, error: null });
      if (table === 'game_scenario_vocabulary') return mockQuery({ data: vocabRows, error: null });
      if (table === 'learning_words') return mockQuery({ data: wordRows, error: null });
      return mockQuery({ data: [], error: null });
    },
  };
}

const VOCAB_ROWS = [
  { display_order: 0, english: 'Market', chinese: '市场', pinyin: 'shìchǎng' },
  { display_order: 1, english: 'How much?', chinese: '多少钱？', pinyin: 'duōshao qián' },
  { display_order: 2, english: 'Too expensive', chinese: '太贵了', pinyin: 'tài guì le' },
  { display_order: 3, english: 'Discount', chinese: '打折', pinyin: 'dǎzhé' },
  { display_order: 4, english: 'Fresh', chinese: '新鲜', pinyin: 'xīnxiān' },
  { display_order: 5, english: 'Bargain', chinese: '还价', pinyin: 'huánjià' },
];

const WORD_ROWS = [
  { id: 1, expression: '市场', reading: 'shìchǎng', meaning: 'Market' },
  { id: 2, expression: '多少钱？', reading: 'duōshao qián', meaning: 'How much?' },
  { id: 3, expression: '太贵了', reading: 'tài guì le', meaning: 'Too expensive' },
  { id: 4, expression: '打折', reading: 'dǎzhé', meaning: 'Discount' },
  { id: 5, expression: '新鲜', reading: 'xīnxiān', meaning: 'Fresh' },
  { id: 6, expression: '还价', reading: 'huánjià', meaning: 'Bargain' },
];

let dbWrapperCounter = 0;
async function importFreshGrowingTarget(db) {
  dbWrapperCounter++;
  mock.module(new URL('../lib/db/db.js', import.meta.url).href, {
    namedExports: { db },
  });
  return import(`../lib/graph/growingTarget.js?growingTargetTest=${dbWrapperCounter}`);
}

test('getGrowingTargetState: empty scenario vocab returns zeroed state without throwing', async () => {
  const db = makeDb({ vocabRows: [] });
  const { getGrowingTargetState } = await importFreshGrowingTarget(db);

  const result = await getGrowingTargetState({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'empty-scenario',
  });

  assert.deepEqual(result.targetWords, []);
  assert.equal(result.scenarioComplete, false);
  assert.equal(result.windowSize, 0);
  assert.equal(result.essentialCount, 0);
});

test('getGrowingTargetState: no grants → initial window of 2 words returned', async () => {
  const db = makeDb({ grantRows: [], vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getGrowingTargetState } = await importFreshGrowingTarget(db);

  const result = await getGrowingTargetState({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  assert.equal(result.targetWords.length, INITIAL_TARGET_SIZE);
  assert.equal(result.targetWords[0].expression, '市场');
  assert.equal(result.targetWords[1].expression, '多少钱？');
  assert.equal(result.scenarioComplete, false);
});

test('getGrowingTargetState: with 1 attestation → window grows, attested word excluded', async () => {
  const grantRows = [{ used_word_ids: [1] }]; // 市场 (id=1) attested
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getGrowingTargetState } = await importFreshGrowingTarget(db);

  const result = await getGrowingTargetState({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  assert.equal(result.windowSize, INITIAL_TARGET_SIZE + 1 * GROW_PER_ATTEST); // 4
  const exprs = result.targetWords.map((w) => w.expression);
  assert.ok(!exprs.includes('市场'), '市场 is attested and must not appear');
  assert.ok(exprs.includes('多少钱？'), '多少钱？ must be present');
  assert.equal(result.scenarioComplete, false);
});

test('getGrowingTargetState: 4 essential words attested → scenarioComplete=true', async () => {
  // essentialCount = ceil(6 * 2/3) = 4; attest ids 1,2,3,4.
  const grantRows = [{ used_word_ids: [1, 2, 3, 4] }];
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getGrowingTargetState } = await importFreshGrowingTarget(db);

  const result = await getGrowingTargetState({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  assert.equal(result.scenarioComplete, true);
  // Window is capped at 6; only w4 (新鲜, id=5) and w5 (还价, id=6) remain un-attested.
  const exprs = result.targetWords.map((w) => w.expression);
  assert.ok(exprs.includes('新鲜'));
  assert.ok(exprs.includes('还价'));
});

test('getGrowingTargetState: unknown country code returns zeroed state (no wrong-language ids)', async () => {
  // Regression test for the catalog-gating bug. If resolveLangCode returns null
  // and we still query learning_words without `.eq('language', ...)`, rows from
  // any language with a matching expression would flow through. The wrapper
  // must short-circuit instead.
  let learningWordsQueried = false;
  const baseDb = makeDb({ grantRows: [], vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const db = {
    from(table) {
      if (table === 'learning_words') learningWordsQueried = true;
      return baseDb.from(table);
    },
  };
  const { getGrowingTargetState } = await importFreshGrowingTarget(db);

  const result = await getGrowingTargetState({
    userId: 'user-1',
    countryCode: 'zz-unknown',
    scenarioId: 'street-market',
  });

  assert.deepEqual(result.targetWords, []);
  assert.equal(result.scenarioComplete, false);
  assert.equal(result.windowSize, 0);
  assert.equal(result.essentialCount, 0);
  assert.equal(learningWordsQueried, false, 'learning_words must not be queried without a language filter');
});

test('getGrowingTargetState: grants from multiple turns are unioned', async () => {
  // Two separate grant rows, one for each turn.
  const grantRows = [{ used_word_ids: [1] }, { used_word_ids: [2] }];
  const db = makeDb({ grantRows, vocabRows: VOCAB_ROWS, wordRows: WORD_ROWS });
  const { getGrowingTargetState } = await importFreshGrowingTarget(db);

  const result = await getGrowingTargetState({
    userId: 'user-1',
    countryCode: 'china',
    scenarioId: 'street-market',
  });

  const exprs = result.targetWords.map((w) => w.expression);
  assert.ok(!exprs.includes('市场'), 'attested in turn 0');
  assert.ok(!exprs.includes('多少钱？'), 'attested in turn 1');
  assert.equal(result.windowSize, INITIAL_TARGET_SIZE + 2 * GROW_PER_ATTEST); // 6
});

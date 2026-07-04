import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __setForestDepsForTests,
  getForestProfile,
  getMemoryTools,
  getStaleWords,
  recordMasteryEvent,
  recordSituationClear,
} from '../lib/memory/forest.js';

const USER_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const USER_B = 'bbbbbbbb-5555-6666-7777-888888888888';

function makeStubs({ addImpl, profileImpl, rows = [], tiers = {} } = {}) {
  const calls = { add: [], profile: [], upserts: [], tools: [], listedFor: [] };
  __setForestDepsForTests({
    getClient: () => ({
      add: async (params) => {
        calls.add.push(params);
        if (addImpl) return addImpl(params);
        return { id: 'mem_1' };
      },
      profile: async (params) => {
        calls.profile.push(params);
        if (profileImpl) return profileImpl(params);
        return { profile: { static: [], dynamic: [] } };
      },
    }),
    supermemoryTools: (apiKey, config) => {
      calls.tools.push({ apiKey, config });
      return { searchMemories: {}, addMemory: {} };
    },
    upsertForestRow: async (row) => {
      calls.upserts.push(row);
    },
    getForestTier: async (userId, wordId) => tiers[`${userId}:${wordId}`] ?? null,
    listForestRows: async (userId) => {
      calls.listedFor.push(userId);
      return rows;
    },
  });
  return calls;
}

test.afterEach(() => __setForestDepsForTests(null));

const MASTERY_EVENT = {
  wordId: 42,
  expression: '苹果',
  language: 'zh',
  superset: 'food & stuff',
  scenarioId: 'market-1',
  rating: 4,
};

test('every Supermemory call is scoped to the calling user and tags never cross', async () => {
  const calls = makeStubs();

  await recordMasteryEvent(USER_A, MASTERY_EVENT);
  await recordSituationClear(USER_B, { scenarioId: 'market-1', superset: 'food & stuff', countryCode: 'china' });
  await getForestProfile(USER_A);
  await getStaleWords(USER_B, { limit: 5 });

  assert.deepEqual(calls.add.map((c) => c.containerTag), [`user_${USER_A}`, `user_${USER_B}`]);
  assert.deepEqual(calls.profile.map((c) => c.containerTag), [`user_${USER_A}`, `user_${USER_B}`]);
  for (const call of [...calls.add, ...calls.profile]) {
    assert.match(call.containerTag, /^user_[0-9a-f-]+$/);
  }
  // A call issued for user A must never carry user B's tag.
  assert.ok(!calls.add.some((c, i) => i === 0 && c.containerTag.includes(USER_B)));
  assert.ok(!calls.profile.some((c, i) => i === 0 && c.containerTag.includes(USER_B)));
});

test('getMemoryTools scopes supermemoryTools to exactly the caller containerTag', () => {
  const calls = makeStubs();
  getMemoryTools(USER_A);
  getMemoryTools(USER_B);
  assert.deepEqual(calls.tools[0].config, { containerTags: [`user_${USER_A}`] });
  assert.deepEqual(calls.tools[1].config, { containerTags: [`user_${USER_B}`] });
});

test('userId is mandatory — no unscoped call path exists', async () => {
  const calls = makeStubs();
  await assert.rejects(() => recordMasteryEvent('', MASTERY_EVENT), TypeError);
  await assert.rejects(() => recordSituationClear(undefined, { scenarioId: 's', superset: 't', countryCode: 'c' }), TypeError);
  await assert.rejects(() => getForestProfile(null), TypeError);
  await assert.rejects(() => getStaleWords(''), TypeError);
  assert.throws(() => getMemoryTools(''), TypeError);
  assert.equal(calls.add.length + calls.profile.length + calls.tools.length, 0);
});

test('recordMasteryEvent dual-writes: mirror row and Supermemory memory in one codepath', async () => {
  const calls = makeStubs({ tiers: { [`${USER_A}:42`]: 1 } });

  await recordMasteryEvent(USER_A, MASTERY_EVENT);

  // Mirror row matches learning_user_word_forest shape; rating 4 bumps tier 1 -> 2.
  assert.equal(calls.upserts.length, 1);
  const row = calls.upserts[0];
  assert.equal(row.user_id, USER_A);
  assert.equal(row.word_id, 42);
  assert.equal(row.superset, 'food & stuff');
  assert.equal(row.mastery_tier, 2);
  assert.ok(!Number.isNaN(Date.parse(row.last_used_at)));
  assert.ok(!Number.isNaN(Date.parse(row.updated_at)));

  // Supermemory memory written with the same event, scoped to the user.
  assert.equal(calls.add.length, 1);
  assert.equal(calls.add[0].containerTag, `user_${USER_A}`);
  assert.ok(calls.add[0].content.includes('苹果'));
  assert.ok(calls.add[0].content.includes('market-1'));
  assert.equal(calls.add[0].metadata.type, 'mastery_event');
});

test('a lapse (rating < 3) lowers the mirror tier with a floor of zero', async () => {
  const calls = makeStubs(); // no prior tier -> 0
  await recordMasteryEvent(USER_A, { ...MASTERY_EVENT, rating: 1 });
  assert.equal(calls.upserts[0].mastery_tier, 0);
});

test('mirror write survives a Supermemory outage (graceful degradation on write)', async () => {
  const calls = makeStubs({ addImpl: () => Promise.reject(new Error('supermemory down')) });

  // Must not throw, and the mirror row must still land.
  await recordMasteryEvent(USER_A, MASTERY_EVENT);
  assert.equal(calls.upserts.length, 1);
  assert.equal(calls.upserts[0].user_id, USER_A);

  await recordSituationClear(USER_A, { scenarioId: 'market-1', superset: 'food & stuff', countryCode: 'china' });
});

test('getForestProfile merges profile() with mirror trees, and degrades to mirror-only on outage', async () => {
  const rows = [
    { wordId: 1, expression: '苹果', language: 'zh', superset: 'food & stuff', masteryTier: 2, lastUsed: '2026-07-01T00:00:00Z' },
    { wordId: 2, expression: '面包', language: 'zh', superset: 'food & stuff', masteryTier: 1, lastUsed: '2026-06-01T00:00:00Z' },
    { wordId: 3, expression: '车票', language: 'zh', superset: 'getting around', masteryTier: 0, lastUsed: null },
  ];
  makeStubs({
    rows,
    profileImpl: () => ({ profile: { static: ['Mastered 苹果'], dynamic: ['Practicing 面包'] } }),
  });
  assert.deepEqual(await getForestProfile(USER_A), {
    mastered: ['Mastered 苹果'],
    currentCycle: ['Practicing 面包'],
    trees: { 'food & stuff': ['苹果', '面包'], 'getting around': ['车票'] },
  });

  // Outage: profile() rejects, trees still come from the mirror.
  makeStubs({ rows, profileImpl: () => Promise.reject(new Error('supermemory down')) });
  assert.deepEqual(await getForestProfile(USER_A), {
    mastered: [],
    currentCycle: [],
    trees: { 'food & stuff': ['苹果', '面包'], 'getting around': ['车票'] },
  });
});

test('getStaleWords: absent from profile().dynamic AND old (or never) last_used_at, oldest first', async () => {
  const now = Date.now();
  const days = (n) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();
  const rows = [
    // In the current cycle -> never stale, even though it is old.
    { wordId: 1, expression: '面包', language: 'zh', superset: 'food & stuff', masteryTier: 1, lastUsed: days(30) },
    // Used yesterday -> fresh.
    { wordId: 2, expression: '苹果', language: 'zh', superset: 'food & stuff', masteryTier: 2, lastUsed: days(1) },
    // Absent from dynamic and 10 days old -> stale.
    { wordId: 3, expression: '车票', language: 'zh', superset: 'getting around', masteryTier: 1, lastUsed: days(10) },
    // Planted but never used -> stalest of all.
    { wordId: 4, expression: '旅馆', language: 'zh', superset: 'getting around', masteryTier: 0, lastUsed: null },
    // Absent from dynamic and 20 days old -> stale, older than 车票.
    { wordId: 5, expression: '咖啡', language: 'zh', superset: 'food & stuff', masteryTier: 1, lastUsed: days(20) },
  ];
  makeStubs({
    rows,
    profileImpl: () => ({ profile: { static: [], dynamic: ['Currently practicing 面包 at the bakery'] } }),
  });

  const stale = await getStaleWords(USER_A, { limit: 10 });
  assert.deepEqual(stale.map((w) => w.expression), ['旅馆', '咖啡', '车票']);
  assert.deepEqual(stale[2], { wordId: 3, expression: '车票', language: 'zh', lastUsed: rows[2].lastUsed });

  // Limit is respected.
  const limited = await getStaleWords(USER_A, { limit: 1 });
  assert.deepEqual(limited.map((w) => w.expression), ['旅馆']);
});

test('getStaleWords still derives from the mirror when profile() errors', async () => {
  const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  makeStubs({
    rows: [{ wordId: 9, expression: '出租车', language: 'zh', superset: 'getting around', masteryTier: 1, lastUsed: old }],
    profileImpl: () => Promise.reject(new Error('supermemory down')),
  });
  const stale = await getStaleWords(USER_A);
  assert.deepEqual(stale, [{ wordId: 9, expression: '出租车', language: 'zh', lastUsed: old }]);
});

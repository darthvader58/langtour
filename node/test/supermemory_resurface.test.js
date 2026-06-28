// Tests for node/lib/supermemory/resurface.js
//
// All Supermemory network calls are stubbed with mock.module so no real API
// traffic happens. The containerTag validation (userTag()) is NOT stubbed —
// we verify that non-UUID input throws before any network code is reached.

import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => mock.restoreAll());

// Set env vars before any lib module load; supermemoryClient() reads
// SUPERMEMORY_API_KEY via config.js (dotenv-loaded). We supply a fake key so
// requireApiKey() doesn't throw in tests that do reach the client constructor.
process.env.SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || 'test-sm-key';
// db.js transitively required by index.js — supply placeholders.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-srk';

const VALID_UUID = '3f9a2c10-7e4b-4a3d-9c1e-8b2f1a6d5c44';
const NOW = new Date('2026-06-28T12:00:00Z');
const MIN_IDLE_HOURS = 48;

const CLIENT_URL = new URL('../lib/supermemory/client.js', import.meta.url).href;

// Each test imports a fresh resurface.js to pick up its own client.js mock.
let importCtr = 0;
async function freshResurface() {
  importCtr += 1;
  return import(`../lib/supermemory/resurface.js?v=${importCtr}`);
}

// Build a fake document as `documents.list` would return it.
function makeDoc(expression, meaning, lastUsedAt) {
  return {
    id: `doc-${expression}`,
    customId: `word:zh:${expression}`,
    content: JSON.stringify({
      kind: 'word',
      lang: 'zh',
      id: `word:zh:${expression}`,
      parent_id: 'sit-food-1',
      label: expression,
      expression,
      meaning,
      last_used_at: lastUsedAt,
    }),
    status: 'processed',
    metadata: { kind: 'word', lang: 'zh', parent_id: 'sit-food-1' },
    createdAt: lastUsedAt,
    updatedAt: lastUsedAt,
  };
}

// > 48 hours before NOW
function staleTs(hoursAgo = 72) {
  return new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
}

// < 48 hours before NOW
function recentTs(hoursAgo = 10) {
  return new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
}

function mockClient(listResponse) {
  mock.module(CLIENT_URL, {
    namedExports: {
      supermemoryClient: () => ({
        documents: { list: async () => listResponse },
      }),
      memoryTools: () => ({}),
      createSupermemoryInfiniteChat: () => () => ({}),
    },
  });
}

// ─── Test: empty documents → [] ────────────────────────────────────────────

test('empty document list returns []', async () => {
  mockClient({ documents: [], total: 0 });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.deepEqual(result, []);
});

test('null/undefined document list returns []', async () => {
  mockClient(null);
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.deepEqual(result, []);
});

// ─── Test: recent entries filtered out ─────────────────────────────────────

test('entry updated within minIdleHours is filtered out', async () => {
  mockClient({ documents: [makeDoc('你好', 'hello', recentTs())], total: 1 });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.deepEqual(result, []);
});

test('entry updated exactly at the cutoff boundary is filtered out (>= not >)', async () => {
  // Exactly 48 h ago = cutoff boundary; should be excluded.
  const exactly48h = new Date(NOW.getTime() - MIN_IDLE_HOURS * 3_600_000).toISOString();
  mockClient({ documents: [makeDoc('再见', 'goodbye', exactly48h)], total: 1 });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.deepEqual(result, []);
});

test('mix of stale and recent: only stale entries are returned', async () => {
  mockClient({
    documents: [
      makeDoc('你好', 'hello', staleTs(72)),
      makeDoc('谢谢', 'thank you', recentTs(5)),
      makeDoc('再见', 'goodbye', staleTs(96)),
    ],
    total: 3,
  });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.equal(result.length, 2);
  const expressions = result.map((w) => w.expression);
  assert.ok(expressions.includes('你好'));
  assert.ok(expressions.includes('再见'));
  assert.ok(!expressions.includes('谢谢'));
});

// ─── Test: sorted ascending + capped at max ─────────────────────────────────

test('stale entries are sorted ascending by lastUsedAt (stalest first)', async () => {
  // API returns them in arbitrary order; we verify in-memory sort.
  mockClient({
    documents: [
      makeDoc('c', 'c-meaning', staleTs(120)), // oldest
      makeDoc('a', 'a-meaning', staleTs(60)),   // newest stale
      makeDoc('b', 'b-meaning', staleTs(96)),   // middle
    ],
    total: 3,
  });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS, max: 5 });
  assert.equal(result.length, 3);
  assert.equal(result[0].expression, 'c'); // 120h ago = stalest
  assert.equal(result[1].expression, 'b'); // 96h ago
  assert.equal(result[2].expression, 'a'); // 60h ago = newest
});

test('result is capped at max even when more stale entries exist', async () => {
  const docs = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((w, i) =>
    makeDoc(w, `${w}-meaning`, staleTs(60 + i * 10))
  );
  mockClient({ documents: docs, total: docs.length });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS, max: 3 });
  assert.equal(result.length, 3);
});

test('DueWord shape matches contract-03 exactly', async () => {
  const ts = staleTs(72);
  mockClient({ documents: [makeDoc('你好', 'hello', ts)], total: 1 });
  const { getDueForResurfacing } = await freshResurface();
  const [word] = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS, max: 1 });
  assert.ok(word, 'expected one result');
  assert.equal(typeof word.expression, 'string');
  assert.equal(typeof word.meaning, 'string');
  assert.equal(typeof word.lastUsedAt, 'string');
  // Must not leak internal _ts field
  assert.ok(!('_ts' in word), 'internal _ts must be stripped from output');
  assert.equal(word.expression, '你好');
  assert.equal(word.meaning, 'hello');
  assert.equal(word.lastUsedAt, ts);
});

// ─── Test: Supermemory error → [] not throw ─────────────────────────────────

test('Supermemory client constructor throws → returns [] without re-throwing', async () => {
  mock.module(CLIENT_URL, {
    namedExports: {
      supermemoryClient: () => { throw new Error('SM unavailable'); },
      memoryTools: () => ({}),
      createSupermemoryInfiniteChat: () => () => ({}),
    },
  });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.deepEqual(result, []);
});

test('documents.list() rejects → returns [] without re-throwing', async () => {
  mock.module(CLIENT_URL, {
    namedExports: {
      supermemoryClient: () => ({
        documents: { list: async () => { throw new Error('network error'); } },
      }),
      memoryTools: () => ({}),
      createSupermemoryInfiniteChat: () => () => ({}),
    },
  });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.deepEqual(result, []);
});

// ─── Test: non-UUID userId → throws before any network ──────────────────────

test('non-UUID userId throws synchronously before any network call', async () => {
  // We don't mock the client; if network were reached the test would fail
  // for a different reason. userTag() throws before the try/catch in the impl.
  const { getDueForResurfacing } = await freshResurface();
  await assert.rejects(
    () => getDueForResurfacing('not-a-uuid', { now: NOW }),
    /expected a UUID/
  );
  await assert.rejects(
    () => getDueForResurfacing('', { now: NOW }),
    /expected a UUID/
  );
  await assert.rejects(
    () => getDueForResurfacing(null, { now: NOW }),
    /expected a UUID/
  );
});

// ─── Test: content without last_used_at falls back to updatedAt/createdAt ───

test('falls back to doc.updatedAt when content.last_used_at is absent', async () => {
  const ts = staleTs(72);
  // Strip last_used_at from the node JSON to test the fallback path.
  const docWithoutLastUsed = {
    id: 'doc-fallback',
    customId: 'word:zh:飞机',
    content: JSON.stringify({ kind: 'word', lang: 'zh', id: 'word:zh:飞机', parent_id: 'sit-1', label: '飞机', expression: '飞机', meaning: 'airplane' }),
    status: 'processed',
    metadata: { kind: 'word', lang: 'zh', parent_id: 'sit-1' },
    createdAt: ts,
    updatedAt: ts,
  };
  mockClient({ documents: [docWithoutLastUsed], total: 1 });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.equal(result.length, 1);
  assert.equal(result[0].expression, '飞机');
  assert.equal(result[0].lastUsedAt, ts);
});

test('entries without parseable content and without expression in metadata are skipped', async () => {
  const badDoc = {
    id: 'doc-bad',
    customId: 'word:zh:bad',
    content: 'not-json-at-all',
    status: 'processed',
    metadata: { kind: 'word', lang: 'zh' }, // no expression
    createdAt: staleTs(72),
    updatedAt: staleTs(72),
  };
  mockClient({ documents: [badDoc], total: 1 });
  const { getDueForResurfacing } = await freshResurface();
  const result = await getDueForResurfacing(VALID_UUID, { now: NOW, minIdleHours: MIN_IDLE_HOURS });
  assert.deepEqual(result, []);
});

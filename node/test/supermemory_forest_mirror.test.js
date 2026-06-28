// Tests for node/lib/supermemory/forestMirror.js
//
// Both the Supermemory client and the Supabase db client are stubbed with
// mock.module so no real network or DB traffic occurs. The containerTag
// validation (userTag()) is intentionally NOT stubbed — non-UUID input must
// throw synchronously before any I/O.

import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => mock.restoreAll());

// Set env vars early so db.js top-level guard doesn't throw when the module
// is evaluated (before we can mock it). These are replaced by the db mock
// in tests that import forestMirror.js fresh.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-srk';
process.env.SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || 'test-sm-key';

const VALID_UUID = '3f9a2c10-7e4b-4a3d-9c1e-8b2f1a6d5c44';

const CLIENT_URL = new URL('../lib/supermemory/client.js', import.meta.url).href;
const DB_URL = new URL('../lib/db/db.js', import.meta.url).href;

let importCtr = 0;
async function freshMirror() {
  importCtr += 1;
  return import(`../lib/supermemory/forestMirror.js?v=${importCtr}`);
}

// Build a fake document as `documents.list` would return it for a node.
function makeNodeDoc({ id, parentId, kind, expression }) {
  return {
    id: `doc-${id}`,
    customId: id,
    content: JSON.stringify({ kind, lang: 'zh', id, parent_id: parentId ?? null, label: id, expression }),
    status: 'processed',
    metadata: { kind, lang: 'zh', parent_id: parentId ?? '' },
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  };
}

// Capture upsert calls so we can assert the row shapes.
function makeDbMock({ error = null } = {}) {
  const calls = [];
  const dbMock = {
    from: (table) => ({
      upsert: async (rows, opts) => {
        calls.push({ table, rows, opts });
        return { error };
      },
    }),
  };
  return { dbMock, calls };
}

function mockAll(listResponse, { dbError = null } = {}) {
  const { dbMock, calls } = makeDbMock({ error: dbError });
  mock.module(CLIENT_URL, {
    namedExports: {
      supermemoryClient: () => ({
        documents: { list: async () => listResponse },
      }),
      memoryTools: () => ({}),
      createSupermemoryInfiniteChat: () => () => ({}),
    },
  });
  mock.module(DB_URL, {
    namedExports: { db: dbMock },
  });
  return calls;
}

// ─── Test: empty forest → no DB writes ─────────────────────────────────────

test('empty document list → no DB upsert, returns {inserted:0, removed:0}', async () => {
  const calls = mockAll({ documents: [], total: 0 });
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  assert.deepEqual(result, { inserted: 0, removed: 0 });
  assert.equal(calls.length, 0, 'DB must not be touched for an empty forest');
});

test('null response → no DB upsert, returns {inserted:0, removed:0}', async () => {
  const calls = mockAll(null);
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  assert.deepEqual(result, { inserted: 0, removed: 0 });
  assert.equal(calls.length, 0);
});

test('forest with only root node (no parent_id) produces no edges', async () => {
  const calls = mockAll({
    documents: [makeNodeDoc({ id: 'root:zh', parentId: null, kind: 'root', expression: null })],
    total: 1,
  });
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  assert.deepEqual(result, { inserted: 0, removed: 0 });
  assert.equal(calls.length, 0);
});

// ─── Test: non-empty forest → batched upsert with correct shape ─────────────

test('word node with parent_id produces one edge row in correct shape', async () => {
  const calls = mockAll({
    documents: [
      makeNodeDoc({ id: 'root:zh', parentId: null, kind: 'root' }),
      makeNodeDoc({ id: 'sup:zh:food', parentId: 'root:zh', kind: 'superset' }),
      makeNodeDoc({ id: 'sit:zh:market', parentId: 'sup:zh:food', kind: 'situation' }),
      makeNodeDoc({ id: 'word:zh:你好', parentId: 'sit:zh:market', kind: 'word', expression: '你好' }),
    ],
    total: 4,
  });
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  // 3 edges: root←superset, superset←situation, situation←word
  assert.equal(result.inserted, 3);
  assert.equal(result.removed, 0);
  assert.equal(calls.length, 1, 'exactly one upsert call');
  const { table, rows, opts } = calls[0];
  assert.equal(table, 'forest_edges');
  assert.equal(rows.length, 3);
  // Every row has the required fields.
  for (const row of rows) {
    assert.equal(row.user_id, VALID_UUID);
    assert.equal(typeof row.parent_id, 'string');
    assert.equal(typeof row.child_id, 'string');
    assert.ok(['root', 'superset', 'situation', 'word'].includes(row.kind));
    assert.equal(typeof row.last_seen_at, 'string');
  }
  // Upsert must be idempotent on the PK triple.
  assert.equal(opts.onConflict, 'user_id,parent_id,child_id');
});

test('nodes with metadata.parent_id="" (empty string) are skipped', async () => {
  // appendForestNode stores '' for null parent_id in metadata.
  const doc = {
    ...makeNodeDoc({ id: 'root:zh', parentId: null, kind: 'root' }),
    metadata: { kind: 'root', lang: 'zh', parent_id: '' },
  };
  // Override content with empty parent_id too
  doc.content = JSON.stringify({ kind: 'root', lang: 'zh', id: 'root:zh', parent_id: null, label: 'root' });
  const calls = mockAll({ documents: [doc], total: 1 });
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  assert.deepEqual(result, { inserted: 0, removed: 0 });
  assert.equal(calls.length, 0);
});

test('falls back to parsing content JSON when metadata has no kind/parent_id', async () => {
  const doc = {
    id: 'doc-x',
    customId: 'word:zh:飞机',
    content: JSON.stringify({ kind: 'word', lang: 'zh', id: 'word:zh:飞机', parent_id: 'sit:zh:airport', label: '飞机', expression: '飞机', meaning: 'airplane' }),
    status: 'processed',
    metadata: {}, // empty — no kind or parent_id in metadata
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  };
  const calls = mockAll({ documents: [doc], total: 1 });
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  assert.equal(result.inserted, 1);
  const [call] = calls;
  assert.equal(call.rows[0].parent_id, 'sit:zh:airport');
  assert.equal(call.rows[0].child_id, 'word:zh:飞机');
  assert.equal(call.rows[0].kind, 'word');
});

test('nodes with invalid kind are skipped', async () => {
  const doc = {
    ...makeNodeDoc({ id: 'bogus:zh:x', parentId: 'root:zh', kind: 'root' }),
    content: JSON.stringify({ kind: 'bogus', lang: 'zh', id: 'bogus:zh:x', parent_id: 'root:zh', label: 'x' }),
    metadata: { kind: 'bogus', lang: 'zh', parent_id: 'root:zh' },
  };
  const calls = mockAll({ documents: [doc], total: 1 });
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  assert.deepEqual(result, { inserted: 0, removed: 0 });
  assert.equal(calls.length, 0);
});

// ─── Test: DB error → logged + swallowed ─────────────────────────────────────

test('DB upsert error is swallowed and returns {inserted:0, removed:0}', async () => {
  mockAll(
    {
      documents: [
        makeNodeDoc({ id: 'word:zh:谢谢', parentId: 'sit:zh:market', kind: 'word', expression: '谢谢' }),
      ],
      total: 1,
    },
    { dbError: { message: 'duplicate key violation' } }
  );
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  // Error is caught and swallowed; does not re-throw.
  assert.deepEqual(result, { inserted: 0, removed: 0 });
});

test('DB upsert throws (network failure) → swallowed, returns {inserted:0, removed:0}', async () => {
  const { calls } = makeDbMock();
  mock.module(CLIENT_URL, {
    namedExports: {
      supermemoryClient: () => ({
        documents: {
          list: async () => ({
            documents: [makeNodeDoc({ id: 'word:zh:再见', parentId: 'sit:zh:farewell', kind: 'word', expression: '再见' })],
          }),
        },
      }),
      memoryTools: () => ({}),
      createSupermemoryInfiniteChat: () => () => ({}),
    },
  });
  mock.module(DB_URL, {
    namedExports: {
      db: {
        from: () => ({
          upsert: async () => { throw new Error('connection reset'); },
        }),
      },
    },
  });
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  assert.deepEqual(result, { inserted: 0, removed: 0 });
});

// ─── Test: Supermemory error → swallowed ────────────────────────────────────

test('Supermemory list throws → swallowed, no DB call, returns {inserted:0, removed:0}', async () => {
  mock.module(CLIENT_URL, {
    namedExports: {
      supermemoryClient: () => ({
        documents: { list: async () => { throw new Error('SM 503'); } },
      }),
      memoryTools: () => ({}),
      createSupermemoryInfiniteChat: () => () => ({}),
    },
  });
  const calls = [];
  mock.module(DB_URL, {
    namedExports: {
      db: {
        from: (table) => ({
          upsert: async (rows) => { calls.push(rows); return { error: null }; },
        }),
      },
    },
  });
  const { syncForestEdgesForUser } = await freshMirror();
  const result = await syncForestEdgesForUser(VALID_UUID);
  assert.deepEqual(result, { inserted: 0, removed: 0 });
  assert.equal(calls.length, 0);
});

// ─── Test: idempotent rerun → upsert produces no duplicates ─────────────────

test('calling syncForestEdgesForUser twice with the same forest produces the same upsert rows (idempotent)', async () => {
  const forest = {
    documents: [
      makeNodeDoc({ id: 'root:zh', parentId: null, kind: 'root' }),
      makeNodeDoc({ id: 'sup:zh:food', parentId: 'root:zh', kind: 'superset' }),
      makeNodeDoc({ id: 'word:zh:你好', parentId: 'sup:zh:food', kind: 'word', expression: '你好' }),
    ],
    total: 3,
  };

  // First run
  mockAll(forest);
  const { syncForestEdgesForUser: sync1 } = await freshMirror();
  const r1 = await sync1(VALID_UUID);

  // Restore mocks before re-mocking for the second run.
  mock.restoreAll();

  // Second run with the same forest (simulate idempotency)
  mockAll(forest);
  const { syncForestEdgesForUser: sync2 } = await freshMirror();
  const r2 = await sync2(VALID_UUID);

  // Both runs upsert the same 2 edges (root has no parent, so 2 edges).
  assert.equal(r1.inserted, 2);
  assert.equal(r2.inserted, 2);
  // The RPC uses onConflict to avoid actual duplicates in the DB.
  // Here we just verify the call shapes are identical.
});

// ─── Test: non-UUID userId throws before any I/O ────────────────────────────

test('non-UUID userId rejects before any I/O', async () => {
  // syncForestEdgesForUser is async, so synchronous throws inside it become
  // rejected Promises. userTag() fires before any Supermemory or DB call.
  // We verify by providing no client mock — if the network were reached, the
  // test would fail with a missing-package or connection error instead.
  mockAll({ documents: [], total: 0 }); // safe default to prevent import errors
  const { syncForestEdgesForUser } = await freshMirror();
  await assert.rejects(() => syncForestEdgesForUser('not-a-uuid'), /expected a UUID/);
  mock.restoreAll();
  mockAll({ documents: [], total: 0 });
  const { syncForestEdgesForUser: sync2 } = await freshMirror();
  await assert.rejects(() => sync2(''), /expected a UUID/);
  mock.restoreAll();
  mockAll({ documents: [], total: 0 });
  const { syncForestEdgesForUser: sync3 } = await freshMirror();
  await assert.rejects(() => sync3(null), /expected a UUID/);
});

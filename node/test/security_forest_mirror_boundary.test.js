// Security audit — forestMirror user_id boundary (vector 2).
//
// node/lib/supermemory/forestMirror.js writes to the public.forest_edges table
// using the service-role db client.  Anti-cross-tenant invariants:
//
//   1. The user_id stamped on every row comes exclusively from the function's
//      validated argument — never from the Supermemory document payload,
//      never from doc.metadata, never from any client-controlled value.
//   2. Non-UUID userId is rejected synchronously before any I/O.
//   3. The forest_edges table is RLS-gated: only SELECT is policy-allowed for
//      authenticated; writes only flow through the service-role client.
//   4. Documents whose customId/parent_id contain attacker-injected userId
//      strings (e.g. "user_<otheruuid>:word") do not contaminate the user_id
//      column.  parent_id/child_id are scoped to the *forest topology*, not
//      to user identity.
//
// These guard against a future regression where, say, someone reads user_id
// from doc.metadata.owner_id or similar.

import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => mock.restoreAll());

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-srk';
process.env.SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || 'test-sm-key';

const CALLER_UUID  = '11111111-1111-1111-1111-111111111111';
const VICTIM_UUID  = '22222222-2222-2222-2222-222222222222';

const CLIENT_URL = new URL('../lib/supermemory/client.js', import.meta.url).href;
const DB_URL     = new URL('../lib/db/db.js', import.meta.url).href;

let importCtr = 0;
async function freshMirror() {
  importCtr += 1;
  return import(`../lib/supermemory/forestMirror.js?secV=${importCtr}`);
}

function captureDb() {
  const calls = [];
  return {
    calls,
    db: {
      from: () => ({
        upsert: async (rows, opts) => { calls.push({ rows, opts }); return { error: null }; },
      }),
    },
  };
}

function mockSm(documents) {
  mock.module(CLIENT_URL, {
    namedExports: {
      supermemoryClient: () => ({ documents: { list: async () => ({ documents }) } }),
      memoryTools: () => ({}),
      createSupermemoryInfiniteChat: () => () => ({}),
    },
  });
}

// ── 1. user_id stamped on every row equals the validated function argument ──

test('user_id on every upserted row equals the caller-supplied userId, not anything in the document', async () => {
  // Document payloads include strings that look like other users' ids in
  // various fields.  None must leak into row.user_id.
  const doc = {
    id: 'doc-1',
    customId: `word:zh:user_${VICTIM_UUID}:你好`,        // attacker-shaped child_id
    content: JSON.stringify({
      kind: 'word', lang: 'zh',
      id: `word:zh:user_${VICTIM_UUID}:你好`,
      parent_id: `sit:zh:user_${VICTIM_UUID}:market`,    // attacker-shaped parent_id
      label: '你好', expression: '你好',
      // Field a future regression might naively trust:
      owner_id: VICTIM_UUID,
      user_id: VICTIM_UUID,
    }),
    metadata: {
      kind: 'word', lang: 'zh',
      parent_id: `sit:zh:user_${VICTIM_UUID}:market`,
      // Another tempting "trusted" field:
      owner_user_id: VICTIM_UUID,
    },
  };

  const { calls, db } = captureDb();
  mockSm([doc]);
  mock.module(DB_URL, { namedExports: { db } });

  const { syncForestEdgesForUser } = await freshMirror();
  await syncForestEdgesForUser(CALLER_UUID);

  assert.equal(calls.length, 1, 'one upsert call');
  for (const row of calls[0].rows) {
    assert.equal(row.user_id, CALLER_UUID,
      'user_id must come from the validated function argument, not from any document field');
    assert.notEqual(row.user_id, VICTIM_UUID,
      'document-supplied user_id MUST NOT leak into the row');
  }
});

test('parent_id and child_id are taken from the document topology, not interpreted as identity', async () => {
  // Confirms parent_id / child_id ride through as forest-topology strings.
  // RLS on forest_edges keys SELECT by user_id, so the strings here cannot
  // be used to read another user's rows even if they look UUID-shaped.
  const doc = {
    id: 'doc-2',
    customId: 'word:zh:谢谢',
    content: JSON.stringify({
      kind: 'word', lang: 'zh',
      id: 'word:zh:谢谢', parent_id: 'sit:zh:thanks', label: '谢谢',
    }),
    metadata: { kind: 'word', lang: 'zh', parent_id: 'sit:zh:thanks' },
  };

  const { calls, db } = captureDb();
  mockSm([doc]);
  mock.module(DB_URL, { namedExports: { db } });

  const { syncForestEdgesForUser } = await freshMirror();
  await syncForestEdgesForUser(CALLER_UUID);

  assert.equal(calls[0].rows[0].parent_id, 'sit:zh:thanks');
  assert.equal(calls[0].rows[0].child_id, 'word:zh:谢谢');
  assert.equal(calls[0].rows[0].user_id, CALLER_UUID);
});

// ── 2. Non-UUID userId rejected synchronously ─────────────────────────────────

test('non-UUID userId throws before any Supermemory or DB call', async () => {
  // No mocks → if the network were reached, the test would error with a
  // mock-missing or connection error rather than the userTag UUID-shape
  // rejection.
  mockSm([]); // safe defaults so module loads cleanly
  mock.module(DB_URL, { namedExports: { db: captureDb().db } });
  const { syncForestEdgesForUser } = await freshMirror();
  for (const bad of [
    'not-a-uuid',
    '',
    null,
    undefined,
    `user_${CALLER_UUID}`,                    // already a tag, not a raw uuid
    { id: CALLER_UUID },                      // object spoof
    CALLER_UUID + '; DROP TABLE forest_edges',// SQL-shaped attempt (Supabase escapes but reject early anyway)
  ]) {
    await assert.rejects(() => syncForestEdgesForUser(bad), /expected a UUID/,
      `expected userTag rejection for input ${JSON.stringify(bad)}`);
  }
});

// ── 3. forest_edges write path uses the service-role db client ────────────────

test('forestMirror writes only to the forest_edges table and only via the imported db client', async () => {
  // Static read of the source: the only write surface is the upsert into
  // 'forest_edges'.  Any future change that adds a second write site (or
  // writes to a different table) should be a deliberate audited decision.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
  const src = fs.readFileSync(path.join(root, 'lib/supermemory/forestMirror.js'), 'utf8');

  const tableRefs = [...src.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(tableRefs, ['forest_edges'],
    'forestMirror.js must only touch the forest_edges table');

  const writeOps = [...src.matchAll(/\.\b(insert|update|upsert|delete)\b\s*\(/g)].map((m) => m[1]);
  assert.deepEqual(writeOps, ['upsert'],
    'forestMirror.js must only use the upsert write op (idempotent on the composite PK)');
});

// ── 4. forest_edges row-shape contract: exactly the audit-trail fields ────────

test('every upserted row has exactly the audit-relevant columns and no extras', async () => {
  const doc = {
    id: 'doc-3',
    customId: 'word:zh:再见',
    content: JSON.stringify({ kind: 'word', lang: 'zh', id: 'word:zh:再见', parent_id: 'sit:zh:bye' }),
    metadata: { kind: 'word', lang: 'zh', parent_id: 'sit:zh:bye' },
  };
  const { calls, db } = captureDb();
  mockSm([doc]);
  mock.module(DB_URL, { namedExports: { db } });
  const { syncForestEdgesForUser } = await freshMirror();
  await syncForestEdgesForUser(CALLER_UUID);

  for (const row of calls[0].rows) {
    assert.deepEqual(
      Object.keys(row).sort(),
      ['child_id', 'kind', 'last_seen_at', 'parent_id', 'user_id'],
      'row must contain exactly the expected audit columns — no payload spillover',
    );
  }

  assert.equal(calls[0].opts.onConflict, 'user_id,parent_id,child_id',
    'onConflict must scope idempotency to (user_id, parent_id, child_id)');
});

// ── 5. forest_edges RLS contract (audit via migration source) ─────────────────

test('forest_edges migration enables RLS and grants only SELECT to authenticated', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
  const mig = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260629000001_scenario_turn_grants.sql'),
    'utf8',
  );

  assert.match(mig, /create table public\.forest_edges/);
  assert.match(mig, /alter table public\.forest_edges enable row level security/);
  assert.match(mig, /create policy "Users can view their forest edges"\s+on public\.forest_edges for select to authenticated/);

  // Must NOT grant any client-side write policy. If a future migration adds
  // INSERT/UPDATE/DELETE for authenticated, this assertion catches it before
  // an attacker can forge another user's forest.
  const forbidden = /create policy[^;]+on public\.forest_edges for (insert|update|delete) to authenticated/i;
  assert.doesNotMatch(mig, forbidden,
    'forest_edges must have NO authenticated-role insert/update/delete policy');
});

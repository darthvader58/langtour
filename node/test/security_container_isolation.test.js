// Security audit — Supermemory containerTag isolation (vector 7).
//
// CLAUDE.md invariant: every per-user Supermemory operation is scoped to a
// containerTag derived strictly from a validated auth.users.id UUID via
// `userTag(userId)`. The tag MUST NOT come from a client-supplied request
// body / query / param value. Cross-tenant memory reads = privacy bug.
//
// What this suite locks:
//   1. userTag() rejects every non-UUID input (extends existing supermemory.test.js
//      with attacker-shaped inputs).
//   2. Every Supermemory wrapper that takes a userId validates it via userTag()
//      before any network call.
//   3. Static audit: every call site of the Supermemory wrappers passes
//      `req.userId` (set by requireUser from the JWT) — never req.body.*,
//      req.query.*, or req.params.*.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { userTag } from '../lib/supermemory/containerTag.js';

const NODE_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const VALID_UUID = '3f9a2c10-7e4b-4a3d-9c1e-8b2f1a6d5c44';

function walk(dir, accept) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'test') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, accept));
    else if (accept(entry.name)) out.push(full);
  }
  return out;
}

// ── 1. userTag() rejects attacker-shaped non-UUID inputs ──────────────────

test('userTag rejects a pre-built tag string (no client passthrough)', () => {
  // The threat: a client sends `containerTag: "user_<other-uuid>"` in some
  // future endpoint, and the route naively passes it through. The validator
  // must reject anything not shaped as a raw UUID.
  assert.throws(() => userTag(`user_${VALID_UUID}`), /expected a UUID/);
});

test('userTag rejects UUID-shaped strings with appended payloads', () => {
  for (const evil of [
    `${VALID_UUID}\nuser_22222222-2222-2222-2222-222222222222`,
    `${VALID_UUID} or 1=1`,
    `${VALID_UUID}'); DROP TABLE forest_edges; --`,
    `${VALID_UUID}/../user_22222222-2222-2222-2222-222222222222`,
  ]) {
    assert.throws(() => userTag(evil), /expected a UUID/,
      `expected userTag rejection for input ${JSON.stringify(evil)}`);
  }
});

test('userTag rejects array/object spoof inputs', () => {
  for (const evil of [
    [VALID_UUID],
    { toString: () => VALID_UUID },     // object that string-coerces to a UUID
    { id: VALID_UUID },
    Buffer.from(VALID_UUID, 'utf8'),
    Symbol(VALID_UUID),
  ]) {
    assert.throws(() => userTag(evil), /expected a UUID/,
      `expected userTag rejection for ${typeof evil} spoof`);
  }
});

test('userTag returns exactly the user_<uuid> shape — no leading/trailing whitespace coercion', () => {
  assert.equal(userTag(VALID_UUID), `user_${VALID_UUID}`);
  // Trimming hides input bugs. The validator must reject, not silently normalize.
  assert.throws(() => userTag(` ${VALID_UUID} `), /expected a UUID/);
  assert.throws(() => userTag(`\n${VALID_UUID}`), /expected a UUID/);
});

// ── 2. Every wrapper validates userId via userTag() before any network call ─

test('every Supermemory wrapper that takes a userId rejects non-UUID input before I/O', async () => {
  // Import these dynamically so the missing-key path doesn't break the suite
  // in non-Supermemory tests. We only assert the synchronous UUID check fires.
  const { getForestProfile, appendForestNode, appendForestNodes, forestTools } =
    await import('../lib/supermemory/forest.js');
  const { getDueForResurfacing } = await import('../lib/supermemory/resurface.js');
  const { syncForestEdgesForUser } = await import('../lib/supermemory/forestMirror.js');

  // forestTools is synchronous — it builds the @supermemory/ai-sdk toolset.
  assert.throws(() => forestTools('not-a-uuid'), /expected a UUID/);
  assert.throws(() => forestTools(`user_${VALID_UUID}`), /expected a UUID/);

  // The async wrappers reject with the same userTag error.
  const validNode = { kind: 'word', lang: 'zh', id: 'word:zh:x', parent_id: null };
  for (const fn of [
    () => getForestProfile('not-a-uuid'),
    () => appendForestNode('not-a-uuid', validNode),
    // appendForestNodes must reject when nodes is non-empty (note: with an
    // empty nodes array it's a no-op that never reaches the userId validator
    // — see writeup observation).
    () => appendForestNodes('not-a-uuid', [validNode]),
    () => getDueForResurfacing('not-a-uuid'),
    () => syncForestEdgesForUser('not-a-uuid'),
  ]) {
    await assert.rejects(fn, /expected a UUID/);
  }
});

test('OBSERVATION: appendForestNodes(badUuid, []) is a silent no-op because nodes-loop never validates userId', async () => {
  // Documents a minor defence-in-depth gap: appendForestNodes only validates
  // the userId transitively (via appendForestNode inside the loop). An empty
  // nodes array short-circuits, so a non-UUID userId is silently accepted as
  // a no-op rather than rejected up-front. Low severity (no I/O happens) but
  // worth a follow-up to add a leading `userTag(userId)` validator call.
  const { appendForestNodes } = await import('../lib/supermemory/forest.js');
  const result = await appendForestNodes('not-a-uuid', []);
  assert.deepEqual(result, [], 'current behavior: silent empty-array no-op (see writeup)');
});

// ── 3. Static audit: every call site sources userId from req.userId ───────

const SUPERMEMORY_HELPERS = [
  'userTag',
  'getForestProfile',
  'appendForestNode',
  'appendForestNodes',
  'forestTools',
  'memoryTools',
  'getDueForResurfacing',
  'syncForestEdgesForUser',
];

// Files that DEFINE the helpers (where the userId parameter is the function's
// own argument, not a request value) — exclude them from the call-site audit.
const HELPER_DEFINITION_FILES = new Set([
  path.join(NODE_ROOT, 'lib/supermemory/containerTag.js'),
  path.join(NODE_ROOT, 'lib/supermemory/forest.js'),
  path.join(NODE_ROOT, 'lib/supermemory/resurface.js'),
  path.join(NODE_ROOT, 'lib/supermemory/forestMirror.js'),
  path.join(NODE_ROOT, 'lib/supermemory/client.js'),
  path.join(NODE_ROOT, 'lib/supermemory/index.js'),
]);

test('every Supermemory helper call site sources userId from req.userId (never from request body/query/params)', () => {
  const files = walk(NODE_ROOT, (n) => n.endsWith('.js'))
    .filter((f) => !HELPER_DEFINITION_FILES.has(f));

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const helper of SUPERMEMORY_HELPERS) {
      // Match `helper(<first arg up to first comma or close paren>)`
      const re = new RegExp(`\\b${helper}\\s*\\(([^,)]+)`, 'g');
      for (const m of src.matchAll(re)) {
        const arg = m[1].trim();
        // Skip helper-internal usage (definitions/types already excluded by file filter).
        // Allowed: req.userId, userId variable (when derived from req.userId),
        // a literal that is plainly not a request shape.
        const fromRequestBody = /\breq\s*\.\s*(body|query|params)\b/.test(arg);
        assert.equal(fromRequestBody, false,
          `${file}: ${helper}(${arg}) — first arg must not come from req.body/req.query/req.params`);
      }
    }
  }
});

test('every memoryTools(...) / forestTools(...) call site scopes containerTags to a single user', () => {
  // memoryTools accepts containerTags: string[]. forestTools always wraps it as
  // [userTag(userId)] (single-element). Any future call site that hand-builds
  // a multi-tag array should be a deliberate audited decision — flag it.
  const files = walk(NODE_ROOT, (n) => n.endsWith('.js'))
    .filter((f) => !HELPER_DEFINITION_FILES.has(f));

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // Look for memoryTools(<arg>) where <arg> is an inline array with more than
    // one element. forestTools wraps via [userTag(userId)] which is a one-element
    // literal array — that's the safe shape.
    const re = /memoryTools\s*\(\s*\[\s*([^\]]+)\]/g;
    for (const m of src.matchAll(re)) {
      const elems = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      assert.ok(elems.length <= 1,
        `${file}: memoryTools(...) given a multi-tag array (${elems.length} elements) — cross-tenant risk`);
    }
  }
});

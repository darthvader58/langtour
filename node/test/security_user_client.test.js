// Security audit — userClient() JWT propagation (vector 1).
//
// Verifies the unconventional pattern in node/lib/db/db.js where userClient()
// builds a Supabase client using:
//   apikey        = SUPABASE_SERVICE_ROLE_KEY  (project access)
//   Authorization = caller's user JWT          (role / auth.uid())
//
// Documented Supabase pattern uses the anon key as apikey, but PostgREST
// determines the database role and request.jwt.claims (which auth.uid()
// reads) from the Authorization JWT, not from the apikey. As long as the
// Authorization header is the user's JWT, PostgREST sets role=authenticated
// and RLS is enforced — even when the apikey is the service-role key.
//
// What this suite locks:
//   1. A well-formed bearer token survives unmodified into the outgoing fetch.
//      (PostgREST will then derive role=authenticated + auth.uid() from it.)
//   2. The apikey header is the service-role key (call passes the gateway).
//   3. A malformed/empty/null/undefined Authorization fails CLOSED:
//      the header passes through verbatim (as the literal string "undefined"
//      / "null" / "") instead of silently falling back to the apikey value.
//      PostgREST treats those as unparseable JWTs and rejects the request,
//      so there is no service-role privilege escalation.
//
// Context7 reference (read 2026-06-30):
//   /supabase/supabase-js fetchWithAuth — Authorization is only auto-filled
//   when headers.has('Authorization') is false. Setting any value (including
//   the strings "undefined" / "null" / "") is treated as present and is NOT
//   overwritten with the apikey.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://localhost:54321';
const SERVICE_ROLE_KEY = 'srk-fake-do-not-use';
const VALID_USER_JWT = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig';

// Build a captured-fetch supabase client matching the userClient() construction.
function buildUserClient(authorizationHeader, capture) {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authorizationHeader },
      fetch: async (url, init) => {
        capture.push({
          url: String(url),
          headers: Object.fromEntries(new Headers(init?.headers || {})),
        });
        return new Response('{"data":null,"error":null}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
}

async function callRpc(authorizationHeader) {
  const capture = [];
  const client = buildUserClient(authorizationHeader, capture);
  try { await client.rpc('record_scenario_turn', { p_country_code: 'china' }); } catch { /* swallow */ }
  return capture.at(-1)?.headers ?? {};
}

test('userClient forwards a valid bearer token verbatim as Authorization', async () => {
  const headers = await callRpc(VALID_USER_JWT);
  assert.equal(headers.authorization, VALID_USER_JWT,
    'PostgREST must see the user JWT so it can set role=authenticated + auth.uid()');
});

test('userClient sets the service-role key as the apikey header (gateway access)', async () => {
  const headers = await callRpc(VALID_USER_JWT);
  assert.equal(headers.apikey, SERVICE_ROLE_KEY,
    'apikey must be the service-role key — it grants gateway access; PostgREST role still comes from the JWT');
});

test('apikey and Authorization are independent headers (no fallback overwrite)', async () => {
  // The Supabase fetchWithAuth helper only fills Authorization when
  // headers.has('Authorization') is false. We pre-set it, so it must NOT be
  // overwritten with the apikey (which would silently escalate to service_role).
  const headers = await callRpc(VALID_USER_JWT);
  assert.notEqual(headers.authorization, `Bearer ${SERVICE_ROLE_KEY}`,
    'Authorization MUST NOT have been overwritten with the service-role key');
});

test('undefined Authorization is NOT silently rewritten to the service-role key (fails closed)', async () => {
  // The risk: if userClient(undefined) caused supabase-js to fall back to
  // Authorization=Bearer <service_role>, RLS would be bypassed.  Verify the
  // header passes through as the literal string "undefined" instead, which
  // PostgREST will reject as an unparseable JWT (fail closed → role=anon).
  const headers = await callRpc(undefined);
  assert.notEqual(headers.authorization, `Bearer ${SERVICE_ROLE_KEY}`,
    'undefined Authorization must NOT escalate to service-role');
  // Document the observed fail-closed behavior so a future regression is caught.
  assert.equal(headers.authorization, 'undefined',
    'undefined header value is forwarded as the literal string "undefined" — PostgREST rejects it as malformed');
});

test('null Authorization is NOT silently rewritten to the service-role key (fails closed)', async () => {
  const headers = await callRpc(null);
  assert.notEqual(headers.authorization, `Bearer ${SERVICE_ROLE_KEY}`,
    'null Authorization must NOT escalate to service-role');
  assert.equal(headers.authorization, 'null');
});

test('empty-string Authorization is NOT silently rewritten to the service-role key (fails closed)', async () => {
  const headers = await callRpc('');
  assert.notEqual(headers.authorization, `Bearer ${SERVICE_ROLE_KEY}`,
    'empty-string Authorization must NOT escalate to service-role');
  assert.equal(headers.authorization, '');
});

test('a forged Authorization header containing the service-role key is preserved verbatim', async () => {
  // Defence-in-depth note: the Authorization header is whatever userClient()
  // was handed. The only call site is `userClient(req.headers.authorization)`
  // in routes/scenario.js, AFTER `requireUser` has validated the bearer
  // against Supabase. So an attacker can only pass a JWT they already control.
  // This test documents the trust boundary: userClient itself does no
  // validation — it is the route layer's job to never invoke it with an
  // attacker-controlled Authorization header.
  const forged = `Bearer ${SERVICE_ROLE_KEY}`;
  const headers = await callRpc(forged);
  assert.equal(headers.authorization, forged,
    'userClient performs no JWT validation — requireUser is the boundary that prevents this case');
});

test('only the route uses userClient, and it sources the bearer from req.headers.authorization', async () => {
  // Static guard: any future callers of userClient MUST source the bearer
  // header from a request that has already passed requireUser.  This is the
  // anti-cross-tenant invariant for the unconventional pattern.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
  const candidates = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'test') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) candidates.push(full);
    }
  }
  walk(root);

  const callers = [];
  for (const file of candidates) {
    const src = fs.readFileSync(file, 'utf8');
    if (/\buserClient\s*\(/.test(src) && !file.endsWith('/lib/db/db.js')) {
      callers.push({ file, src });
    }
  }

  // Every caller of userClient(...) must pass req.headers.authorization (or a
  // value derived from a verified request). Reject any pattern that looks
  // like a raw body/query/param value.
  for (const { file, src } of callers) {
    const match = src.match(/userClient\s*\(([^)]*)\)/g) ?? [];
    for (const call of match) {
      assert.match(call, /req\.headers\.authorization/,
        `userClient at ${file} must be invoked with req.headers.authorization (got: ${call})`);
    }
  }
});

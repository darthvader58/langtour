// Security audit — scenario-completion server gating (release-blocker finding).
//
// CLAUDE.md invariant: "Completion is server-decided. Only an evaluator-
// confirmed pass in /api/scenario/evaluate may call record_scenario_completion."
//
// Current state (as of 20260629000001_scenario_turn_grants.sql):
//   - record_scenario_completion is called ONLY from the browser
//     (client/src/hooks/useProfile.js::completeScenario), not from
//     /api/scenario/evaluate. The route layer does not gate the call.
//   - The SQL RPC validates: auth.uid() non-null, scenario exists in
//     scenario_catalog, and idempotent insert. It does NOT verify the user
//     actually played the scenario (no scenario_turn_grants check).
//
// Attack path (skip-a-country, vector 5):
//   1. Sign in.
//   2. From the browser console:
//        supabase.rpc('record_scenario_completion',
//          { p_country_code: 'china', p_scenario_id: 'street-market' })
//      Repeat for every scenario_id under the currently unlocked country.
//   3. supabase.rpc('claim_country_reward', { p_country_code: 'china' })
//      → +150 tokens (claim_country_reward counts scenario_completions rows;
//      it does NOT check whether any words were attested).
//   4. supabase.rpc('unlock_country_for_user',
//        { p_country_code: 'france', p_cost: 100 })
//      → unlocks France because every prior unlock has a claimed reward.
//   5. Repeat for every country. Player completes the game without speaking.
//
// These tests are PINNED to the broken state so the auditor can prove the
// gap exists. They flip to PASSING assertions once the fix lands (any of:
//   A) record_scenario_completion gates on `exists scenario_turn_grants` for
//      the same (user, scenario);
//   B) The RPC is revoked from the authenticated role and only called from
//      /api/scenario/evaluate via userClient after a server-confirmed pass;
//   C) Both.
// Until then, this suite *documents* the gap rather than enforcing the fix.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const NODE_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NODE_ROOT, '..');
const MIG_DIR = path.join(REPO, 'supabase/migrations');

function latestDef(name) {
  const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  let last = null;
  for (const f of files) {
    const src = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    const re = new RegExp(`create or replace function public\\.${name}[\\s\\S]+?\\$\\$;`, 'g');
    for (const m of src.matchAll(re)) last = { file: f, body: m[0] };
  }
  return last;
}

// ── 1. Document: record_scenario_completion does NOT gate on prior play ───

test('FINDING: latest record_scenario_completion does not verify the user actually played the scenario', () => {
  const def = latestDef('record_scenario_completion');
  assert.ok(def, 'record_scenario_completion must be defined');
  // Negative: no check against scenario_turn_grants. If a future migration
  // adds the gate, this assertion flips and the suite below needs the
  // positive version uncommented.
  assert.doesNotMatch(def.body, /scenario_turn_grants/,
    `${def.file}: record_scenario_completion currently has no scenario_turn_grants gate — see writeup.`);
});

test('FINDING: record_scenario_completion is granted to authenticated, so the browser can call it directly', () => {
  // Grant search across all migrations — the latest applied permission wins
  // but any standing grant suffices for the attack.
  const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
  const allSrc = files.map((f) => fs.readFileSync(path.join(MIG_DIR, f), 'utf8')).join('\n');
  assert.match(allSrc, /grant execute on function public\.record_scenario_completion\(text, text\) to authenticated/,
    'record_scenario_completion is callable directly from the browser by any authenticated user');
});

test('FINDING: /api/scenario/evaluate does NOT call record_scenario_completion (client owns completion)', () => {
  const src = fs.readFileSync(path.join(NODE_ROOT, 'routes/scenario.js'), 'utf8');
  assert.doesNotMatch(src, /record_scenario_completion/,
    'evaluate route does not currently call record_scenario_completion — so completion is not server-gated by the evaluator pass');
});

test('FINDING: client useProfile.completeScenario calls record_scenario_completion directly (no server check)', () => {
  const src = fs.readFileSync(path.join(REPO, 'client/src/hooks/useProfile.js'), 'utf8');
  assert.match(src, /supabase\.rpc\(\s*['"]record_scenario_completion['"]/,
    'client invokes record_scenario_completion directly — so an attacker with browser DevTools can forge completions');
});

// ── 2. Document: claim_country_reward counts completions but doesn't verify play ──

test('FINDING: claim_country_reward gates on scenario_completions count, which the client can forge', () => {
  const def = latestDef('claim_country_reward');
  assert.ok(def);
  assert.match(def.body, /count\(\*\)[\s\S]+?from public\.scenario_completions/,
    'claim_country_reward derives completion count from scenario_completions');
  // Negative: no defence-in-depth gate against scenario_turn_grants existence.
  // The fix to record_scenario_completion implicitly fixes this too, but a
  // belt-and-braces gate here would also work.
  assert.doesNotMatch(def.body, /scenario_turn_grants/,
    'claim_country_reward does not double-check via scenario_turn_grants — relies entirely on scenario_completions integrity');
});

// ── 3. Document: dev-skip remains in the production-bound bundle ──────────

test('FINDING: GameplayPhase.handleDevSkip is unconditional in the source tree', () => {
  const src = fs.readFileSync(path.join(REPO, 'client/src/components/GameplayPhase.jsx'), 'utf8');
  assert.match(src, /const handleDevSkip = \(\) =>/,
    'handleDevSkip function exists in the source — release-blocker per CLAUDE.md until gated by an env check or removed for prod builds');
  // The button is currently `hidden ... sm:flex` (Tailwind) → visible on
  // screens >= 640px wide. There is no `if (import.meta.env.DEV)` guard
  // around the button render.  Static check: no env guard anywhere near
  // handleDevSkip.
  const handleDevSkipBlock = src.split('handleDevSkip')[1] ?? '';
  assert.doesNotMatch(handleDevSkipBlock.slice(0, 800), /import\.meta\.env\.DEV/,
    'no import.meta.env.DEV guard around handleDevSkip wiring — dev-skip ships to prod');
});

// ── 4. Future-fix readiness: once gated, the following assertions can flip ─

test('PENDING-FIX: once record_scenario_completion gates on scenario_turn_grants, this assertion will pass', () => {
  // Pinned in the AS-IS state so a future fix is visible. When the fix lands
  // the auditor (or the follow-up ticket reviewer) flips the .doesNotMatch
  // here and in the FINDING test above to .match to lock in the new gate.
  const def = latestDef('record_scenario_completion');
  // Today: assert.doesNotMatch (gate is absent).
  assert.doesNotMatch(def.body, /scenario_turn_grants/,
    'AS-IS: gate absent. FIX shape: add `if not exists (select 1 from public.scenario_turn_grants where user_id = uid and scenario_id = p_scenario_id) then raise exception` before the insert.');
});

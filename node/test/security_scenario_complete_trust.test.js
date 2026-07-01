// Security audit — scenarioComplete is a UI signal, not a reward trigger (vector 3).
//
// T-H added `scenarioComplete: boolean` to the /api/scenario/evaluate response
// payload.  This audit verifies:
//
//   1. The scenarioComplete flag is *derived server-side* from the
//      scenario_turn_grants ledger via getGrowingTargetState() — never lifted
//      from a request body or trusted from a client claim.
//   2. No server route uses scenarioComplete as the basis for awarding a
//      reward.  Reward credit flows through:
//          - record_scenario_turn (per-turn XP/tokens, gated on attested
//            usedWordIds existing in learning_user_word_progress)
//          - claim_country_reward (country reward, re-derived from
//            scenario_completions row count)
//      scenarioComplete is purely a UI hint that the frontend can advance.
//   3. claim_country_reward (SQL) re-derives `completed_count` from
//      scenario_completions, not from any client-supplied "complete" flag.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');

function readSrc(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

// ── 1. scenarioComplete in the route response is server-derived ────────────

test('routes/scenario.js derives scenarioComplete from getGrowingTargetState (not from req.body)', () => {
  const src = readSrc('node/routes/scenario.js');
  // The response must only set scenarioComplete from the local
  // growingTargetState / growingStateForGenerate variables.
  // i.e. it must not be doing something like `req.body.scenarioComplete`.
  assert.doesNotMatch(src, /req\.body\.scenarioComplete/,
    'route MUST NOT read scenarioComplete from req.body');
  assert.doesNotMatch(src, /req\.body\?\.scenarioComplete/,
    'route MUST NOT read scenarioComplete from req.body');
  assert.doesNotMatch(src, /req\.query\.scenarioComplete/,
    'route MUST NOT read scenarioComplete from req.query');

  // Positive: every `scenarioComplete:` assignment in the route source must
  // come from the growing-target state computed via getGrowingTargetState.
  const assignments = [...src.matchAll(/scenarioComplete:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
  assert.ok(assignments.length > 0, 'route must produce scenarioComplete in its response');
  for (const expr of assignments) {
    assert.match(expr, /(growingTargetState|growingStateForGenerate)\.scenarioComplete/,
      `scenarioComplete must come from server-computed growing-target state; got: ${expr}`);
  }
});

test('getGrowingTargetState computes scenarioComplete from scenario_turn_grants attestations only', () => {
  const src = readSrc('node/lib/graph/growingTarget.js');
  // It must query the server-side ledger (scenario_turn_grants), not accept
  // any external "complete" assertion.
  assert.match(src, /scenario_turn_grants/);
  // No reference to req.body / request-shaped inputs inside the policy module.
  assert.doesNotMatch(src, /req\.body/);
  assert.doesNotMatch(src, /req\.query/);
});

// ── 2. No route grants XP/tokens based on scenarioComplete ─────────────────

test('no route uses scenarioComplete as a basis for an economy mutation', () => {
  // Walk all route files; scenarioComplete must appear only in response
  // construction, never as the condition of an RPC call.
  const routesDir = path.join(ROOT, 'routes');
  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const src = fs.readFileSync(path.join(routesDir, file), 'utf8');
    if (!src.includes('scenarioComplete')) continue;

    // Reject any pattern of the shape `if (...scenarioComplete...) ... rpc(...)`
    // i.e. branching on scenarioComplete before an .rpc(...) call.
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/if\s*\([^)]*scenarioComplete/.test(lines[i])) {
        // Look ahead 10 lines for an rpc invocation inside the same block.
        const window = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
        assert.doesNotMatch(window, /\.rpc\(\s*['"](claim_country_reward|record_scenario_completion|record_scenario_turn|award_tokens)['"]/,
          `${file}:${i+1} branches on scenarioComplete and then calls an economy RPC — scenarioComplete must not gate awards`);
      }
    }
  }
});

// ── 3. claim_country_reward SQL re-derives completion server-side ──────────

test('claim_country_reward (SQL) re-derives completion from scenario_completions, not from any client flag', () => {
  const migDir = path.resolve(REPO, 'supabase/migrations');
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'));

  // Find the live definition of claim_country_reward (any file that defines it).
  let definitions = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(migDir, file), 'utf8');
    const re = /create or replace function public\.claim_country_reward[\s\S]+?\$\$;/g;
    for (const m of src.matchAll(re)) definitions.push({ file, body: m[0] });
  }
  assert.ok(definitions.length >= 1, 'claim_country_reward must be defined in a migration');

  // The latest-by-filename wins (timestamped naming). Just verify each
  // definition exhibits the server-side re-derivation pattern.
  for (const def of definitions) {
    assert.match(def.body, /from public\.scenario_completions/,
      `${def.file}: claim_country_reward must read from scenario_completions to re-derive completion`);
    assert.match(def.body, /count\(\*\)\s+into\s+completed_count/,
      `${def.file}: claim_country_reward must count completed scenarios server-side`);
    assert.match(def.body, /completed_count\s*<\s*reward\.required_scenarios/,
      `${def.file}: claim_country_reward must compare against the catalog's required_scenarios`);
    // It must NOT accept a "complete" boolean from the caller; signature
    // takes only p_country_code.
    assert.match(def.body, /claim_country_reward\(p_country_code text\)/,
      `${def.file}: claim_country_reward signature must be (p_country_code text) only — no client-asserted completion`);
  }
});

// ── 4. claim_country_reward is idempotent on (user_id, country_code) ───────

test('claim_country_reward stays idempotent: the second call returns the same balance, no double credit', () => {
  const migDir = path.resolve(REPO, 'supabase/migrations');
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'));
  const all = files.map((f) => fs.readFileSync(path.join(migDir, f), 'utf8')).join('\n');

  // The reward claim insert must use `on conflict do nothing`, and the token
  // credit must be gated on `if inserted_count > 0`.
  assert.match(all, /insert into public\.country_reward_claims[\s\S]+?on conflict do nothing/,
    'country_reward_claims insert must use on conflict do nothing for idempotency');
  assert.match(all, /if inserted_count > 0 then[\s\S]+?update public\.profiles[\s\S]+?set tokens = tokens \+ reward\.token_reward/,
    'token credit must be gated on the insert actually adding a new row (no double-credit on replay)');
});

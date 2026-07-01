// Security audit — economy write-path invariants (vectors 4 & 6).
//
// Vector 4 (forge a balance):
//   - No node route may write directly to the user-scoped economy tables
//     (profiles / scenario_completions / country_unlocks /
//     country_reward_claims / scenario_turn_grants).  Every mutation must
//     flow through a SECURITY DEFINER RPC.
//   - The same tables must have NO authenticated-role INSERT/UPDATE/DELETE
//     RLS policy.  Without one, supabase-js client writes from the browser
//     return PostgREST 401/403 — the user cannot forge their own balance.
//   - The 100-token unlock cost is enforced server-side in the latest
//     unlock_country_for_user (p_cost <> 100 rejected).
//
// Vector 6 (replay a completion):
//   - record_scenario_completion is idempotent on (user_id, country_code,
//     scenario_id) via `on conflict do nothing`.
//   - record_scenario_turn is idempotent on (user_id, scenario_id,
//     turn_index) via the same pattern PLUS a select-then-insert race window.
//   - Replayed calls return the prior grant unchanged (no double XP/tokens).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const NODE_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NODE_ROOT, '..');
const MIG_DIR = path.join(REPO, 'supabase/migrations');

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

function allMigrationSrc() {
  return fs.readdirSync(MIG_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(MIG_DIR, f), 'utf8') }));
}

// ── Vector 4.a: no routes/lib path writes to user-scoped economy tables ────

const USER_SCOPED_ECONOMY_TABLES = [
  'profiles',
  'scenario_completions',
  'country_unlocks',
  'country_reward_claims',
  'scenario_turn_grants',
];

const WRITE_OPS = ['insert', 'update', 'upsert', 'delete'];

test('no node/routes file writes directly to user-scoped economy tables (must go through RPCs)', () => {
  const routeFiles = walk(path.join(NODE_ROOT, 'routes'), (n) => n.endsWith('.js'));
  for (const file of routeFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const table of USER_SCOPED_ECONOMY_TABLES) {
      for (const op of WRITE_OPS) {
        // Pattern: .from('<table>').<op>(  (with optional whitespace, chained calls allowed).
        const re = new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)[\\s\\S]{0,200}?\\.${op}\\s*\\(`, 'm');
        assert.doesNotMatch(src, re,
          `${file}: must not call .${op}() on '${table}' — economy mutations must go through SECURITY DEFINER RPCs`);
      }
    }
  }
});

test('no node/lib file writes directly to user-scoped economy tables (must go through RPCs)', () => {
  const libFiles = walk(path.join(NODE_ROOT, 'lib'), (n) => n.endsWith('.js'));
  for (const file of libFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const table of USER_SCOPED_ECONOMY_TABLES) {
      for (const op of WRITE_OPS) {
        const re = new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)[\\s\\S]{0,200}?\\.${op}\\s*\\(`, 'm');
        assert.doesNotMatch(src, re,
          `${file}: must not call .${op}() on '${table}' — economy mutations must go through SECURITY DEFINER RPCs`);
      }
    }
  }
});

// ── Vector 4.b: no authenticated-role write RLS policies on economy tables ─

test('user-scoped economy tables have NO authenticated-role insert/update/delete RLS policies', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  for (const table of USER_SCOPED_ECONOMY_TABLES) {
    for (const op of ['insert', 'update', 'delete']) {
      const re = new RegExp(`create policy[^;]+on public\\.${table} for ${op} to authenticated`, 'i');
      assert.doesNotMatch(allSrc, re,
        `Migration must NOT grant authenticated.${op} policy on public.${table}`);
    }
  }
});

test('every user-scoped economy table has RLS enabled', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  for (const table of USER_SCOPED_ECONOMY_TABLES) {
    const re = new RegExp(`alter table public\\.${table} enable row level security`, 'i');
    assert.match(allSrc, re,
      `public.${table} must enable row level security`);
  }
});

// ── Vector 4.c: 100-token unlock cost is enforced server-side ──────────────

test('unlock_country_for_user (latest definition) hard-rejects any p_cost <> 100', () => {
  // Find the latest definition by sort order (timestamped filenames).
  const defs = allMigrationSrc()
    .map(({ file, src }) => {
      const match = src.match(/create or replace function public\.unlock_country_for_user[\s\S]+?\$\$;/);
      return match ? { file, body: match[0] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.file.localeCompare(b.file));

  assert.ok(defs.length >= 1, 'unlock_country_for_user must be defined');
  const latest = defs[defs.length - 1];
  assert.match(latest.body, /if p_cost <> 100 then[\s\S]+?raise exception/,
    `${latest.file}: unlock_country_for_user must hard-reject p_cost <> 100`);
});

test('unlock_country_for_user atomically guards against underflow via tokens >= 100 WHERE clause', () => {
  const defs = allMigrationSrc()
    .map(({ file, src }) => {
      const match = src.match(/create or replace function public\.unlock_country_for_user[\s\S]+?\$\$;/);
      return match ? { file, body: match[0] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.file.localeCompare(b.file));
  const latest = defs[defs.length - 1];
  // The WHERE clause prevents concurrent double-spend: only one UPDATE
  // satisfies `tokens >= 100` if there are exactly 100 tokens left.
  assert.match(latest.body, /update public\.profiles[\s\S]+?set tokens = tokens - 100[\s\S]+?where user_id = uid and tokens >= 100/,
    `${latest.file}: unlock_country_for_user must use the atomic tokens >= 100 WHERE clause`);
  // And on underflow, raise — never silently no-op.
  assert.match(latest.body, /if new_balance is null then[\s\S]+?raise exception 'Insufficient tokens'/,
    `${latest.file}: insufficient tokens must raise, not silently no-op`);
});

test('unlock_country_for_user gates on every previously unlocked country having a claimed reward', () => {
  const defs = allMigrationSrc()
    .map(({ file, src }) => {
      const match = src.match(/create or replace function public\.unlock_country_for_user[\s\S]+?\$\$;/);
      return match ? { file, body: match[0] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.file.localeCompare(b.file));
  const latest = defs[defs.length - 1];
  assert.match(latest.body, /country_unlocks[\s\S]+?left join[\s\S]+?country_reward_claims[\s\S]+?reward_claim\.user_id is null/i,
    `${latest.file}: must left-join country_reward_claims and detect unclaimed countries before allowing a new unlock`);
});

test('profiles table check constraint forbids negative tokens', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  assert.match(allSrc, /tokens bigint[^,]*check \(tokens >= 0\)/i,
    'profiles.tokens must have a `check (tokens >= 0)` constraint so the DB itself rejects underflow');
});

// ── Vector 6.a: record_scenario_completion is idempotent ───────────────────

test('record_scenario_completion uses on conflict do nothing for idempotency on (user_id, country_code, scenario_id)', () => {
  // Pull every definition; the latest (highest filename) is the live version.
  const defs = allMigrationSrc()
    .map(({ file, src }) => {
      const matches = [...src.matchAll(/create or replace function public\.record_scenario_completion[\s\S]+?\$\$;/g)];
      return matches.map((m) => ({ file, body: m[0] }));
    })
    .flat()
    .sort((a, b) => a.file.localeCompare(b.file));
  const latest = defs[defs.length - 1];
  assert.ok(latest, 'record_scenario_completion must be defined');
  assert.match(latest.body, /insert into public\.scenario_completions[\s\S]+?on conflict do nothing/,
    `${latest.file}: replay of the same (user, country, scenario) must be a no-op`);
  // scenario_completions PK provides the (user_id, country_code, scenario_id) uniqueness.
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  assert.match(allSrc, /create table public\.scenario_completions[\s\S]+?primary key \(user_id, country_code, scenario_id\)/,
    'scenario_completions PK must be (user_id, country_code, scenario_id) so replays collide');
});

// ── Vector 6.b: record_scenario_turn is idempotent ─────────────────────────

test('record_scenario_turn ledger PK guarantees idempotency on (user_id, scenario_id, turn_index)', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  assert.match(allSrc, /create table public\.scenario_turn_grants[\s\S]+?primary key \(user_id, scenario_id, turn_index\)/,
    'scenario_turn_grants PK must be (user_id, scenario_id, turn_index)');
});

test('record_scenario_turn defends in depth with both select-then-insert idempotency check AND on conflict do nothing', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  const match = allSrc.match(/create or replace function public\.record_scenario_turn[\s\S]+?\$\$;/);
  assert.ok(match, 'record_scenario_turn must be defined');
  const body = match[0];

  // First-line idempotency: select existing and short-circuit.
  assert.match(body, /select \* into existing[\s\S]+?from public\.scenario_turn_grants[\s\S]+?if found then[\s\S]+?return jsonb_build_object/,
    'must select existing grant and return prior award when (user, scenario, turn) already credited');
  // Second-line defence against race: insert ... on conflict do nothing.
  assert.match(body, /insert into public\.scenario_turn_grants[\s\S]+?on conflict \(user_id, scenario_id, turn_index\) do nothing/,
    'concurrent insert must be a no-op via on conflict (user_id, scenario_id, turn_index)');
  // Race detection: after insert, if inserted_count = 0, behave like the idempotent branch.
  assert.match(body, /if inserted_count = 0 then[\s\S]+?return jsonb_build_object/,
    'on a lost race, must return the prior grant without re-crediting');
});

test('record_scenario_turn rejects unknown / unattested word ids (forging defence)', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  const match = allSrc.match(/create or replace function public\.record_scenario_turn[\s\S]+?\$\$;/);
  const body = match[0];
  assert.match(body, /not exists \(\s+select 1 from public\.learning_user_word_progress p\s+where p\.user_id = uid and p\.word_id = wid\s+\)/i,
    'every used_word_id must exist in the caller-specific learning_user_word_progress — rejects forged ids');
  assert.match(body, /raise exception 'Unknown or unattested word'/);
});

test('record_scenario_turn dedupes used_word_ids before awarding so [101,101,101] never inflates the credit', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  const match = allSrc.match(/create or replace function public\.record_scenario_turn[\s\S]+?\$\$;/);
  const body = match[0];
  assert.match(body, /array_agg\(distinct wid\)/i,
    'used_word_ids must be deduplicated server-side before computing the award');
});

test('record_scenario_turn requires the country to be unlocked for the caller', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  const match = allSrc.match(/create or replace function public\.record_scenario_turn[\s\S]+?\$\$;/);
  const body = match[0];
  assert.match(body, /not exists \(\s+select 1 from public\.country_unlocks\s+where user_id = uid and country_code = normalized_country\s+\)/i,
    'cannot earn from a country the user has not paid 100 tokens to unlock');
  assert.match(body, /raise exception 'Country is not unlocked'/);
});

// ── Vector 6.c: every economy RPC requires auth.uid() to be non-null ───────

test('every economy RPC raises 28000 when auth.uid() is null', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  const rpcs = [
    'unlock_country_for_user',
    'award_tokens',
    'spend_tokens',
    'reset_user_progress',
    'record_scenario_completion',
    'claim_country_reward',
    'record_scenario_turn',
  ];
  for (const fn of rpcs) {
    const matches = [...allSrc.matchAll(new RegExp(`create or replace function public\\.${fn}[\\s\\S]+?\\$\\$;`, 'g'))];
    assert.ok(matches.length >= 1, `${fn} must be defined in a migration`);
    // The latest definition is what runs in prod — but every definition must
    // contain the auth check so an in-flight migration ordering bug can't
    // briefly expose an unauthenticated mutation.
    for (const m of matches) {
      assert.match(m[0], /raise exception 'Authentication required' using errcode = '28000'/,
        `${fn}: every definition must require auth.uid() to be non-null`);
    }
  }
});

test('every economy RPC sets search_path to empty (qualified table refs only)', () => {
  const allSrc = allMigrationSrc().map(({ src }) => src).join('\n');
  // Match every `create or replace function public.<x>` and assert the
  // function body contains `set search_path = ''`.  SECURITY DEFINER without
  // a fixed search_path is a classic privilege-escalation footgun.
  const re = /create or replace function public\.(\w+)[\s\S]+?\$\$;/g;
  for (const m of allSrc.matchAll(re)) {
    const [body, name] = m;
    if (!body.includes('security definer')) continue; // only checking SECURITY DEFINER functions
    assert.match(body, /set search_path = ''/,
      `SECURITY DEFINER public.${name} must set search_path = '' (qualified table refs only)`);
  }
});

# Adversarial anti-cheat pass — 2026-07 (Phase 5, pre-release)

Reviewer: security-economy agent (Role 6). Scope: the fully integrated system on
`main` — `node/routes/scenario.js`, `node/routes/profile.js`, `node/routes/voice.js`,
`node/lib/ai/`, `node/lib/memory/forest.js`, `node/lib/graph/`, `client/src/hooks/useProfile.js`,
and all migrations through `20260704000000`. Method: trace each attack to the code
path, cite `file:line`, give a verdict, and for every VULNERABLE finding a concrete
fix + regression coverage.

## Summary table

| # | Attack | Verdict | Fix |
|---|--------|---------|-----|
| 1 | Forge a balance / mint tokens | **VULNERABLE (critical)** — `award_tokens` | S1: revoke `award_tokens` from `authenticated` (migration written) |
| 2 | Skip a country / unlock out of order | BLOCKED | — |
| 3 | Replay / bypass a completion (client marks complete without an evaluator pass) | **VULNERABLE (high)** — `record_scenario_completion` is directly browser-callable | S3: make completion service-role-only + explicit `p_user_id` (spec below; needs owner sign-off) |
| 4 | Forge chain_complete / claim early | BLOCKED at the claim RPC; **indirectly reachable** via S3 | fixed by S3 |
| 5 | Cross-tenant a memory / forest read | BLOCKED | — |
| 6 | Direct DB / RLS holes, service-role key in bundle | BLOCKED | — |
| 7 | Input validation (country/scenario/lang) | BLOCKED | — |

Two real holes: **S1 (award_tokens mint)** and **S3 (client-callable completion)**.
Both stem from the same architectural fact — economy RPCs are `GRANT`ed to
`authenticated` and called directly from the browser (`useProfile.js`). That model
is *safe only for RPCs whose every guard holds under a hostile direct call*
(unlock, claim, spend all qualify). It is unsafe for any RPC whose integrity
depends on "the backend called me after checking something" — which is exactly
`award_tokens` (trusts a client amount) and `record_scenario_completion` (must be
gated on an evaluator pass the DB cannot see).

---

## 1. Forge a balance / mint tokens — VULNERABLE (critical)

**Path.** `award_tokens(p_amount bigint)` —
`supabase/migrations/20260623000000_user_game_state.sql:56`. Body:
`update public.profiles set tokens = tokens + p_amount ...` (`:73`), guarded only by
`p_amount <= 0` (`:69`). Granted to `authenticated` (`:116`). The browser client
calls it directly: `client/src/hooks/useProfile.js:124`
(`supabase.rpc('award_tokens', { p_amount: amount })`).

**Exploit.** Any signed-in user, from the devtools console:
`await supabase.rpc('award_tokens', { p_amount: 999999999 })` → arbitrary balance.
The amount is client-sent and re-derived from nothing server-side. This alone
defeats the entire economy (the 100-token unlock cost becomes irrelevant).

**Aggravating.** `award_tokens` has **no legitimate caller** — `awardTokens` in
`useProfile.js` is exported but never invoked anywhere in `client/` or `node/`
(verified by grep). It is pure attack surface.

**Fix S1 (written).** `supabase/migrations/20260704000001_revoke_award_tokens.sql`
— `revoke execute on function public.award_tokens(bigint) from authenticated;`.
Subtractive, breaks zero real flow. If a server-authorized credit is ever needed,
it must be a new definer RPC whose amount is re-derived server-side, never
client-sent. **Owner review before `supabase db push`** (touches the economy
surface, per sign-off point #2). Also recommend deleting the dead `awardTokens`
helper from `useProfile.js` (frontend agent).

**Regression.** SQL grants have no node harness in this repo; the fix is a
migration. Verify post-deploy that a browser `award_tokens` call returns
`permission denied for function award_tokens`.

## 2. Skip a country / unlock out of order — BLOCKED

**Path.** Latest `unlock_country_for_user` —
`supabase/migrations/20260628000000_repair_starter_balance.sql:84`.
- Client-sent `p_cost` is **validated, not trusted**: `if p_cost <> 100 then raise`
  (`:100`), and the debit uses the literal `tokens - 100` (`:121`), not `p_cost`.
  A forged `p_cost: 0` is rejected with 22023.
- Prior-country-reward gate intact: `unclaimed_count` join blocks a new unlock
  while any unlocked country lacks a `country_reward_claims` row (`:109-118`).
- No negative balance: `where ... and tokens >= 100` + null-check raise (`:122-127`).
- Country validated against `game_countries` (`:103`).

Direct browser call (`useProfile.js:111`) cannot bypass any of these — every guard
is inside the definer body. **BLOCKED.**

## 3. Replay / bypass a completion — VULNERABLE (high)

**Replay: BLOCKED.** `record_scenario_completion`
(`20260703000000_generated_scenarios.sql:80`) is idempotent —
`insert ... on conflict do nothing` + `get diagnostics inserted_count` (`:109-116`);
a second call inserts 0 rows, returns `false`, and skips the XP update. No double XP.

**Route-layer gating: BLOCKED.** In `node/routes/scenario.js` the completion RPC is
reached only inside `/api/scenario/evaluate` under `if (scenarioComplete)` (`:337`),
which requires `result.pass === true` from the server evaluator (`:288`) **and** a
server-derived `isScenarioComplete` (`:326`, all target words used). No request-body
field flips it: `pass`, `scenarioComplete`, `completed`, `usedWords` in the body are
ignored — only `evaluateResponse`'s verdict and the stored row's `used_word_ids`
matter. `pronScore`/`priorTurns` flow into the evaluator prompt but cannot
independently force a pass. Covered by tests
`scenario_routes.test.js` — "client-sent flags cannot force completion on a failed
turn" and the new "forged pronScore and priorTurns cannot manufacture a completion".

**Hole — the RPC is directly browser-callable, bypassing the evaluator entirely.**
`record_scenario_completion` is granted to `authenticated`
(`20260703000000_generated_scenarios.sql:218`) and the client calls it directly:
`useProfile.js:132` (`completeScenario`), wired from `App.jsx:136`. Its only
integrity guard is "the scenario id exists in *this user's* `user_generated_scenarios`
chain" (`:100-107`) — but the user **creates that chain themselves** by calling the
normal `POST /api/scenario/generate` endpoint, which service-role-inserts the row
(`node/routes/scenario.js:177` → `chain.js` → `insertGeneratedScenario`,
`db.js:297`). So the guard is satisfiable without ever speaking.

**Exploit.** (1) `POST /api/scenario/generate {countryCode}` repeatedly to build the
chain (the engine sets `chain_complete=true` on the last one). (2) For each
generated `scenario_id`, call `supabase.rpc('record_scenario_completion', {...})`
directly — no audio, no evaluator, no correct sentence. (3)
`supabase.rpc('claim_country_reward', {...})` → 150 tokens. This violates the core
invariant: *"only an evaluator-confirmed pass may drive `record_scenario_completion`;
do not let the client mark a scenario complete directly."* The secure server path
(`recordScenarioCompletionAsUser`, `db.js:342`, called only after an evaluator pass)
coexists with a wide-open parallel browser path.

**Why the current design can't gate it.** `recordScenarioCompletionAsUser` calls the
RPC *as the user* (user JWT → `authenticated`, so `auth.uid()` resolves). That
requires the RPC to be granted to `authenticated`, which is precisely what makes it
directly reachable from the browser. You cannot both (a) run it under the user's role
and (b) forbid the user from invoking it.

**Fix S3 (spec — needs owner sign-off, sign-off point #2).** Move completion off the
user-JWT path onto a service-role-only RPC with an explicit, server-supplied user id:

1. Migration: new definer RPC
   `record_scenario_completion_srv(p_user_id uuid, p_country_code text, p_scenario_id text)`
   — identical body to the current 2-arg version but keyed on `p_user_id` instead of
   `auth.uid()`. `revoke all ... from public, authenticated; grant execute ... to
   service_role;`. Then `revoke execute on function public.record_scenario_completion(text,text)
   from authenticated;` so the browser 2-arg call gets `permission denied`.
2. Backend: `db.js` `recordScenarioCompletionAsUser(...)` → `recordScenarioCompletion(userId, ...)`
   using the existing service-role `db` client and passing `req.userId` (already
   server-verified in `auth.js:15`). `scenario.js:341` passes `req.userId` instead of
   `bearerToken(req)`.
3. Frontend cleanup: delete `completeScenario` from `useProfile.js` and the
   `profile.completeScenario(...)` call at `App.jsx:136` — completion is now recorded
   server-side inside `/evaluate`; the client just reloads game state.

After S3, completion is reachable **only** from the backend, only after an
`evaluateResponse` pass — the DB enforces what the route already enforces. This is a
money-rule/signature change, so per CLAUDE.md it needs owner sign-off before the
migration is written. **Not applied in this pass.**

**Note — same shape, lower stakes:** `claim_country_reward` and
`unlock_country_for_user` are also directly callable, but their guards fully hold
under hostile direct calls (attack #2, #4), so they need no change. Only
`award_tokens` and `record_scenario_completion` have guards that assume a trusted
caller.

## 4. Forge chain_complete / claim early — BLOCKED (claim itself); reachable via S3

**Claim gate: BLOCKED.** `claim_country_reward`
(`20260703000000_generated_scenarios.sql:140`) requires a service-role-written
`chain_complete = true` row (`:167-175`) **and** zero uncompleted generated scenarios
(`pending_count`, `:182-194`), then idempotently claims via the
`country_reward_claims` PK + `on conflict do nothing` (`:196-205`). The reward value
is the server-side `country_rewards.token_reward`, never client-sent.

**Can the client write `chain_complete` or forge chain rows?** No.
`user_generated_scenarios` and `learning_user_word_forest` have RLS enabled with a
**select-own-only** policy and **no** insert/update/delete policy
(`20260703000000_generated_scenarios.sql:38-49`), so every browser write is denied;
only the service role (which bypasses RLS) writes them (`db.js:297,327`). A user
cannot fast-forward `chain_complete` or fabricate a scenario row.

**Residual:** because completions themselves can be forged via S3 (attack #3), a user
can satisfy the `pending_count = 0` condition without earning it, then claim. Closed
by fixing S3. `reset_user_progress` correctly clears both new tables
(`20260703000001_reset_generated_state.sql:27-28`), so no stale `chain_complete`
survives a reset. **BLOCKED** once S3 lands.

## 5. Cross-tenant a memory / forest read — BLOCKED

**Supermemory.** `containerTagFor(userId)` = `user_${userId}` is derived at every
call site from the server-verified `req.userId` (`forest.js:22`); it throws on a
missing/empty id and there is no unscoped code path (`forest.js:108,120,131,158,230`).
`req.userId` is set only by `auth.js` from `db.auth.getUser(token)` — the client
cannot supply it. No user-controlled value reaches the container tag.

**Postgres mirror.** `learning_user_word_forest` RLS is select-own-only
(`20260703000000_generated_scenarios.sql:47`). `profile.js` reads it exclusively via
`.eq('user_id', userId)` with `userId = req.userId` (`profile.js:59,155,199-200`).
No `countryCode`/`scenarioId` query param is used as a user selector — those only
scope catalog/graph shaping. **BLOCKED.**

## 6. Direct DB / RLS holes; service-role key in bundle — BLOCKED

- **`profiles` has no UPDATE policy** for `authenticated` — only a select-own policy
  (`20260620000000_user_profiles.sql:54`). A browser
  `supabase.from('profiles').update({ tokens: 999999 })` is denied by RLS; balances
  move only through definer RPCs. (This is what makes the unlock/claim/spend RPCs the
  *only* write path — and what makes S1/S3 the only ways around it.)
- **Every user-scoped table has RLS enabled** with select-own policies: `profiles`,
  `login_history`, `scenario_completions`, `country_reward_claims`, `country_unlocks`,
  `user_generated_scenarios`, `learning_user_word_forest`,
  `learning_user_word_progress`/review logs (per their migrations). Writes are
  RPC/service-role only.
- **Service-role key is backend-only.** `client/src/lib/supabase.js` uses
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon/publishable) only; grep for
  `SERVICE_ROLE`/`service_role` in `client/` returns nothing. The service key lives in
  `db.js` from `config.js` (`SUPABASE_SERVICE_ROLE_KEY`), never imported by client
  code. **BLOCKED.**

## 7. Input validation — BLOCKED

`node/routes/scenario.js` validates before use, rejecting with 400 (no coercion):
- `countryCode` via `resolveCountry` against the `COUNTRIES` catalog — 400 "Unknown
  countryCode" (`:152-156, 255-259`).
- `scenarioId` must be a non-empty string **and** resolve to a row in the caller's own
  generated chain via `getGeneratedScenario`; unknown → 400 (`:160-169, 260-273`).
- `langCode` (discovery) must be in `KNOWN_LANG_CODES` — 400 "Unknown langCode"
  (`:138-141`).
- `transcript` must be a non-empty string — 400 (`:264-267`).

Covered by tests "generate rejects unknown countryCode", "generate with unknown
scenarioId is a 400", "evaluate validates inputs", "discovery validates langCode".
The economy RPCs additionally re-validate country/scenario server-side. **BLOCKED.**

---

## Actions

- **S1 — done (pending owner `db push`):** `20260704000001_revoke_award_tokens.sql`
  revokes the `award_tokens` mint from `authenticated`. Also delete the dead
  `awardTokens` client helper.
- **S3 — specified, needs owner sign-off (point #2):** move
  `record_scenario_completion` to a service-role-only RPC keyed on a server-supplied
  `p_user_id`; drop the client `completeScenario` direct call. Not written this pass —
  it changes the RPC signature/money path.
- **Regression added:** `node/test/scenario_routes.test.js` — "forged pronScore and
  priorTurns cannot manufacture a completion on a failed verdict" locks the route-layer
  gate. `cd node && npm test` = 75 pass / 0 fail.
- **Note the general rule for the release checklist:** an economy RPC may be
  `GRANT`ed to `authenticated` only if every guard in its body holds against a hostile
  direct browser call. Audit any future RPC against that bar before granting.

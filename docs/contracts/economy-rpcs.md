# Contract: economy RPC surface

Status: existing surface FROZEN; new shapes **APPROVED by owner 2026-07-03** — the DRAFT proposal below is now the authoritative spec (default path: no mid-chain milestone RPC).
Owner: security-economy agent. Pattern for every RPC: `SECURITY DEFINER` → auth check → validate inputs against catalog → atomic update → return server truth.

## Existing RPCs (authoritative after all migrations; unchanged)
- `unlock_country_for_user(p_country_code, p_cost)` — server-enforced 100-token cost, validates country, gates on every prior unlocked country having a claimed reward, atomic decrement, returns `{tokens, unlockedCountries}`.
- `record_scenario_completion(p_country_code, p_scenario_id)` — idempotent, awards XP, recomputes level/rank.
- `claim_country_reward(p_country_code)` — all required scenarios complete → idempotent claim of `token_reward`.
- `award_tokens(p_amount)`, `reset_user_progress()`.

## What forward-chaining breaks
Scenarios are no longer a fixed per-country list, so (a) `p_scenario_id` can't be validated against the static catalog, and (b) "all required scenarios complete" in `claim_country_reward` needs a server-side definition.

## DRAFT proposal (sign-off required)
1. New table `user_generated_scenarios(user_id, country_code, scenario_id, superset, position, created_at)` — inserted **only by the backend (service role)** when the engine generates scenario N. RLS: user can select own rows; no user insert/update.
2. `record_scenario_completion` validation changes from static-catalog lookup to: `p_scenario_id` must exist in `user_generated_scenarios` for this user+country. Signature unchanged. Additionally, the route calls it only after an evaluator-confirmed pass (server-side; the client cannot reach a completion directly).
3. `claim_country_reward` completeness rule becomes: the user's generated chain for that country has reached its coverage target (a server-computed `chain_complete` flag on the last generated scenario, set by the engine when the basic tourist situations are covered), and every generated scenario is completed. Reward value stays the server-side `token_reward` (150) — never client-sent.
4. **No new client-callable award RPC.** Growing-scenario progress pays out only through the existing completion→claim path; per-word growth does not mint tokens. (Alternative, if the owner wants mid-chain payouts: `award_scenario_milestone(p_country_code, p_scenario_id)` in the same definer pattern, idempotent per scenario — flagged as an option, not the default.)

Invariants regardless of choice: no negative balances (existing DB checks stay), idempotency on every completion/claim, RLS on for all user-scoped tables, service role backend-only.

## Implemented — migration `20260703000000_generated_scenarios.sql`
Default path taken (no mid-chain milestone RPC). Adds `user_generated_scenarios(user_id, country_code→game_countries, scenario_id, superset, position, chain_complete default false, created_at)` and `learning_user_word_forest` (contract shape); both RLS select-own-only, no user write policy (service role writes). `record_scenario_completion` now authorizes `p_scenario_id` against the caller's own `user_generated_scenarios` chain (not `scenario_catalog`); `claim_country_reward` requires a `chain_complete = true` row AND zero uncompleted generated scenarios for the user+country, paying the server-side `country_rewards.token_reward`.

Schema fact (contradicted a clean impl): `scenario_completions` carried a composite FK to `scenario_catalog(country_code, scenario_id)`. Per-user generated scenario ids never exist in that static catalog, so the FK would reject every forward-chained completion. The migration drops that FK by discovered name (pg_constraint lookup, no hard-coded name) and moves the integrity check into the RPC. XP per generated completion is a fixed server constant (100), since generated scenarios have no `experience_reward` catalog row.

## Security review (adversarial pass)
- **Replay a completion** (call `record_scenario_completion` twice): idempotent `insert ... on conflict do nothing` + `get diagnostics` → second call inserts 0 rows, returns `false`, and the XP `update` is skipped. No double XP.
- **Replay a claim** (call `claim_country_reward` twice): `country_reward_claims` PK is `(user_id, country_code)`; `on conflict do nothing` → second call credits nothing, just re-returns the balance. No double tokens.
- **Forge a completion for a non-existent / not-yet-generated scenario**: RPC rejects with `Unknown scenario` (22023) unless a row exists in the caller's own `user_generated_scenarios`. The client cannot insert that row — RLS has no insert policy, only the service role writes it, and only after evaluator-confirmed generation. A client-fabricated `p_scenario_id` never authorizes.
- **Forge a chain-complete claim** (mark done early): `claim_country_reward` gates on a service-role-written `chain_complete = true` row plus zero pending generated scenarios. The browser cannot set `chain_complete` (no update policy → RLS denies), so it cannot fast-forward the coverage target. Completing fewer than all generated scenarios leaves `pending_count > 0` → `Country is not complete` (P0001).
- **Skip a country / unlock next without finishing**: `unlock_country_for_user` is untouched; its prior-country-reward gate still blocks a new unlock while any unlocked country lacks a claim. Claim now demands the full generated chain, so the gate is strictly harder to satisfy than before, not easier.
- **Cross-user read** (read another user's chain or forest): both new tables' only policy is `select ... using ((select auth.uid()) = user_id)`; a different uid returns zero rows. RLS stays enabled; the service-role key is backend-only.
- **Cross-user write via RPC**: all four economy functions derive `uid := auth.uid()` internally and scope every insert/update to it — no user-id parameter is accepted, so a caller cannot act as another user.
- **Negative balance**: no debit is introduced here; claim only credits. Debits stay in `unlock_country_for_user` with its `tokens >= p_cost` guard (untouched).

### Follow-up flagged (not in this ticket's scope)
`reset_user_progress` (last defined in `20260626000000`) deletes `scenario_completions`/`country_reward_claims`/`country_unlocks` but does not clear `user_generated_scenarios` or `learning_user_word_forest`. After a reset, a stale `chain_complete = true` row would let a re-completed chain be claimed without regenerating. Recommend a follow-up migration extending `reset_user_progress` to also delete the caller's rows from both new tables. Left out here to keep this migration single-concern and avoid re-touching the reset RPC.

**Resolved** by `20260703000001_reset_generated_state.sql`: `reset_user_progress` (preserving the authoritative 20260628 body — 100 tokens, no country unlocked) now also deletes the caller's `user_generated_scenarios` and `learning_user_word_forest` rows; grants re-issued, no other function touched.

## Phase-5 anti-cheat fixes (owner-approved 2026-07-04)
Standing rule added: **an economy RPC may be granted to `authenticated` only if every guard in its body holds against a hostile direct call.**

**S1 (mint) — DONE:** `award_tokens` revoked from `authenticated` (migration `20260704000001`). No legitimate caller; client `awardTokens` helper to be removed too.

**S2 (completion bypass) — APPROVED shape (owner wants an admin-only test skip kept):** completion reachable ONLY through the server evaluator, plus an admin-only skip.
1. `record_scenario_completion` → service-role-only. New signature takes explicit `p_user_id uuid` (auth.uid() is null under service role); REVOKE from `authenticated`. Chain-validation, idempotency, XP, level/rank recompute all preserved, keyed on `p_user_id`.
2. `node/routes/scenario.js` `/evaluate` calls it via the **service-role** client with `req.userId`, only after an `evaluateResponse` `pass:true` + met turn goal. (Currently calls as the user JWT — MUST switch to service-role or the legit path breaks under the revoke.)
3. Delete client-side `completeScenario` (App.jsx:136 / useProfile.js) — first verify the server `/evaluate` path covers every completion the app needs (incl. the real-life scenario).
4. **Admin test skip:** new route `POST /api/scenario/admin-complete` — `requireUser`, then a **server-side** admin check: caller email (JWT email claim or service-role `getUserById`, never client-sent) must equal `ADMIN_EMAIL` from repo-root `.env` (owner adds `ADMIN_EMAIL=rajayshashwat@gmail.com`). If admin → service-role completion RPC skipping the evaluator; else 403. Scenario still must be in the user's generated chain. Profile response exposes server-computed `isAdmin` so the UI shows a skip button to the admin only; server enforces regardless.
Regression tests: non-admin → 403; direct `authenticated` call to `record_scenario_completion` denied; admin skip completes; normal evaluator pass still completes.

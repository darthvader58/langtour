# Contract: Supermemory word-forest read/write

Status: FROZEN (Phase 2). Owners: supermemory + backend-graph agents.
API shapes below verified against Supermemory docs via Context7, 2026-07-03.

## Scoping
- `containerTag = "user_<supabase auth uuid>"` — exactly one per user, on every read and write. No call without it; never mix tags. Cross-tenant reads are a release blocker.

## Package revision notes (supermemory agent, 2026-07-04)
- Migrated off deprecated `@supermemory/ai-sdk@1.0.8` to `@supermemory/tools@2.0.0` (subpath `@supermemory/tools/ai-sdk`), pinned exact. Base `supermemory@4.24.12` client unchanged.
- Verified ai@6 compatibility before swapping: `@supermemory/tools@2.0.0` bundles its own `ai@5.0.29` (same pattern as the old package's `ai@5.0.210`) but its tool objects are plain `{description, inputSchema, execute}` — duck-typed at runtime, not compiled against the outer `ai`. Its `@ai-sdk/provider` peer range (`^2.0.0 || ^3.0.0`) covers the repo's resolved `@ai-sdk/provider@3.0.10`. `getMemoryTools` still not wired into any live `generateText`/`generateObject` call — that verification remains open for whoever wires it in.
- `node/lib/memory/forest.js` only changed its import path; the four contract exports are unchanged.
- Base client: use singular `containerTag` on `add` (plural `containerTags` is deprecated there).

## Packages
- `@supermemory/ai-sdk` → `supermemoryTools(SUPERMEMORY_API_KEY, { containerTags: [tag] })` gives `searchMemories` / `addMemory` / `fetchMemory` tools for in-dialog use with `ai` + `@ai-sdk/google`.
- Base `supermemory` client → `client.profile({ containerTag, q?, threshold? })` returns `{ profile: { static: string[], dynamic: string[] }, searchResults? }`. Note: `profile()` is on the base client, NOT the ai-sdk tools package.
- `SUPERMEMORY_API_KEY` exported from `node/lib/config.js` (export to be added; key already in repo-root `.env`).

## What lives in Supermemory (source of truth for learning state)
Written as natural-language memories on evaluator-confirmed events only (server-side):
- Word mastery events: word, language, situation, scenario id, when, quality (FSRS rating).
- Situation clears: scenario id, superset tree (e.g. "food & stuff"), country, when.
- Forest placement: which superset tree a word hangs under.

Reads:
- `profile().static` → mastered vocab + cleared situations (feeds forward-chaining seed).
- `profile().dynamic` → current learning cycle; words absent from `dynamic` for a while = stale, resurface via scenario generation.
- `searchMemories` during dialog for sidekick continuity.

## What mirrors to Postgres (source of truth for display + FSRS math)
- `learning_words` (shared dictionary, keyed `(expression, language)`) and `learning_user_word_progress` (per-user FSRS) stay exactly as-is — FSRS scheduling math stays in Postgres, not Supermemory.
- New mirror table for forest structure, written in the same server codepath that writes the Supermemory memory, so `/api/profile/word-graph` can serve root → tree → word without calling Supermemory. Agreed shape (security-economy writes the DDL; supermemory writes rows via service role):
  `learning_user_word_forest(user_id uuid, word_id bigint references learning_words, superset text, mastery_tier smallint, last_used_at timestamptz, updated_at timestamptz, primary key (user_id, word_id))` — RLS: user selects own rows; no user writes.
  Invariant: **the graph endpoint never blocks on Supermemory.**

## JS surface (seam: supermemory agent implements, backend-graph calls)
`node/lib/memory/forest.js` exports exactly these; backend-graph codes against them and stubs them in tests:
```js
recordMasteryEvent(userId, { wordId, expression, language, superset, scenarioId, rating })  // → Promise<void>; dual-writes Supermemory + Postgres mirror
recordSituationClear(userId, { scenarioId, superset, countryCode })                         // → Promise<void>
getForestProfile(userId)   // → Promise<{ mastered: [...], currentCycle: [...], trees: { [superset]: [expression] } }>  (wraps profile())
getStaleWords(userId, { limit })  // → Promise<[{ wordId, expression, language, lastUsed }]>  (derived from profile().dynamic + Postgres mirror)
```

## Write path
Only the backend (service role) writes either store, and only from evaluator-confirmed passes. The client never writes learning state.

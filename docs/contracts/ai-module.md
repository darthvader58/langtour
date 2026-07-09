# Contract: node/lib/ai/ function seam

Status: FROZEN (Phase 2). Agreed between backend-graph (caller) and game-ai (owner).
Ownership: game-ai owns everything under `node/lib/ai/`. backend-graph owns `node/routes/scenario.js` and calls these functions; it never edits `node/lib/ai/`. The prompts currently inline in `scenario.js` move into this module as part of Phase 3 (the `node/lib/ai/prompts/` dir exists but is empty today).

## Shared ctx object
```js
ctx = {
  userId,          // supabase auth uuid
  langCode,        // 'zh'|'hi'|'fr'|'es'|'ar'|'pt' — must cover ALL catalog languages (ar/pt are missing from today's inline maps; fix in Phase 3)
  countryCode,     // 'cn'|'in'|'fr'|'mx'|'eg'|'br', validated against catalog before the call
  scenarioId,
  situation,       // { id, title, superset } from the scenario engine
  personaId,       // sidekick persona key (see sidekick-personas.md)
  targetWords,     // [{ id, expression, reading, meaning }] — current (growing) set
  priorTurns,      // [{ speaker: 'npc'|'user', text }]
  turnIndex,
}
```

## generateTurn(ctx) → Promise<{
```js
  npcLine:      { text, reading, translation },  // in-scene interlocutor line
  sidekickLine: { text } | null,                 // persona-voiced coaching aside, English, PG
  expectedIntent: string,                        // one sentence: what a good reply accomplishes
  targetWords:  [{ id, expression, reading, meaning }]  // possibly grown vs ctx.targetWords
}>
```

## evaluateResponse(ctx, transcript, pronScore = null) → Promise<{
```js
  pass: boolean,
  errorKind: 'off-topic'|'too-vague'|'bare-word'|'grammar'|'wrong-word'|'wrong-register'|null,
  teachingNote: string,        // names the error, nudges toward the fix; NEVER the full correct sentence
  sidekickLine: { text },      // persona voice for the verdict
  usedWords: [wordId],         // words used correctly → FSRS updates
}>
```
`pronScore` is the optional `scorePronunciation` result (see speech-pipeline.md); pass `null` when absent, and the evaluator must work fully without it.

## Pass rubric (all three required — this replaces "said one target word")
1. Meaningful, contextually appropriate reply to what the NPC/situation asked. A bare word fails. A filler sentence that just contains the word fails.
2. Grammatically correct for that language and register (minor accent/STT noise tolerated; broken structure not).
3. Target vocab used correctly in that sentence.

## Implementation clarifications (game-ai, 2026-07-04 — binding on callers)
- Words newly grown by `generateTurn` arrive with `id: null` (the model cannot mint DB ids). The route layer resolves or creates the `learning_words` row and assigns the real id before persisting or passing the word onward.
- `evaluateResponse.usedWords` contains only ids of words present in `ctx.targetWords` (deduped); model-claimed expressions outside the target set are dropped, never passed through.
- Bare-word detection is deterministic and pre-model: an exact target-expression match (or a single token in space-delimited scripts) fails with `errorKind: 'bare-word'` without a model call.

## Invariants
- Pass/fail is decided only here, only server-side; a `pass:true` is the sole trigger for FSRS updates and (when the scenario's turn goal is met) `record_scenario_completion`. The route layer enforces that; this module never touches the DB economy.
- All model output constrained to PG, on-topic tourist language. Keep prompts token-lean.

## Model provider chain (game-ai, 2026-07-09 — binding on callers)
`generateStructured` (`node/lib/ai/model.js`, used by both `generateTurn` and `evaluateResponse`) is a **fallback chain**, not one call. Reason: Gemini's free tier is 20 req/day for `gemini-2.5-flash`, and the AI SDK retries a 429 by default — silently burning the daily quota on one dead request.
- **Order:** `cerebras` (`gpt-oss-120b`) → `groq` (`llama-3.3-70b-versatile`) → `gemini` (`gemini-2.5-flash`, existing). Cerebras and Groq both have materially higher free-tier ceilings and confirmed `generateObject`/structured-output support (verified via Context7 against `/vercel/ai`'s provider capability tables, `ai@6.0.208`, `@ai-sdk/cerebras@3.0.6`, `@ai-sdk/groq@4.0.6`, `@ai-sdk/google@3.0.83`); Gemini is now the last-resort link, not the first call.
- **New env keys** (`node/lib/config.js`, repo-root `.env`, optional): `CEREBRAS_API_KEY`, `GROQ_API_KEY`. A missing key silently skips that link — never a boot crash. `GEMINI_API_KEY` behavior is unchanged.
- **Advance-the-chain errors:** HTTP 429 / `RESOURCE_EXHAUSTED`, and 5xx / network-unavailable errors (checked via `isProviderUnavailable` in `model.js`, using `APICallError.isInstance`/`.statusCode` from `ai`). **Non-advancing:** schema/validation errors (e.g. `NoObjectGeneratedError`) and any other 4xx — those indicate a prompt bug, which is identical on every provider, so they're rethrown immediately instead of masking the bug behind two more failed calls.
- Each per-provider call passes `maxRetries: 0` — the chain itself is the retry strategy; the SDK must never retry a 429 and burn that provider's quota on its own.
- **`ModelQuotaError`** (`node/lib/ai/errors.js`, re-exported from `node/lib/ai/index.js`): thrown when every configured provider in the chain hit a quota/availability error (or none are configured at all). Shape: `{ name: 'ModelQuotaError', code: 'model_quota_exhausted', message, attempted: string[] }` (`attempted` = provider names tried, in order). **Route-layer contract:** `node/routes/scenario.js` should catch this (`instanceof ModelQuotaError` or `.code === 'model_quota_exhausted'`) around any `generateTurn`/`evaluateResponse` call and map it to a clean response (e.g. 503 with a player-facing "try again in a bit" message) — never leak the raw provider chain or attempt list to the client, and never let it fall through to a generic 500.
- Embeddings (`node/lib/graph/graph.js`, `gemini-embedding-2`) are **not** part of this chain and are untouched by this change.

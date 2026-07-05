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
- All model output constrained to PG, on-topic tourist language. Gemini `gemini-2.5-flash` via `ai` + `@ai-sdk/google`; keep prompts token-lean.

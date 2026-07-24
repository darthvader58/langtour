# Contract: speech pipeline

Status: **APPROVED by owner 2026-07-03.** Deepgram foundation frozen; the Azure F0 scorer prove-out is greenlit under the conditions below (adopt only if it provably beats the baseline; interface unchanged either way).
Owner: speech-pipeline agent.

## Decision (proposed)
Deepgram stays the STT foundation for both live captions and the evaluator transcript. It is proven here; nothing replaces it. Hardening work (reconnects, non-native-accent tuning per target language, punctuation/smart_format kept) proceeds without further sign-off. Any *added* engine needs the owner's yes first.

## Transcript → evaluator flow
1. `MicrophoneRecorder.jsx` streams audio to the Deepgram live WS in `node/routes/voice.js` → interim results render as live captions (UX unchanged).
2. The finalized utterance transcript (batch or WS-final) is what the client posts to `/api/scenario/evaluate`.
3. The route hands it to `evaluateResponse(ctx, transcript, pronScore)` (see ai-module.md). The transcriber captures *what was said*; the evaluator alone decides *whether it was a real answer*. No pass/fail logic in the speech layer, ever.

## Optional pronunciation scorer (candidate: Azure Speech, F0, region eastus2 — already provisioned)
Only if it provably beats the Deepgram-plus-evaluator baseline on real samples. If adopted, it sits behind this swappable interface and callers never know the engine:

```js
scorePronunciation(audio, lang, targetText) → Promise<{
  accuracy: number, fluency: number, completeness: number,
  perWord: [{ word, accuracy }]
}>
```

Its result feeds `evaluateResponse` as the optional `pronScore` arg — a secondary signal, never a gate on its own. If the prove-out fails, it is left out and `pronScore` stays `null`. Keys: `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` in repo-root `.env` (exports to be added to `node/lib/config.js` only if adopted).

## Turn-level mispronunciation gate (adopted 2026-07-24, owner-approved)
Deepgram normalizes audio to the nearest real word, so a badly mispronounced target word gets silently "corrected" and the text-only evaluator never sees it. The gate closes that: score the take against the Deepgram transcript and flag target words whose pronunciation is too low to be an accent.

- **Module:** `node/lib/voice/turnPronunciation.js`.
  - `findMajorMispronunciations(pronScore, targetWords, threshold=35) → [{expression, accuracy}]` — pure. Flags only target words the learner *attempted* (present in `perWord`) scoring **< 35**; omission is the evaluator's job, not the gate's. Multi-token expressions take their weakest token's accuracy.
  - `assessTurnPronunciation({projectId, langCode, transcript, targetWords}) → {pronScore, majorMispronunciations} | null`. Returns `null` (fail-open → Deepgram-only) when not configured, no stored audio, a bad/traversal project id, or the engine errors.
  - `cleanupTurnAudio(projectId)` — deletes the temp gameplay project after scoring; idempotent.
- **Threshold:** `MAJOR_MISPRONUNCIATION_THRESHOLD = 35` (Azure 0–100), owner-set. Accent-level wobble scores well above it.
- **Server-authoritative, not client-sent.** The client posts a **`projectId`** to `/api/scenario/evaluate` (not a score). The route (`scenario.js`) loads that project's stored audio (`saveVoiceAudio` persisted it on WS `stop`), scores server-side, and on a major mispronunciation returns `{pass:false, errorKind:'mispronunciation', teachingNote, ...}` — short-circuiting *before* `evaluateResponse`, with no FSRS/forest/completion effect (fail-and-teach, learner retries). A client-sent score is never trusted (it could only be used to dodge the flag). `errorKind:'mispronunciation'` is in `ERROR_KINDS`; the client badge label is "Mispronounced".
- **Audio lifecycle:** temp project created on record start → audio saved server-side on `stop` → scored + deleted by the evaluate route. `MicrophoneRecorder.jsx` no longer deletes on `final`; it keeps an unmount safety-net delete for abandoned takes.

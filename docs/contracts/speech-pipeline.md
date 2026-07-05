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

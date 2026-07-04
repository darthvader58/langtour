// Per-language Deepgram parameter selection + live-WS lifecycle constants.
// Pure functions so the choices are unit-testable without a network.
//
// Model choices (verified against Deepgram's models-languages-overview, read 2026-07-04):
// - nova-2 does NOT support Arabic at all — the old hardcoded nova-2 batch URL meant
//   Arabic (Egypt) transcription failed outright. Arabic must use nova-3.
// - nova-2 stays for Chinese batch: verified in this repo as having stronger Chinese
//   coverage + better diarization on complete audio than nova-3 (see voice.js history).
// - hi/fr/es/pt move to nova-3 for batch: newest general model, more robust to the
//   non-native accents this game is all about. All six languages are in nova-3's list.
// - Live streaming already used nova-3 for everything; that stays.

const SUPPORTED_LANGS = ['zh', 'hi', 'fr', 'es', 'ar', 'pt'];
const DEFAULT_LANG = 'zh';

const BATCH_MODEL = {
  zh: 'nova-2',
  hi: 'nova-3',
  fr: 'nova-3',
  es: 'nova-3',
  ar: 'nova-3',
  pt: 'nova-3',
};

const LIVE_MODEL = {
  zh: 'nova-3',
  hi: 'nova-3',
  fr: 'nova-3',
  es: 'nova-3',
  ar: 'nova-3',
  pt: 'nova-3',
};

export function supportedLangs() {
  return [...SUPPORTED_LANGS];
}

export function isSupportedLang(lang) {
  return SUPPORTED_LANGS.includes(String(lang || '').toLowerCase());
}

// Client-sent language codes are untrusted input; clamp to the catalog instead of
// passing arbitrary strings into a Deepgram URL.
export function normalizeLang(lang) {
  const v = String(lang || '').toLowerCase();
  return SUPPORTED_LANGS.includes(v) ? v : DEFAULT_LANG;
}

// Batch (pre-recorded): accuracy first, latency irrelevant. punctuate + smart_format
// kept exactly as before — the evaluator transcript depends on them.
export function batchUrl(lang) {
  const l = normalizeLang(lang);
  return `https://api.deepgram.com/v1/listen?model=${BATCH_MODEL[l]}&language=${l}&diarize=true&punctuate=true&smart_format=true`;
}

// Live (streaming): lean params, lowest latency, caption UX unchanged.
// utterance_end_ms must be >= 1000 AND requires interim_results=true (see IS-019).
export function liveUrl(lang) {
  const l = normalizeLang(lang);
  return `wss://api.deepgram.com/v1/listen?diarize=true&model=${LIVE_MODEL[l]}&language=${l}&interim_results=true&utterance_end_ms=1000`;
}

// --- Live-WS lifecycle -------------------------------------------------------------
// Deepgram closes a silent stream after ~10s (NET-0001). A JSON {"type":"KeepAlive"}
// frame resets that timer; 5s leaves comfortable margin over the gap between WS open
// and the recorder's first chunk, and over any mid-recording pause.
export const KEEPALIVE_INTERVAL_MS = 5000;

// Transient upstream drops are recovered by reconnecting and resuming the relay.
// Losing a beat of live captions is acceptable — the authoritative transcript is the
// batch pass on stop — so retries are few and fast rather than heroic.
export const LIVE_MAX_RECONNECTS = 3;

// While reconnecting, incoming browser audio buffers so the caption stream resumes
// mid-utterance instead of going deaf. Cap it so a wedged upstream can't grow memory
// unbounded (~512 chunks at 100ms cadence ≈ 51s of audio, far beyond any retry window).
export const PENDING_AUDIO_MAX_CHUNKS = 512;

export function reconnectDelayMs(attempt) {
  // 250ms, 500ms, 1000ms, ... capped at 2s.
  return Math.min(250 * 2 ** attempt, 2000);
}

export function shouldReconnect(attempt) {
  return attempt < LIVE_MAX_RECONNECTS;
}

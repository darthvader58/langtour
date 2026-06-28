// Speech pronunciation scoring — public entry point (contract 05).
//
// Supported MIME types for the `audio` Buffer:
//   audio/wav (PCM, any sample-rate — Azure adapter normalises to 16 kHz mono)
//   audio/webm;codecs=opus (browser MediaRecorder output — converted via ffmpeg)
//
// The engine is swappable without touching callers:
//   SPEECH_ENGINE=azure      (default, launch)
//   SPEECH_ENGINE=speechace  (accent-tolerant upgrade, requires SPEECHACE_API_KEY)
//   SPEECH_ENGINE=gopt       (self-hosted zero-cost fallback, requires GOPT_ENDPOINT)
//
// Pass opts.engine to override the env var for a single call (test/admin use only;
// the route does NOT expose this to callers — the server picks the engine, the client
// cannot override it, per the server-truth invariant in CLAUDE.md).

export { getScorer } from './dispatch.js';
import { dispatch } from './dispatch.js';

/**
 * Score the pronunciation of `audio` against `targetText` in language `lang`.
 *
 * @param {Buffer} audio - Raw audio buffer from the mic recording.
 * @param {string} lang  - BCP-47 base language code: zh | fr | es | hi | ar | pt
 * @param {string} targetText - Reference sentence the user was expected to say.
 * @param {{ engine?: string, requestId?: string }} [opts]
 * @returns {Promise<{
 *   accuracy:     number;   // 0–100 overall phoneme accuracy
 *   fluency:      number;   // 0–100 rhythm / pacing / pauses
 *   completeness: number;   // 0–100 fraction of targetText attempted
 *   perWord: Array<{ word: string; score: number }>;  // 0–100 per word in targetText order
 * }>}
 */
export async function scorePronunciation(audio, lang, targetText, opts = {}) {
  return dispatch(audio, lang, targetText, opts);
}

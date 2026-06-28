// Engine dispatcher for the speech pronunciation scorer (contract 05).
//
// Precedence for engine selection (highest to lowest):
//   1. opts.engine (call-site override)
//   2. SPEECH_ENGINE env var
//   3. 'azure' (launch default, per owner ratification)
//
// On Engine5xxError from the primary engine, the dispatcher falls through to
// GOPT as a fallback. If GOPT also fails (including NotImplementedError from
// the stub), the sentinel score { accuracy:0, fluency:0, completeness:0, perWord:[] }
// is returned so evaluateResponse can degrade gracefully to transcript-only judgment.
//
// Every engine choice and fallback transition is logged with a requestId so
// usage and budget can be audited.

import { randomUUID } from 'node:crypto';
import { azureAdapter } from './azureAdapter.js';
import { speechaceAdapter } from './speechaceAdapter.js';
import { goptAdapter } from './goptAdapter.js';
import { Engine5xxError } from './errors.js';

export { Engine5xxError, NotImplementedError } from './errors.js';

// Zero-score sentinel returned when all engines fail (contract 05).
// evaluateResponse treats this as "no score available" and skips the
// incomprehensible_pronunciation errorKind, falling back to transcript-only judgment.
export const SENTINEL_SCORE = Object.freeze({ accuracy: 0, fluency: 0, completeness: 0, perWord: [] });

// Exported so tests can target individual adapter methods via t.mock.method without
// re-mocking entire modules — keeps test setup simple and avoids ESM module-cache fights.
export const ADAPTER_MAP = {
  azure: azureAdapter,
  speechace: speechaceAdapter,
  gopt: goptAdapter,
};

/**
 * Returns the scorer adapter for the given engine name (or the active default).
 * Callers that need to inspect the adapter without running a score can use this,
 * but most callers should use scorePronunciation() instead.
 *
 * @param {{ engine?: string }} [opts]
 * @returns {{ scorePronunciation: Function }}
 */
export function getScorer(opts = {}) {
  const engine = opts.engine ?? process.env.SPEECH_ENGINE ?? 'azure';
  return ADAPTER_MAP[engine] ?? azureAdapter;
}

/**
 * Dispatches a pronunciation-scoring request to the appropriate engine.
 * Handles fallback and sentinel on engine failure.
 *
 * @param {Buffer} audio
 * @param {string} lang - BCP-47 base code (zh | fr | es | hi | ar | pt)
 * @param {string} targetText
 * @param {{ engine?: string, requestId?: string }} [opts]
 * @returns {Promise<{ accuracy: number, fluency: number, completeness: number, perWord: Array<{word:string,score:number}> }>}
 */
export async function dispatch(audio, lang, targetText, opts = {}) {
  const requestId = opts.requestId ?? randomUUID();
  const primaryEngine = opts.engine ?? process.env.SPEECH_ENGINE ?? 'azure';

  console.log(`[speech] [${requestId}] engine=${primaryEngine} lang=${lang}`);

  const primary = ADAPTER_MAP[primaryEngine] ?? azureAdapter;

  try {
    return await primary.scorePronunciation({ audio, lang, targetText });
  } catch (err) {
    if (err instanceof Engine5xxError) {
      console.warn(
        `[speech] [${requestId}] ${primaryEngine} 5xx — falling back to gopt: ${err.message}`
      );
      try {
        return await goptAdapter.scorePronunciation({ audio, lang, targetText });
      } catch (goptErr) {
        // Includes NotImplementedError from the stub — GOPT is not yet wired.
        console.error(
          `[speech] [${requestId}] gopt fallback failed: ${goptErr.message} — returning sentinel score`
        );
        return { ...SENTINEL_SCORE };
      }
    }
    // 401/403, unknown lang, NotImplementedError from Speechace stub — propagate loudly.
    throw err;
  }
}

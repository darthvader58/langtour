// Speechace adapter stub — interface-conformant; throws NotImplementedError until wired.
//
// Speechace is the accent-tolerant upgrade path (free trial on every plan).
// It is designed NOT to penalize intelligible non-native accent — the key
// differentiator over Azure for learners with strong L1 interference.
//
// Future implementer: pull the current Speechace API docs before coding.
//   Docs URL:  https://docs.speechace.com
//   npm/node:  no official SDK; use REST API directly (same approach as azureAdapter.js).
//   Auth:      X-API-KEY header (or api_key query param on some endpoints).
//   Scoring:   POST /api/scoring/text/pron/json
//              Returns word-level phoneme scores + fluency; scale is 0..1 (normalize to 0..100).
//
// Set SPEECH_ENGINE=speechace (or pass opts.engine='speechace') to activate.

import { NotImplementedError } from './errors.js';

export const speechaceAdapter = {
  /**
   * @param {{ audio: Buffer, lang: string, targetText: string }} _input
   * @returns {Promise<never>}
   */
  async scorePronunciation(_input) {
    throw new NotImplementedError(
      'Speechace adapter is not yet implemented. ' +
      'Set SPEECH_ENGINE=azure (default) or implement speechaceAdapter.scorePronunciation. ' +
      'See node/lib/speech/speechaceAdapter.js for the integration guide.'
    );
  },
};

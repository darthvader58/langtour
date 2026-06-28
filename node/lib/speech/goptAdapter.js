// GOPT adapter stub — interface-conformant; throws NotImplementedError until wired.
//
// GOPT (Goodness of Pronunciation Transformer) is the zero-recurring-cost fallback.
// It is self-hosted using the pre-trained model on the speechocean762 non-native corpus.
//   Repo:     https://github.com/YuanGongND/gopt
//   Dataset:  speechocean762 (open non-native English corpus, ~10% phoneme error rate)
//   Hosting:  run as a local HTTP inference server alongside the Node backend,
//             or containerize alongside Railway services.
//
// Future implementer notes:
//   1. Deploy the GOPT model as an HTTP endpoint (e.g. FastAPI) accessible from Node.
//   2. Set GOPT_ENDPOINT env var (e.g. http://localhost:8766/score).
//   3. POST audio + targetText to the endpoint; parse per-phoneme scores into PronScore shape.
//   4. GOPT returns phoneme-level scores (0..1) — aggregate per-word by averaging phonemes
//      in each word, then scale to 0..100.
//   5. No lang support beyond English in the base model — extend with a multilingual
//      forced-aligner (e.g. MFA) if fr/es/zh support is needed.
//
// This stub also serves as the GOPT fallback in the dispatcher when Azure returns a 5xx.
// When reached via fallback, it throws the same NotImplementedError, which the dispatcher
// catches and converts to the sentinel score (accuracy: 0, fluency: 0, completeness: 0).

import { NotImplementedError } from './errors.js';

export const goptAdapter = {
  /**
   * @param {{ audio: Buffer, lang: string, targetText: string }} _input
   * @returns {Promise<never>}
   */
  async scorePronunciation(_input) {
    throw new NotImplementedError(
      'GOPT adapter is not yet implemented. ' +
      'Set SPEECH_ENGINE=azure (default) or self-host the GOPT model and implement goptAdapter.scorePronunciation. ' +
      'See node/lib/speech/goptAdapter.js for the integration guide.'
    );
  },
};

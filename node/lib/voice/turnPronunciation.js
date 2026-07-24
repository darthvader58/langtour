// Turn-level pronunciation gate for gameplay. Wraps the Azure scorer
// (scorePronunciation) with the game's decisioning: score the learner's audio
// against the Deepgram transcript, then flag any TARGET word whose pronunciation
// accuracy is so low it is a genuine mispronunciation rather than an accent.
//
// The score is computed server-side from the audio the voice pipeline already
// stored on disk per temp project (routes/voice.js saveVoiceAudio on 'stop').
// The client never supplies the score — a client-sent score could only be used
// to dodge the flag, so trusting it would make the gate pointless. The client
// passes the project id; the server loads that project's audio and scores it.
// See docs/contracts/speech-pipeline.md.
import { scorePronunciation, isPronunciationScoringConfigured } from './pronunciation.js';
import { loadVoiceAudio, deleteVoiceProject } from './projectStore.js';

// Azure accuracy is 0–100. A target word scoring below this counts as a major
// mispronunciation (owner-set 2026-07-24). Accent-level wobble and STT noise
// score well above it and pass untouched.
export const MAJOR_MISPRONUNCIATION_THRESHOLD = 35;

// Same normalization as the evaluator's word matching (ai/index.js): lowercase,
// drop punctuation/symbols, collapse whitespace. Keeps "水!" and "水" equal and
// splits space-delimited scripts into comparable tokens.
function normalize(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pure: given an Azure pronScore and the scenario's target words, return the
// target words the learner ATTEMPTED but pronounced below `threshold`. A word the
// learner never said (absent from perWord) is never flagged — omission is the
// evaluator's concern, not ours. A multi-token expression takes its weakest
// token's accuracy: one badly mangled syllable is enough to flag the word.
export function findMajorMispronunciations(
  pronScore,
  targetWords,
  threshold = MAJOR_MISPRONUNCIATION_THRESHOLD,
) {
  const perWord = pronScore?.perWord ?? [];
  if (perWord.length === 0) return [];

  // Normalized spoken token → worst accuracy Azure reported for it.
  const spoken = new Map();
  for (const w of perWord) {
    const key = normalize(w.word);
    if (!key || typeof w.accuracy !== 'number') continue;
    const prev = spoken.get(key);
    spoken.set(key, prev == null ? w.accuracy : Math.min(prev, w.accuracy));
  }

  const flagged = [];
  for (const target of targetWords ?? []) {
    const tokens = normalize(target.expression).split(' ').filter(Boolean);
    let worst = null;
    for (const tok of tokens) {
      if (spoken.has(tok)) worst = worst == null ? spoken.get(tok) : Math.min(worst, spoken.get(tok));
    }
    // worst == null → the learner never attempted this target word; skip it.
    if (worst != null && worst < threshold) {
      flagged.push({ expression: target.expression, accuracy: worst });
    }
  }
  return flagged;
}

// Score one turn's audio and detect major mispronunciations. Returns null when
// scoring is unavailable — not configured, no stored audio, a bad project id, or
// the engine errored — so gameplay degrades to Deepgram-only and is never blocked
// by the scorer. Deps are injectable for tests.
export async function assessTurnPronunciation({ projectId, langCode, transcript, targetWords }, {
  configured = isPronunciationScoringConfigured,
  loadAudio = loadVoiceAudio,
  score = scorePronunciation,
  threshold = MAJOR_MISPRONUNCIATION_THRESHOLD,
} = {}) {
  if (!projectId || typeof projectId !== 'string' || !configured()) return null;
  try {
    // loadAudio validates the path is under the store base (throws otherwise),
    // so a forged/traversal project id lands here and degrades to null.
    const loaded = loadAudio(projectId);
    if (!loaded?.buf?.length) return null;
    const pronScore = await score(loaded.buf, langCode, transcript);
    return {
      pronScore,
      majorMispronunciations: findMajorMispronunciations(pronScore, targetWords, threshold),
    };
  } catch (e) {
    console.warn('[pron] scoring unavailable, falling back to transcript-only:', e.message);
    return null;
  }
}

// Delete the temp gameplay project once its audio has been scored. Idempotent and
// swallows errors — a project already gone (client cleanup, retry) is fine.
export function cleanupTurnAudio(projectId) {
  if (!projectId || typeof projectId !== 'string') return;
  try { deleteVoiceProject(projectId); } catch { /* already gone */ }
}

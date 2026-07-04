// Growing word targets — replaces the old hard 4-word cap.
//
// A scenario starts small (3-4 words) and grows its target set as the player
// actually uses words, up to an adaptive per-situation cap derived from how
// many words a tourist essentially needs there and how fast this player moves.
// Elementary and to-the-point: the cap never exceeds MAX_TARGET_WORDS, so a
// scenario can never balloon into something overwhelming.

export const MIN_TARGET_WORDS = 3;
export const MAX_TARGET_WORDS = 8;

// Fraction of the current target set that must be used before it grows.
const GROWTH_THRESHOLD = 0.75;
// Words added per growth step — small nudges, never a wall of new vocab.
const GROWTH_STEP = 2;

// Per-situation ceiling. essentialCount is the situation's survival-vocab size
// (see ESSENTIAL_WORDS_BY_SUPERSET); passRate is the player's pace so far.
export function computeAdaptiveCap({ essentialCount, passRate = 0 } = {}) {
  const essentials = Number.isFinite(essentialCount) ? essentialCount : MIN_TARGET_WORDS;
  const paceBoost = passRate >= 0.75 ? 2 : passRate >= 0.5 ? 1 : 0;
  const cap = Math.min(essentials, 4 + paceBoost);
  return Math.max(MIN_TARGET_WORDS, Math.min(MAX_TARGET_WORDS, cap));
}

// Where a fresh scenario starts: 3 for a new/slow player, 4 for a quick one,
// never above the cap.
export function initialTargetSize({ adaptiveCap, passRate = 0 } = {}) {
  const start = passRate >= 0.75 ? 4 : MIN_TARGET_WORDS;
  const cap = Number.isFinite(adaptiveCap) ? adaptiveCap : MAX_TARGET_WORDS;
  return Math.max(MIN_TARGET_WORDS, Math.min(start, cap));
}

// Decide whether the target set should grow after a passed turn. Growth kicks
// in when the player has used most of the current set and the cap allows it.
export function computeGrowth({ targetWordIds = [], usedWordIds = [], adaptiveCap } = {}) {
  const cap = Number.isFinite(adaptiveCap) ? adaptiveCap : MAX_TARGET_WORDS;
  const usedSet = new Set(usedWordIds);
  const usedCount = targetWordIds.filter((id) => usedSet.has(id)).length;
  const size = targetWordIds.length;

  const shouldGrow = size < cap && size > 0 && usedCount >= Math.ceil(size * GROWTH_THRESHOLD);
  const growBy = shouldGrow ? Math.min(GROWTH_STEP, cap - size) : 0;

  return {
    usedCount,
    targetSize: size + growBy,
    growBy,
    shouldGrow,
    adaptiveCap: cap,
  };
}

// A scenario's turn goal is met only when the target set has grown to its
// adaptive cap AND every word in it has been used correctly. This — behind an
// evaluator-confirmed pass — is the sole trigger for record_scenario_completion.
export function isScenarioComplete({ targetWordIds = [], usedWordIds = [], adaptiveCap } = {}) {
  const cap = Number.isFinite(adaptiveCap) ? adaptiveCap : MAX_TARGET_WORDS;
  if (targetWordIds.length < cap) return false;
  const usedSet = new Set(usedWordIds);
  return targetWordIds.every((id) => usedSet.has(id));
}

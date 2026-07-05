// Pure helpers for the growing target-word set. The server (growth payload,
// docs/contracts/ai-module.md / node/routes/scenario.js) is the only source
// of truth for progress and completion — these functions just shape that
// payload for display, they never compute pass/fail or completion themselves.

const emptyGrowth = { targetWordIds: [], usedWordIds: [], targetSize: 0, adaptiveCap: null, grewBy: 0 }

export function normalizeGrowth(growth) {
  return { ...emptyGrowth, ...growth }
}

// 0-100, clamped, for a progress bar. targetSize is the current (possibly
// grown) denominator — never a fixed TOTAL_TURNS.
export function progressPercent(growth) {
  const { usedWordIds, targetSize } = normalizeGrowth(growth)
  if (!targetSize) return 0
  return Math.max(0, Math.min(100, Math.round((usedWordIds.length / targetSize) * 100)))
}

export function isWordUsed(wordId, growth) {
  return normalizeGrowth(growth).usedWordIds.includes(wordId)
}

// Words present now but absent from the previous turn's target set — the
// signal for a "new word" entrance treatment in the UI. Matched by id when
// possible (server-resolved words), falling back to expression for the rare
// frame where a just-grown word still carries id:null.
export function newlyGrownWords(previousTargetWords, currentTargetWords) {
  const prevIds = new Set((previousTargetWords ?? []).map((w) => w.id))
  const prevExpressions = new Set((previousTargetWords ?? []).map((w) => w.expression))
  return (currentTargetWords ?? []).filter((w) => {
    if (w.id != null) return !prevIds.has(w.id)
    return !prevExpressions.has(w.expression)
  })
}

export function isChainComplete(growth) {
  return Boolean(normalizeGrowth(growth).chainComplete)
}

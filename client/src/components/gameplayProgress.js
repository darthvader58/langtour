// Pure, I/O-free helpers for deriving gameplay progress from the server-
// authoritative growing-target state.  Extracted so they can be unit-tested
// without mounting the component.

/**
 * Derive display progress from the current attestation count and the live
 * (un-attested) target word list.
 *
 * windowSize = attestedCount + currentTargetWords.length
 *   — the number of words inside the current growth window.
 * progressPct = attestedCount / windowSize * 100, rounded to an integer.
 *
 * @param {number} attestedCount  Words attested so far in this session.
 * @param {Array}  currentTargetWords  Un-attested words remaining in the window.
 * @returns {{ attestedCount: number, windowSize: number, progressPct: number }}
 */
export function deriveProgress(attestedCount, currentTargetWords) {
  const windowSize = attestedCount + (currentTargetWords?.length ?? 0);
  return {
    attestedCount,
    windowSize,
    progressPct: windowSize > 0 ? Math.round((attestedCount / windowSize) * 100) : 0,
  };
}

/**
 * Return the set of word IDs that appear in nextTargetWords but not in
 * prevTargetWords.  These are words the server just added to the window
 * (a grow event) and should receive a brief visual highlight.
 *
 * Words without an `id` field are ignored — they cannot be tracked across turns.
 *
 * @param {Array} prevTargetWords
 * @param {Array} nextTargetWords
 * @returns {Set<number>}
 */
export function detectNewWordIds(prevTargetWords, nextTargetWords) {
  const prevIds = new Set((prevTargetWords ?? []).map((w) => w.id).filter((id) => id != null));
  const result = new Set();
  for (const w of nextTargetWords ?? []) {
    if (w.id != null && !prevIds.has(w.id)) result.add(w.id);
  }
  return result;
}

/**
 * Normalize a word object from either the discovery shape
 * ({ zh, pinyin, en }) or the growing-target shape ({ expression, reading, meaning })
 * into a consistent { expr, reading, meaning } object for rendering.
 *
 * `expression` takes precedence over `zh`; `reading` over `pinyin`;
 * `meaning` over `en`.
 *
 * @param {object} w
 * @returns {{ expr: string, reading: string, meaning: string }}
 */
export function normalizeWord(w) {
  return {
    expr: w.expression ?? w.zh ?? '',
    reading: w.reading ?? w.pinyin ?? '',
    meaning: w.meaning ?? w.en ?? '',
  };
}

// Pure growing-target policy for adaptive vocabulary progression.
//
// This module has NO I/O dependencies — no DB, no network.  It is the unit-
// testable policy engine.  The DB-calling wrapper lives in growingTarget.js,
// which imports and re-exports everything here.
//
// Policy (Ticket T-H, Workstream B point 3):
//
//   INITIAL_TARGET_SIZE = 2    — words shown on the very first turn.
//   GROW_PER_ATTEST     = 2    — additional catalog words unlocked per attested word.
//   ESSENTIAL_FRACTION  = 2/3  — fraction of the catalog that must be attested to
//                                complete the scenario (rounded up to nearest int).
//
// Window growth formula:
//   windowSize = min(INITIAL_TARGET_SIZE + attestedCount * GROW_PER_ATTEST, catalogLength)
//
// For a 6-word catalog (China scenarios, essentialCount=4):
//   0 attested → window=2, target=[w0,w1].
//   1 attested → window=4, target up to 3 un-attested words.
//   2 attested → window=6, all words visible.
//   4 essential attested → scenarioComplete=true.
//
// For a 3-word catalog (India scenarios, essentialCount=2):
//   0 attested → window=2, target=[w0,w1].
//   2 essential attested → scenarioComplete=true, target=[w2] (bonus word).
//
// Player pace signal: implicit in attestedCount — more attested = wider window.
// Future extension: adjust GROW_PER_ATTEST from a per-user pace metric.

/** Number of target words shown on the player's very first turn. */
export const INITIAL_TARGET_SIZE = 2;

/** Number of additional catalog words unlocked per word attested. */
export const GROW_PER_ATTEST = 2;

/**
 * Fraction of the catalog that must be attested to complete the scenario.
 * essentialCount = Math.ceil(catalogLength * ESSENTIAL_FRACTION).
 */
export const ESSENTIAL_FRACTION = 2 / 3;

/**
 * Pure policy function: given a fully-ordered catalog list and the set of
 * word IDs the player has attested so far, returns the current target word
 * set and the scenario-complete signal.
 *
 * No I/O side-effects.  Safe to call in unit tests with plain arrays.
 *
 * @param {Array<{ id: number, expression: string, reading?: string, meaning: string }>} allCatalogWords
 *   Full ordered catalog for the scenario, sorted ascending by display_order.
 * @param {Iterable<number>} attestedWordIds
 *   IDs of words the player has already attested in this scenario across all turns.
 * @returns {{
 *   targetWords: Array<{ id: number, expression: string, reading?: string, meaning: string }>,
 *   scenarioComplete: boolean,
 *   windowSize: number,
 *   essentialCount: number,
 * }}
 */
export function computeGrowingTarget(allCatalogWords, attestedWordIds) {
  // Empty catalog: no words means the scenario is undefined, not "complete".
  if (!allCatalogWords || allCatalogWords.length === 0) {
    return { targetWords: [], scenarioComplete: false, windowSize: 0, essentialCount: 0 };
  }

  const attestedSet = new Set(attestedWordIds);

  // Count how many of THIS catalog's words the player has attested.
  // Scoped to the catalog so progress in other scenarios does not affect this window.
  const catalogAttestedCount = allCatalogWords.filter((w) => attestedSet.has(w.id)).length;

  // Active window: starts small, expands by GROW_PER_ATTEST per word attested,
  // capped at the total catalog length.
  const windowSize = Math.min(
    INITIAL_TARGET_SIZE + catalogAttestedCount * GROW_PER_ATTEST,
    allCatalogWords.length,
  );

  // Essential word count: the number of catalog words (by display_order) a
  // tourist genuinely needs to handle this situation.  Derived from the catalog
  // size — no per-scenario overrides needed.
  const essentialCount = Math.ceil(allCatalogWords.length * ESSENTIAL_FRACTION);

  // scenarioComplete: all essential words (the first essentialCount by
  // display_order) have been attested.
  const scenarioComplete = allCatalogWords
    .slice(0, essentialCount)
    .every((w) => attestedSet.has(w.id));

  // Target words for the current turn: un-attested words within the active window.
  const targetWords = allCatalogWords
    .slice(0, windowSize)
    .filter((w) => !attestedSet.has(w.id));

  return { targetWords, scenarioComplete, windowSize, essentialCount };
}

// Pure gating logic for when to show the framing intro vs. an arrival beat.
// Kept separate from App.jsx so it's covered by Vitest without rendering.

// New accounts start with 100 tokens and zero unlocks/completions
// (CLAUDE.md economy invariant) — that's the server-derived "first launch"
// signal, no client flag required to detect it.
export function isFreshLangtourist({ unlockedCountries = [], completedScenarios = [] } = {}) {
  return unlockedCountries.length === 0 && completedScenarios.length === 0
}

// A country the player has completed at least one scenario in is no longer
// "unvisited" from the story's perspective, even after a reload — this is the
// server-derived half of the arrival-popup gate (paired with an in-session
// "already shown" set for countries still mid-story).
export function hasEngagedCountry(completedScenarios = [], scenarioIdsForCountry = []) {
  return scenarioIdsForCountry.some((id) => completedScenarios.includes(id))
}

export function shouldShowArrivalStory({ country, storySeen = [], completedScenarios = [], scenarioIdsForCountry = [] }) {
  if (!country) return false
  if (storySeen.includes(country)) return false
  return !hasEngagedCountry(completedScenarios, scenarioIdsForCountry)
}

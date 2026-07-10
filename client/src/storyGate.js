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
//
// Engine scenario ids are shared across every country's chain ('greetings'
// exists for cn, fr, in, ...), so engagement can only be checked against
// completion rows that carry their own country_code — never against a bare
// scenario-id list, which can't tell a cn completion from an fr one.
// `completions` is the { countryCode, scenarioId }[] shape from
// useProfile.js; countryCode is the ISO-2 code, same as elsewhere in the app.
export function hasEngagedCountry(completions = [], countryCode = null) {
  if (!countryCode) return false
  return completions.some((entry) => entry?.countryCode === countryCode)
}

export function shouldShowArrivalStory({ country, countryCode, storySeen = [], completions = [] }) {
  if (!country) return false
  if (storySeen.includes(country)) return false
  return !hasEngagedCountry(completions, countryCode)
}

// Pure data for the lore-codex panel (LoreCodex.jsx). Pairs each country's
// arrival story (shared/personaCanon.js, via storyData.js) with its catalog
// code/flag and a server-truth unlock flag. `unlockedCountries` must always
// be the server-provided list of unlocked country codes
// (profile.unlockedCountries) — never a client-stored flag — per
// docs/contracts/story-narration.md ("Codex-unlock state is derived from the
// player's server-side unlocked-countries truth").
import { COUNTRIES } from './gameData'
import { listCountryStories } from './storyData'

export function buildCodexEntries(unlockedCountries = []) {
  return listCountryStories().map((story) => {
    const catalogCountry = COUNTRIES.find((c) => c.name === story.country)
    const code = catalogCountry?.code ?? null
    return {
      ...story,
      code,
      flag: catalogCountry?.flag ?? '',
      unlocked: Boolean(code) && unlockedCountries.includes(code),
    }
  })
}

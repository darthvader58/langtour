// Story-mode copy for the client. Two surfaces live here: the one-time
// framing narrative (langtourist frame, unchanged by this ticket) and the
// per-country arrival + lore-codex narration, which both read the single
// cross-runtime canon in shared/personaCanon.js. This module renders canon
// strings — it never authors or edits lore (docs/contracts/story-narration.md,
// APPROVED 2026-07-08). The matching runtime-voice reader is
// node/lib/ai/personas.js; keep both readers, never a second copy of the text.
import { CHARACTERS } from './gameData'
import { PERSONA_CANON } from '../../shared/personaCanon.js'

// The overarching frame: a langtourist hopping between covers, Sackboy /
// LittleBigPlanet lightness — a toybox world, not a spy thriller. Shown once
// at first launch, before any country is picked. Untouched by the
// story-narration ticket (arrival + codex are the surfaces that grew).
export const FRAMING_NARRATIVE = {
  eyebrow: 'Before you go anywhere',
  title: 'Every trip needs a disguise',
  icon: '\u{1F9F3}', // luggage
  beats: [
    "You're a langtourist — a traveler who never visits anywhere as just a tourist.",
    'Every country you unlock hands you a new cover story and a new voice in your ear, walking you through it.',
    "The costume changes. The rule doesn't: you only pass as a local once you can actually talk like one.",
    "Pack light. Speak up. Let's go.",
  ],
}

// Resolves either a characterId (the shared persona key from
// sidekick-personas.md) or a catalog country name to the canon's
// characterId, so callers can pass whatever key they already have on hand.
export function resolveCharacterId(characterIdOrCountry) {
  if (!characterIdOrCountry) return null
  if (PERSONA_CANON[characterIdOrCountry]) return characterIdOrCountry
  return CHARACTERS[characterIdOrCountry]?.characterId ?? null
}

// Compact sidekick card, kept for countryTheme.js (portrait generation) and
// GameplayPhase's in-scenario sidekick nameplate — both only need identity
// fields, never the full lore.
export const SIDEKICKS = Object.fromEntries(
  Object.values(PERSONA_CANON).map((canon) => [
    canon.id,
    { id: canon.id, name: canon.name, role: canon.role, tagline: canon.voice.catchphrase },
  ])
)

export function getSidekick(characterIdOrCountry) {
  const characterId = resolveCharacterId(characterIdOrCountry)
  return characterId ? (SIDEKICKS[characterId] ?? null) : null
}

// The arrival story for a country/character: the ordered canon beats (one
// tap-to-continue page each), the cover lore, and the sidekick card — the
// only shape docs/contracts/story-narration.md has the popup and the lore
// codex both consume. No new content concepts, only paging.
export function getArrivalStory(characterIdOrCountry) {
  const characterId = resolveCharacterId(characterIdOrCountry)
  const canon = characterId ? PERSONA_CANON[characterId] : null
  if (!canon) return null
  return {
    characterId: canon.id,
    beats: canon.beats,
    cover: canon.cover,
    sidekick: { name: canon.name, role: canon.role, catchphrase: canon.voice.catchphrase },
  }
}

// Every character's arrival story, keyed by catalog country name — the
// lore-codex panel's data source. A country with no CHARACTERS entry is
// skipped rather than throwing, so a partial catalog never crashes the codex.
export function listCountryStories() {
  return Object.keys(CHARACTERS)
    .map((country) => {
      const story = getArrivalStory(country)
      return story ? { country, ...story } : null
    })
    .filter(Boolean)
}

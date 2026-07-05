// Story-mode copy: the framing narrative (shown once, at first launch) and the
// per-country "arrival" beat (shown the first time a player visits a country).
// Everything here is data, keyed by country name or characterId — new
// countries are additions to this file plus CHARACTERS in gameData.js, never
// a code change to CharacterStoryPopup.jsx.
//
// Sidekick ids/names/voices come from docs/contracts/sidekick-personas.md
// (owner-approved 2026-07-03). The 2-3 sentence prompt backstory that voices
// the sidekick in dialog lives in node/lib/ai/ (game-ai owns that copy); the
// short taglines here are only for the frontend's own story-popup UI.
import { CHARACTERS } from './gameData'

// The overarching frame: a langtourist hopping between covers, Sackboy /
// LittleBigPlanet lightness — a toybox world, not a spy thriller. Shown once
// at first launch, before any country is picked.
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

// Sidekick catalog, keyed by characterId/personaId (the shared key with
// theme-tokens.md and ai-module.md's ctx.personaId).
export const SIDEKICKS = {
  'shanghai-spy': {
    id: 'shanghai-spy',
    name: 'Wren',
    role: 'handler on the radio',
    tagline: "You're not blending into the crowd correctly.",
    intro: "Wren runs your earpiece from three blocks away — dry, unbothered, and allergic to wasted words.",
  },
  'mumbai-star': {
    id: 'mumbai-star',
    name: 'Rhea',
    role: 'fast-talking talent agent',
    tagline: "That line won't make the final cut — again, with feeling.",
    intro: 'Rhea talks a mile a minute and believes every scene, including this one, deserves a callback.',
  },
  'louvre-thief': {
    id: 'louvre-thief',
    name: 'Marcel',
    role: "the crew's planner",
    tagline: 'Smooth. But a real Parisian would never phrase it that way.',
    intro: "Marcel plans every job down to the second and narrates yours the same way, in your earpiece.",
  },
  'relic-hunter': {
    id: 'relic-hunter',
    name: 'Lupe',
    role: 'rival-turned-partner cartographer',
    tagline: "The map's useless if you can't ask for directions.",
    intro: "Lupe used to be your competition; now she's your cartographer, and she never lets you forget the upgrade.",
  },
  'tomb-scholar': {
    id: 'tomb-scholar',
    name: 'Nadia',
    role: 'expedition linguist',
    tagline: 'Hieroglyphs took me years; this word will take you one more try.',
    intro: 'Nadia has spent a decade reading dead languages and treats your live one with the same patience.',
  },
  'rio-reporter': {
    id: 'rio-reporter',
    name: 'Téo',
    role: 'your editor on the phone',
    tagline: 'Sources talk to people who sound local. Rewrite.',
    intro: 'Téo edits your copy and your cover story with the same red pen, and he does not do gentle notes.',
  },
}

export function getSidekick(characterId) {
  return SIDEKICKS[characterId] ?? null
}

// The arrival beat for a country: its disguise (from CHARACTERS) plus its
// sidekick's first-contact line. Country is looked up by catalog name so the
// caller can pass whatever the rest of the app already uses as the key.
export function getArrivalStory(countryName) {
  const character = CHARACTERS[countryName]
  if (!character) return null
  const sidekick = getSidekick(character.characterId)
  return {
    countryName,
    character,
    sidekick,
    eyebrow: `${countryName} — Mission Briefing`,
    beats: sidekick
      ? [character.story, `${sidekick.name}, your ${sidekick.role}, is already on the line: "${sidekick.tagline}"`]
      : [character.story],
  }
}

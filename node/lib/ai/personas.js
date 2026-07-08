// Sidekick personas, keyed by the shared personaId (== characterId in
// countryTheme.js — see docs/contracts/theme-tokens.md and
// docs/contracts/sidekick-personas.md, APPROVED 2026-07-03).
//
// The lore itself (cover + sidekick backstory, tap-to-continue beats, voice
// card) lives in a single canon shared with the client's story popup and
// lore codex: shared/personaCanon.js (docs/contracts/story-narration.md,
// APPROVED 2026-07-08). This file never re-authors that copy — it only
// adapts PERSONA_CANON into the compact voice card the prompt builders in
// ./prompts/ consume, so a country's popup lore and its in-scenario
// sidekick voice can never drift apart.
import { PERSONA_CANON } from '../../../shared/personaCanon.js';

// Human-readable country name for prompt scene-setting text only (e.g.
// "Scene: ... in France"). Cosmetic, not lore — the lore lives in the canon.
const COUNTRY_NAMES = {
  'shanghai-spy': 'China',
  'mumbai-star': 'India',
  'louvre-thief': 'France',
  'relic-hunter': 'Mexico',
  'tomb-scholar': 'Egypt',
  'rio-reporter': 'Brazil',
};

const DEFAULT_PERSONA_ID = 'shanghai-spy';

// Adapts one canon entry into the persona shape prompts/*.js already read:
// name, country, cover, a compact backstory line, and a voice card. Keeping
// this shape stable means the prompt builders needed no signature change.
function buildPersona(id) {
  const canon = PERSONA_CANON[id];
  return {
    id: canon.id,
    name: canon.name,
    country: COUNTRY_NAMES[id],
    cover: canon.cover,
    // Compact, token-lean fusion of the sidekick's own lore — origin gives
    // the model a character, bond gives it the relationship to voice hints
    // and corrections through.
    backstory: `${canon.sidekick.origin}. ${canon.sidekick.bond}.`,
    voice: {
      register: canon.voice.register,
      praiseStyle: canon.voice.praise,
      correctionStyle: canon.voice.correct,
      catchphrase: canon.voice.catchphrase,
    },
  };
}

export const PERSONAS = Object.fromEntries(
  Object.keys(PERSONA_CANON).map((id) => [id, buildPersona(id)]),
);

export function getPersona(personaId) {
  return PERSONAS[personaId] ?? PERSONAS[DEFAULT_PERSONA_ID];
}

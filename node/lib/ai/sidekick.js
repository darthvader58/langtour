// Per-country sidekick persona registry — data, not code.
//
// Owner has ratified the Sherlock/Watson framing: the player is the
// Sherlock-style disguise character (spy / art thief / archaeologist...)
// and the sidekick is their Watson-style in-character coach, voiced
// consistently with that country's archetype. PG, culturally respectful,
// never an ethnic caricature.
//
// This is a stub for T-C (extraction). T-D (game-ai) owns filling in the
// real per-country backstories/voice and threading sidekickLine through
// generateTurn/evaluateResponse. Keep the interface shape solid; the data
// here is intentionally minimal.

const SIDEKICKS = {
  cn: { name: 'Wen', role: 'field handler', voice: 'wry, encouraging' },
  in: { name: 'Asha', role: 'local contact', voice: 'warm, observant' },
  fr: { name: 'Margot', role: 'fixer', voice: 'dry wit, precise' },
  mx: { name: 'Tomas', role: 'guide', voice: 'upbeat, patient' },
  eg: { name: 'Layla', role: 'expedition partner', voice: 'curious, steady' },
  br: { name: 'Bia', role: 'street contact', voice: 'energetic, candid' },
};

const DEFAULT_SIDEKICK = { name: 'Watson', role: 'sidekick', voice: 'supportive, plainspoken' };

/**
 * Returns the sidekick persona for a country code.
 *
 * @param {string} countryCode - catalog country code (e.g. 'fr', 'cn').
 *   Matched case-insensitively; unknown codes fall back to a default
 *   persona rather than throwing, since this is a presentation detail,
 *   not a security boundary.
 * @returns {{ name: string, role: string, voice: string }}
 */
export function getSidekick(countryCode) {
  const key = String(countryCode || '').toLowerCase();
  return SIDEKICKS[key] || { ...DEFAULT_SIDEKICK };
}

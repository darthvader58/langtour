// Character-driven theme tokens. Shape is frozen in
// docs/contracts/theme-tokens.md (agreed with game-ai, who reads
// characterId/sidekick.id to pick the sidekick's voice). Everything a
// component needs comes out as a CSS var — never hardcode a color per
// component; extend THEMES + getCountryThemeStyle instead.
import { SIDEKICKS } from './storyData'

// Deterministic inline SVG "portrait": a monogram badge tinted with the
// country's own palette. No external assets/remote images, and new countries
// never need hand-drawn art — add a THEMES entry with a sidekick id and a
// portrait falls out automatically.
function buildPortraitDataUri({ initial, accent, soft }) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>`
    + `<defs><radialGradient id='g' cx='35%' cy='30%' r='75%'>`
    + `<stop offset='0%' stop-color='${soft}'/><stop offset='100%' stop-color='${accent}'/>`
    + `</radialGradient></defs>`
    + `<circle cx='48' cy='48' r='46' fill='url(#g)'/>`
    + `<circle cx='48' cy='48' r='46' fill='none' stroke='rgba(255,255,255,.35)' stroke-width='2'/>`
    + `<text x='48' y='63' font-family='ui-sans-serif,system-ui' font-size='42' font-weight='800' `
    + `text-anchor='middle' fill='rgba(7,16,29,.82)'>${initial}</text>`
    + `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function sidekickToken(characterId) {
  const sidekick = SIDEKICKS[characterId]
  if (!sidekick) return null
  return {
    id: sidekick.id,
    name: sidekick.name,
    portrait: buildPortraitDataUri({
      initial: sidekick.name[0]?.toUpperCase() ?? '?',
      accent: THEME_PALETTE[characterId]?.accent ?? '#4f86f7',
      soft: THEME_PALETTE[characterId]?.soft ?? '#8db4ff',
    }),
  }
}

// Palettes indexed by characterId so buildPortraitDataUri (called while THEMES
// is being built) doesn't have to reach into the THEMES table it's still
// constructing.
const THEME_PALETTE = {
  'shanghai-spy': { accent: '#e65349', soft: '#ff8f87', ink: '#fff7f6', glow: 'rgba(230,83,73,.3)' },
  'mumbai-star': { accent: '#f2a33a', soft: '#ffc46f', ink: '#241506', glow: 'rgba(242,163,58,.3)' },
  'louvre-thief': { accent: '#4f86f7', soft: '#8db4ff', ink: '#f7faff', glow: 'rgba(79,134,247,.3)' },
  'relic-hunter': { accent: '#35b978', soft: '#70dda7', ink: '#04170e', glow: 'rgba(53,185,120,.3)' },
  'tomb-scholar': { accent: '#d9a841', soft: '#f4cf78', ink: '#211604', glow: 'rgba(217,168,65,.3)' },
  'rio-reporter': { accent: '#49c96b', soft: '#88e69f', ink: '#04170a', glow: 'rgba(73,201,107,.3)' },
}

// Per-archetype surface tint + motif. Kept as concrete CSS values (not
// computed at theme-resolution time) so the token table stays the single
// source of truth per docs/contracts/theme-tokens.md.
const THEMES = {
  China: {
    characterId: 'shanghai-spy',
    palette: THEME_PALETTE['shanghai-spy'],
    surface: {
      bg: 'color-mix(in srgb, #e65349 4%, #07101d)',
      card: 'color-mix(in srgb, #e65349 7%, #0b1727)',
      border: 'color-mix(in srgb, #e65349 16%, #1a2b3d)',
    },
    motif: {
      texture: 'repeating-linear-gradient(45deg, rgba(230,83,73,.055) 0 2px, transparent 2px 14px)',
      icon: '\u{1F3EE}',
    },
    get sidekick() { return sidekickToken('shanghai-spy') },
  },
  India: {
    characterId: 'mumbai-star',
    palette: THEME_PALETTE['mumbai-star'],
    surface: {
      bg: 'color-mix(in srgb, #f2a33a 4%, #07101d)',
      card: 'color-mix(in srgb, #f2a33a 7%, #0b1727)',
      border: 'color-mix(in srgb, #f2a33a 16%, #1a2b3d)',
    },
    motif: {
      texture: 'radial-gradient(circle at 50% 0%, rgba(242,163,58,.16), transparent 60%)',
      icon: '\u{1F3AC}',
    },
    get sidekick() { return sidekickToken('mumbai-star') },
  },
  France: {
    characterId: 'louvre-thief',
    palette: THEME_PALETTE['louvre-thief'],
    surface: {
      bg: 'color-mix(in srgb, #4f86f7 4%, #07101d)',
      card: 'color-mix(in srgb, #4f86f7 7%, #0b1727)',
      border: 'color-mix(in srgb, #4f86f7 16%, #1a2b3d)',
    },
    motif: {
      texture: 'repeating-linear-gradient(135deg, rgba(79,134,247,.05) 0 2px, transparent 2px 16px)',
      icon: '\u{1F5BC}\u{FE0F}',
    },
    get sidekick() { return sidekickToken('louvre-thief') },
  },
  Mexico: {
    characterId: 'relic-hunter',
    palette: THEME_PALETTE['relic-hunter'],
    surface: {
      bg: 'color-mix(in srgb, #35b978 4%, #07101d)',
      card: 'color-mix(in srgb, #35b978 7%, #0b1727)',
      border: 'color-mix(in srgb, #35b978 16%, #1a2b3d)',
    },
    motif: {
      texture: 'radial-gradient(circle at 20% 20%, rgba(53,185,120,.16), transparent 55%), radial-gradient(circle at 80% 80%, rgba(53,185,120,.1), transparent 50%)',
      icon: '\u{1F5FA}\u{FE0F}',
    },
    get sidekick() { return sidekickToken('relic-hunter') },
  },
  Egypt: {
    characterId: 'tomb-scholar',
    palette: THEME_PALETTE['tomb-scholar'],
    surface: {
      bg: 'color-mix(in srgb, #d9a841 4%, #07101d)',
      card: 'color-mix(in srgb, #d9a841 7%, #0b1727)',
      border: 'color-mix(in srgb, #d9a841 16%, #1a2b3d)',
    },
    motif: {
      texture: 'repeating-linear-gradient(90deg, rgba(217,168,65,.065) 0 3px, transparent 3px 22px)',
      icon: '\u{1F3FA}',
    },
    get sidekick() { return sidekickToken('tomb-scholar') },
  },
  Brazil: {
    characterId: 'rio-reporter',
    palette: THEME_PALETTE['rio-reporter'],
    surface: {
      bg: 'color-mix(in srgb, #49c96b 4%, #07101d)',
      card: 'color-mix(in srgb, #49c96b 7%, #0b1727)',
      border: 'color-mix(in srgb, #49c96b 16%, #1a2b3d)',
    },
    motif: {
      texture: 'repeating-linear-gradient(0deg, rgba(73,201,107,.05) 0 2px, transparent 2px 18px)',
      icon: '\u{1F4F0}',
    },
    get sidekick() { return sidekickToken('rio-reporter') },
  },
}

export function getCountryTheme(country) {
  return THEMES[country] ?? THEMES.China
}

export function getCountryThemeStyle(country) {
  const theme = getCountryTheme(country)
  const { accent, soft, ink, glow } = theme.palette
  const portraitUrl = theme.sidekick?.portrait
  return {
    '--accent': accent,
    '--accent-soft': soft,
    '--accent-ink': ink,
    '--accent-glow': glow,
    '--accent-10': `color-mix(in srgb, ${accent} 10%, transparent)`,
    '--accent-15': `color-mix(in srgb, ${accent} 15%, transparent)`,
    '--accent-20': `color-mix(in srgb, ${accent} 20%, transparent)`,
    '--accent-25': `color-mix(in srgb, ${accent} 25%, transparent)`,
    '--accent-30': `color-mix(in srgb, ${accent} 30%, transparent)`,
    '--accent-40': `color-mix(in srgb, ${accent} 40%, transparent)`,
    '--accent-55': `color-mix(in srgb, ${accent} 55%, transparent)`,
    '--surface-bg': theme.surface.bg,
    '--surface-card': theme.surface.card,
    '--surface-border': theme.surface.border,
    '--motif-texture': theme.motif.texture,
    '--sidekick-portrait': portraitUrl ? `url("${portraitUrl}")` : 'none',
  }
}

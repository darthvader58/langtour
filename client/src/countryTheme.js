const THEMES = {
  China:  { accent: '#e65349', soft: '#ff8f87', ink: '#fff7f6', glow: 'rgba(230,83,73,.3)' },
  India:  { accent: '#f2a33a', soft: '#ffc46f', ink: '#241506', glow: 'rgba(242,163,58,.3)' },
  France: { accent: '#4f86f7', soft: '#8db4ff', ink: '#f7faff', glow: 'rgba(79,134,247,.3)' },
  Mexico: { accent: '#35b978', soft: '#70dda7', ink: '#04170e', glow: 'rgba(53,185,120,.3)' },
  Egypt:  { accent: '#d9a841', soft: '#f4cf78', ink: '#211604', glow: 'rgba(217,168,65,.3)' },
  Brazil: { accent: '#49c96b', soft: '#88e69f', ink: '#04170a', glow: 'rgba(73,201,107,.3)' },
}

// Word-mastery state colors — these are the single source of truth for mastery
// coloring across the whole app. Three.js uses the constants directly (CSS vars
// can't be passed to material constructors); CSS contexts receive them via
// getCountryThemeStyle / --mastery-* vars.
//
// Two sets: "canvas" colors for the light-background Three.js graph, and "ui"
// colors for dark-background legend text.  Both originate here.
export const MASTERY_COLORS = Object.freeze({
  // Canvas (light background — the Three.js graph canvas is white/light)
  mastered:  '#078765',  // deep teal
  learning:  '#2478b8',  // blue
  due:       '#d98418',  // amber
  unseen:    '#d43e5d',  // red/pink (never reviewed or stability 0)
  // Forest hierarchy structural nodes
  root:      '#4a5568',  // neutral slate
  superset:  '#6d28d9',  // indigo — topic cluster
  situation: '#0369a1',  // sky — scenario context
  // UI / dark-background equivalents (legend text, status dots)
  uiMastered:  '#63e6be',
  uiLearning:  '#79c7ff',
  uiDue:       '#ff8da1',
  uiSuperset:  '#c4b5fd',
  uiSituation: '#7dd3fc',
})

export function getCountryTheme(country) {
  return THEMES[country] ?? THEMES.China
}

export function getCountryThemeStyle(country) {
  const theme = getCountryTheme(country)
  return {
    // Mastery state tokens — exposed as CSS vars so CSS consumers don't need
    // to import the JS constant.
    '--mastery-mastered':    MASTERY_COLORS.mastered,
    '--mastery-learning':    MASTERY_COLORS.learning,
    '--mastery-due':         MASTERY_COLORS.due,
    '--mastery-unseen':      MASTERY_COLORS.unseen,
    '--mastery-root':        MASTERY_COLORS.root,
    '--mastery-superset':    MASTERY_COLORS.superset,
    '--mastery-situation':   MASTERY_COLORS.situation,
    '--mastery-ui-mastered':   MASTERY_COLORS.uiMastered,
    '--mastery-ui-learning':   MASTERY_COLORS.uiLearning,
    '--mastery-ui-due':        MASTERY_COLORS.uiDue,
    '--mastery-ui-superset':   MASTERY_COLORS.uiSuperset,
    '--mastery-ui-situation':  MASTERY_COLORS.uiSituation,
    // Alpha variants of the "currently learning" color — used by the growing-
    // target word chips to highlight words that just entered the window.
    '--mastery-ui-learning-12': `color-mix(in srgb, ${MASTERY_COLORS.uiLearning} 12%, transparent)`,
    '--mastery-ui-learning-50': `color-mix(in srgb, ${MASTERY_COLORS.uiLearning} 50%, transparent)`,
    // Country accent tokens
    '--accent': theme.accent,
    '--accent-soft': theme.soft,
    '--accent-ink': theme.ink,
    '--accent-glow': theme.glow,
    '--accent-10': `color-mix(in srgb, ${theme.accent} 10%, transparent)`,
    '--accent-15': `color-mix(in srgb, ${theme.accent} 15%, transparent)`,
    '--accent-20': `color-mix(in srgb, ${theme.accent} 20%, transparent)`,
    '--accent-25': `color-mix(in srgb, ${theme.accent} 25%, transparent)`,
    '--accent-30': `color-mix(in srgb, ${theme.accent} 30%, transparent)`,
    '--accent-40': `color-mix(in srgb, ${theme.accent} 40%, transparent)`,
    '--accent-55': `color-mix(in srgb, ${theme.accent} 55%, transparent)`,
  }
}

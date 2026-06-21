const THEMES = {
  China:  { accent: '#e65349', soft: '#ff8f87', ink: '#fff7f6', glow: 'rgba(230,83,73,.3)' },
  India:  { accent: '#f2a33a', soft: '#ffc46f', ink: '#241506', glow: 'rgba(242,163,58,.3)' },
  France: { accent: '#4f86f7', soft: '#8db4ff', ink: '#f7faff', glow: 'rgba(79,134,247,.3)' },
  Mexico: { accent: '#35b978', soft: '#70dda7', ink: '#04170e', glow: 'rgba(53,185,120,.3)' },
  Egypt:  { accent: '#d9a841', soft: '#f4cf78', ink: '#211604', glow: 'rgba(217,168,65,.3)' },
  Brazil: { accent: '#49c96b', soft: '#88e69f', ink: '#04170a', glow: 'rgba(73,201,107,.3)' },
}

export function getCountryTheme(country) {
  return THEMES[country] ?? THEMES.China
}

export function getCountryThemeStyle(country) {
  const theme = getCountryTheme(country)
  return {
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

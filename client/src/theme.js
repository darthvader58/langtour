export const theme = {
  bg: '#15151c',
  panel: '#1b1b25',
  paper: '#21212d',
  matchaSoft: '#23233a',
  matchaMid: '#7d8cf0',
  matchaDeep: '#5d6ce0',
  matchaInk: '#b3bcf7',
  accent: '#7d8cf0',
  gold: '#e8b04b',
  goldSoft: '#33291a',
  goldInk: '#f3cf8a',
  oolong: '#e8b04b',
  oolongInk: '#f3cf8a',
  rose: '#e57385',
  roseInk: '#f4b6c0',
  slate: '#6fa8cf',
  slateInk: '#c2dcee',
  plum: '#b78fd0',
  plumInk: '#e3d0ef',
  clay: '#d68a6e',
  clayInk: '#f0cdbd',
  ink: '#e7e6ee',
  inkSoft: '#928fa3',
  inkFaint: '#646175',
  border: '#312f3e',
  borderSoft: '#262534',
  elevated: '#2a2939',
  good: '#4fbf86',
  goodInk: '#86e0b0',
  goodSoft: '#16302a',
  warn: '#e8b04b',
  bad: '#e57373',
  badInk: '#f3a9a9',
  badSoft: '#341d1d',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48, '4xl': 64 };

export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999, full: 9999, circle: '50%' };

export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.3)',
  md: '0 2px 8px rgba(0,0,0,0.35)',
  lg: '0 8px 24px rgba(0,0,0,0.45)',
  xl: '0 16px 48px rgba(0,0,0,0.55)',
  focus: `0 0 0 3px rgba(125,140,240,0.25)`,
  glow: `0 0 0 1px ${theme.accent}, 0 6px 28px rgba(125,140,240,0.22)`,
};

export const font = {
  ui: "'Inter', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
  serif: "'Inter', system-ui, sans-serif",
  brand: "'Cormorant Garamond', 'Noto Serif SC', serif",
  hanzi: "'Noto Serif SC', serif",
  mono: "'SF Mono', 'JetBrains Mono', Monaco, monospace",
  sans: 'sans-serif',
};

export const fontSize = { xs: 11, sm: 12, md: 13, base: 14, lg: 16, xl: 20, '2xl': 28, '3xl': 40, display: 64, xxl: 24 };

export const motion = { fast: '100ms ease', normal: '200ms ease', base: '180ms cubic-bezier(0.4, 0, 0.2, 1)', slow: '320ms cubic-bezier(0.4, 0, 0.2, 1)', spring: '420ms cubic-bezier(0.34, 1.56, 0.64, 1)' };

export const num = {
  fontFeatureSettings: '"tnum" 1, "cv01" 1',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
};

export const labelStyle = {
  fontSize: fontSize.xs,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: theme.inkSoft,
};

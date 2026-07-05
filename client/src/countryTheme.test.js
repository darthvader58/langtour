import { describe, expect, it } from 'vitest'
import { getCountryTheme, getCountryThemeStyle } from './countryTheme'

const EXISTING_VAR_KEYS = [
  '--accent', '--accent-soft', '--accent-ink', '--accent-glow',
  '--accent-10', '--accent-15', '--accent-20', '--accent-25', '--accent-30', '--accent-40', '--accent-55',
]

describe('countryTheme', () => {
  it('resolves the full token shape for a known country', () => {
    const theme = getCountryTheme('China')
    expect(theme.characterId).toBe('shanghai-spy')
    expect(theme.palette).toMatchObject({ accent: '#e65349' })
    expect(theme.surface).toHaveProperty('bg')
    expect(theme.surface).toHaveProperty('card')
    expect(theme.surface).toHaveProperty('border')
    expect(theme.motif).toHaveProperty('texture')
    expect(theme.motif).toHaveProperty('icon')
    expect(theme.sidekick).toMatchObject({ id: 'shanghai-spy', name: 'Wren' })
    expect(theme.sidekick.portrait).toMatch(/^data:image\/svg\+xml/)
  })

  it('falls back to China for an unknown country', () => {
    expect(getCountryTheme('Narnia')).toBe(getCountryTheme('China'))
  })

  it('emits every existing accent var byte-identically keyed, plus the new surface/motif/sidekick vars', () => {
    const style = getCountryThemeStyle('Egypt')
    for (const key of EXISTING_VAR_KEYS) expect(style).toHaveProperty(key)
    expect(style['--accent']).toBe('#d9a841')
    expect(style['--surface-bg']).toContain('#d9a841')
    expect(style['--motif-texture']).toBeTruthy()
    expect(style['--sidekick-portrait']).toMatch(/^url\("data:image\/svg\+xml/)
  })

  it('gives each of the six countries a distinct characterId and sidekick', () => {
    const countries = ['China', 'India', 'France', 'Mexico', 'Egypt', 'Brazil']
    const ids = countries.map((c) => getCountryTheme(c).characterId)
    expect(new Set(ids).size).toBe(countries.length)
    const sidekickNames = countries.map((c) => getCountryTheme(c).sidekick.name)
    expect(new Set(sidekickNames).size).toBe(countries.length)
  })
})

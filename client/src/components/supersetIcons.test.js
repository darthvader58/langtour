import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO_ICON, iconForSuperset, SUPERSET_ICONS } from './supersetIcons'

describe('iconForSuperset', () => {
  it('returns the mapped icon for every known superset', () => {
    for (const [superset, icon] of Object.entries(SUPERSET_ICONS)) {
      expect(iconForSuperset(superset)).toBe(icon)
    }
  })

  it('falls back to the default map icon for an unknown superset', () => {
    expect(iconForSuperset('underwater basket weaving')).toBe(DEFAULT_SCENARIO_ICON)
  })

  it('falls back to the default map icon when superset is missing', () => {
    expect(iconForSuperset(undefined)).toBe(DEFAULT_SCENARIO_ICON)
    expect(iconForSuperset(null)).toBe(DEFAULT_SCENARIO_ICON)
  })
})

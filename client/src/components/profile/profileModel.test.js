import { describe, expect, it } from 'vitest'
import { displayIdentity, normalizeCountryCode, normalizeGraph, normalizeProgress } from './profileModel'

describe('profile model', () => {
  it('maps canonical country names to navigator ISO codes', () => {
    expect(normalizeCountryCode('china')).toBe('cn')
    expect(normalizeCountryCode('FR')).toBe('fr')
  })

  it('preserves timestamped game history and local catalog labels', () => {
    const progress = normalizeProgress({
      summary: { encountered: 12, totalReviews: 30, recentAccuracy: 0.8 },
      gameHistory: {
        countryUnlocks: [{ countryCode: 'china', unlockedAt: '2026-01-01T00:00:00Z' }],
        scenarioCompletions: [{ countryCode: 'china', scenarioId: 'street-market', completedAt: '2026-02-01T00:00:00Z' }],
      },
    })
    const china = progress.countries.find((country) => country.code === 'cn')
    expect(china.unlocked).toBe(true)
    expect(china.unlockedAt).toBe('2026-01-01T00:00:00Z')
    expect(china.scenarios.find((scenario) => scenario.id === 'street-market')).toMatchObject({ completed: true, completedAt: '2026-02-01T00:00:00Z' })
    expect(progress.metrics).toMatchObject({ encountered: 12, reviews: 30, accuracy: 0.8 })
  })

  it('normalizes graph meanings and positions without admitting invalid edges', () => {
    const graph = normalizeGraph({
      nodes: [{ id: 7, expression: '你好', meaning: 'hello', x: 1, y: 2, z: 3 }],
      edges: [{ source: 7, target: 8, similarity: 0.9 }],
    })
    expect(graph.nodes[0]).toMatchObject({ id: '7', translation: 'hello', x: 1, y: 2, z: 3 })
    expect(graph.edges).toEqual([])
  })

  it('creates safe identity fallback initials', () => {
    expect(displayIdentity({ email: 'agent@example.com' })).toMatchObject({ name: 'agent', initials: 'A' })
  })
})

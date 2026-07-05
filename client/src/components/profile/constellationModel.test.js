import { describe, expect, it } from 'vitest'
import { buildForestLayout, isStale, masteryTierColor } from './constellationModel'

describe('masteryTierColor', () => {
  it('maps tiers 0-3 to distinct colors', () => {
    const colors = [0, 1, 2, 3].map(masteryTierColor)
    expect(new Set(colors).size).toBe(4)
  })

  it('clamps out-of-range tiers into 0-3', () => {
    expect(masteryTierColor(-5)).toBe(masteryTierColor(0))
    expect(masteryTierColor(99)).toBe(masteryTierColor(3))
  })
})

describe('isStale', () => {
  const now = new Date('2026-07-04T00:00:00Z').getTime()

  it('is false with no lastUsedAt', () => {
    expect(isStale(null, { now })).toBe(false)
    expect(isStale(undefined, { now })).toBe(false)
  })

  it('is false within the threshold window', () => {
    expect(isStale('2026-07-01T00:00:00Z', { now, thresholdDays: 14 })).toBe(false)
  })

  it('is true past the threshold window', () => {
    expect(isStale('2026-06-01T00:00:00Z', { now, thresholdDays: 14 })).toBe(true)
  })
})

describe('buildForestLayout', () => {
  const nodes = [
    { id: '1', x: 0, y: 0, z: 0 },
    { id: '2', x: 2, y: 0, z: 0 },
    { id: '3', x: 10, y: 10, z: 10 },
  ]
  const trees = [
    { superset: 'food & stuff', wordIds: ['1', '2'] },
    { superset: 'getting around', wordIds: ['3'] },
  ]

  it('centroids each tree from its member word positions', () => {
    const { treeNodes } = buildForestLayout(nodes, trees)
    const food = treeNodes.find((t) => t.superset === 'food & stuff')
    expect(food).toMatchObject({ x: 1, y: 0, z: 0 })
  })

  it('wires root -> tree and tree -> word edges', () => {
    const { root, treeEdges, wordEdges } = buildForestLayout(nodes, trees)
    expect(treeEdges).toContainEqual({ source: root.id, target: 'tree:food & stuff' })
    expect(wordEdges).toContainEqual({ source: 'tree:food & stuff', target: '1' })
    expect(wordEdges).toContainEqual({ source: 'tree:food & stuff', target: '2' })
  })

  it('drops trees whose word ids are not present in nodes', () => {
    const { treeNodes } = buildForestLayout(nodes, [{ superset: 'ghost', wordIds: ['999'] }])
    expect(treeNodes).toEqual([])
  })
})

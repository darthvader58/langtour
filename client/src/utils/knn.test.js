import { describe, it, expect } from 'vitest'
import {
  buildKnnGraph, knnMeanMetric, moransI, neighborhoodPurity, lofScores,
} from './knn.js'

describe('buildKnnGraph', () => {
  it('finds the correct nearest neighbor in 1D', () => {
    const pts = [[0], [1], [5], [6]]
    const { neighbors, distances } = buildKnnGraph(pts, 1)
    expect(neighbors[0][0]).toBe(1)
    expect(neighbors[1][0]).toBe(0)
    expect(neighbors[2][0]).toBe(3)
    expect(neighbors[3][0]).toBe(2)
    expect(distances[0][0]).toBeCloseTo(1, 6)
  })
  it('returns k neighbors sorted by ascending distance', () => {
    const pts = [[0, 0], [1, 0], [0, 2], [3, 3]]
    const { neighbors, distances } = buildKnnGraph(pts, 3)
    expect(neighbors[0].length).toBe(3)
    expect(distances[0][0]).toBeLessThanOrEqual(distances[0][1])
    expect(distances[0][1]).toBeLessThanOrEqual(distances[0][2])
    expect(neighbors[0][0]).toBe(1)
  })
  it('skips empty points', () => {
    const pts = [[0, 0], [], [1, 1]]
    const { neighbors } = buildKnnGraph(pts, 1)
    expect(neighbors[1]).toEqual([])
    // Empty node shouldn't appear as someone else's neighbor either.
    expect(neighbors[0]).not.toContain(1)
  })
  it('handles k larger than n-1 by returning everyone else', () => {
    const pts = [[0], [1], [2]]
    const { neighbors } = buildKnnGraph(pts, 10)
    expect(neighbors[0].length).toBe(2)
  })
})

describe('knnMeanMetric', () => {
  it('averages values over neighbors, skipping NaN', () => {
    const neighbors = [[1, 2], [0, 2], [0, 1]]
    const values = [10, 20, NaN]
    const out = knnMeanMetric(neighbors, values)
    expect(out[0]).toBeCloseTo(20, 6) // neighbor 1 only (2 is NaN)
    expect(out[1]).toBeCloseTo(10, 6)
    expect(out[2]).toBeCloseTo(15, 6)
  })
})

describe("Moran's I", () => {
  it('is near +1 when neighbors share like values (1D gradient)', () => {
    const pts = Array.from({ length: 20 }, (_, i) => [i])
    const { neighbors } = buildKnnGraph(pts, 3)
    const values = pts.map(p => p[0])
    const I = moransI(neighbors, values)
    expect(I).toBeGreaterThan(0.7)
  })
  it('is near 0 for random values with no spatial structure', () => {
    const pts = Array.from({ length: 30 }, (_, i) => [i])
    const { neighbors } = buildKnnGraph(pts, 3)
    // Deterministic pseudo-random permutation so tests are stable.
    const values = [17, 3, 28, 11, 7, 22, 14, 2, 25, 9, 19, 5, 29, 12, 16, 1, 24, 8, 21, 6, 27, 10, 15, 4, 23, 18, 13, 26, 0, 20]
    const I = moransI(neighbors, values)
    // Not strictly 0 for a finite fixed permutation; just well below the strongly-clustered case.
    expect(Math.abs(I)).toBeLessThan(0.5)
  })
  it('returns 0 on constant input (no variance)', () => {
    const neighbors = [[1, 2], [0, 2], [0, 1]]
    expect(moransI(neighbors, [5, 5, 5])).toBe(0)
  })
})

describe('neighborhoodPurity', () => {
  it('returns 1 when all neighbors share the same bucket', () => {
    const neighbors = [[1, 2], [0, 2], [0, 1]]
    const buckets = [0, 0, 0]
    const out = neighborhoodPurity(neighbors, buckets)
    expect(out).toEqual([1, 1, 1])
  })
  it('returns 0 when no neighbor shares bucket', () => {
    const neighbors = [[1, 2]]
    const buckets = [0, 1, 2]
    const out = neighborhoodPurity(neighbors, buckets)
    expect(out[0]).toBe(0)
  })
  it('handles mixed correctly', () => {
    const neighbors = [[1, 2, 3, 4]]
    const buckets = [1, 1, 1, 0, 0]
    const out = neighborhoodPurity(neighbors, buckets)
    expect(out[0]).toBeCloseTo(0.5, 6)
  })
})

describe('lofScores', () => {
  it('assigns a high score to a planted outlier', () => {
    // 20 points tightly packed around 0, plus one far away.
    const pts = []
    for (let i = 0; i < 20; i++) pts.push([Math.cos(i) * 0.01, Math.sin(i) * 0.01])
    pts.push([10, 10])
    const { neighbors, distances } = buildKnnGraph(pts, 5)
    const lof = lofScores(neighbors, distances)
    const outlierLof = lof[20]
    const medianLof = [...lof.slice(0, 20)].sort((a, b) => a - b)[10]
    expect(outlierLof).toBeGreaterThan(medianLof * 3)
  })
  it('is around 1 for uniformly distributed points', () => {
    const pts = Array.from({ length: 15 }, (_, i) => [i])
    const { neighbors, distances } = buildKnnGraph(pts, 3)
    const lof = lofScores(neighbors, distances)
    // Interior points should be near 1.
    for (let i = 5; i < 10; i++) {
      expect(lof[i]).toBeGreaterThan(0.5)
      expect(lof[i]).toBeLessThan(2)
    }
  })
})

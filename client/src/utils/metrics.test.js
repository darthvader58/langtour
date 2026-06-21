import { describe, it, expect } from 'vitest'
import {
  DAY_MS,
  retrievability,
  reviewPriority,
  centroid,
  cosine,
  euclid,
  robustRange,
} from './metrics.js'

describe('retrievability', () => {
  it('returns 1 when no time has elapsed', () => {
    const now = Date.now()
    const r = retrievability({ stability: 5, last_review_at: now, now })
    expect(r).toBe(1)
  })

  it('returns exactly 0.9 at t = stability (FSRS definition)', () => {
    const now = Date.now()
    const stability = 10
    const lastMs = now - stability * DAY_MS
    const r = retrievability({ stability, last_review_at: lastMs, now })
    expect(r).toBeCloseTo(0.9, 5)
  })

  it('decays exponentially past the stability horizon', () => {
    const now = Date.now()
    const stability = 5
    const lastMs = now - 20 * DAY_MS // 4× stability out
    const r = retrievability({ stability, last_review_at: lastMs, now })
    // R(4·s) = 0.9^4 ≈ 0.6561
    expect(r).toBeCloseTo(0.6561, 4)
  })

  it('returns 0 when stability is missing', () => {
    expect(retrievability({ stability: 0, last_review_at: Date.now() })).toBe(0)
    expect(retrievability({ stability: null, last_review_at: Date.now() })).toBe(0)
  })

  it('returns 0 when last_review_at is missing', () => {
    expect(retrievability({ stability: 5, last_review_at: null })).toBe(0)
  })

  it('accepts ISO-string timestamps', () => {
    const now = Date.now()
    const iso = new Date(now - 5 * DAY_MS).toISOString()
    const r = retrievability({ stability: 5, last_review_at: iso, now })
    expect(r).toBeCloseTo(0.9, 5)
  })
})

describe('reviewPriority', () => {
  it('is zero for a card with perfect retrievability', () => {
    expect(reviewPriority({ retrievability: 1, difficulty: 5, lapses: 3 })).toBe(0)
  })

  it('scales with difficulty', () => {
    const a = reviewPriority({ retrievability: 0.5, difficulty: 2, lapses: 0 })
    const b = reviewPriority({ retrievability: 0.5, difficulty: 4, lapses: 0 })
    expect(b).toBeCloseTo(a * 2, 5)
  })

  it('gives leeches a boost via (1 + lapses)', () => {
    const clean = reviewPriority({ retrievability: 0.5, difficulty: 5, lapses: 0 })
    const leech = reviewPriority({ retrievability: 0.5, difficulty: 5, lapses: 4 })
    expect(leech).toBe(clean * 5)
  })
})

describe('centroid', () => {
  it('returns the mean of each dimension', () => {
    const c = centroid([[0, 0], [2, 2], [4, 4]])
    expect(c).toEqual([2, 2])
  })

  it('returns empty array for no input', () => {
    expect(centroid([])).toEqual([])
  })
})

describe('cosine', () => {
  it('is the dot product of two vectors', () => {
    expect(cosine([1, 0, 0], [0, 1, 0])).toBe(0)
    expect(cosine([1, 0, 0], [1, 0, 0])).toBe(1)
    expect(cosine([1, 1, 0], [1, 1, 0])).toBe(2)
  })
})

describe('euclid', () => {
  it('computes euclidean distance', () => {
    expect(euclid([0, 0], [3, 4])).toBeCloseTo(5, 6)
  })
  it('returns 0 for identical points', () => {
    expect(euclid([1, 2, 3], [1, 2, 3])).toBe(0)
  })
})

describe('robustRange', () => {
  it('returns 5th/95th percentiles by default', () => {
    const values = Array.from({ length: 101 }, (_, i) => i)
    const { lo, hi } = robustRange(values)
    expect(lo).toBe(5)
    expect(hi).toBe(95)
  })

  it('handles all-finite input with no weirdness', () => {
    const { lo, hi } = robustRange([1, 2, 3, 4, 5])
    expect(lo).toBe(1)
    expect(hi).toBe(5)
  })

  it('ignores non-finite values', () => {
    const { lo, hi } = robustRange([1, 2, Infinity, NaN, 10])
    expect(lo).toBe(1)
    expect(hi).toBe(10)
  })
})

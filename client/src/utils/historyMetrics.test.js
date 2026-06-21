// Unit tests for buildHistoryMetrics — the function that transforms
// /api/graph/history API responses into node-indexed Float32Arrays for the
// timeline visibility mask and historical metric coloring.
//
// Tests:
//  1. Words created before the target date are visible (existed=1)
//  2. Words created after the target date are hidden (existed=0)
//  3. Words with missing created_at fall back to last_review_at for existence
//  4. Words that existed but weren't reviewed have NaN metrics
//  5. Words that existed and were reviewed have correct finite metrics
//  6. Words not in the graph payload (no idToIdx entry) are skipped
//  7. Empty snapshot produces all existed=0 and all metrics NaN
//  8. Multiple words, mixed creation dates, mixed review status
//  9. Edge case: same-day creation as target date (should be visible)
// 10. Edge case: created_at exactly one day after target (should be hidden)

import { describe, it, expect } from 'vitest'
import { buildHistoryMetrics } from './historyMetrics.js'

function makePk(N, idToIdx) {
  return { N, idToIdx }
}

function idMap(entries) {
  const m = new Map()
  entries.forEach(([id, idx]) => m.set(id, idx))
  return m
}

function snap(date, nodes) {
  return { date, nodes }
}

function node(id, opts = {}) {
  return {
    id,
    created_at: 'created_at' in opts ? opts.created_at : null,
    last_review_at: 'last_review_at' in opts ? opts.last_review_at : null,
    retrievability: 'retrievability' in opts ? opts.retrievability : 0,
    stability: 'stability' in opts ? opts.stability : 0,
    difficulty: 'difficulty' in opts ? opts.difficulty : 0,
  }
}

describe('buildHistoryMetrics', () => {
  it('returns correct shape with N arrays and n sentinel', () => {
    const pk = makePk(3, idMap([[1, 0], [2, 1], [3, 2]]))
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.85, stability: 7, difficulty: 0.3 }),
      node(2, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.90, stability: 10, difficulty: 0.5 }),
      node(3, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.75, stability: 5, difficulty: 0.2 }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.n).toBe(3)
    expect(m.retrievability).toBeInstanceOf(Float32Array)
    expect(m.stability).toBeInstanceOf(Float32Array)
    expect(m.difficulty).toBeInstanceOf(Float32Array)
    expect(m.existed).toBeInstanceOf(Uint8Array)
    expect(m.retrievability.length).toBe(3)
    expect(m.existed.length).toBe(3)
  })

  it('words created before the target date are visible', () => {
    const pk = makePk(2, idMap([[1, 0], [2, 1]]))
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.85, stability: 7 }),
      node(2, { created_at: '2025-05-01', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.90, stability: 10 }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(1)
    expect(m.existed[1]).toBe(1)
  })

  it('words created after the target date are hidden', () => {
    const pk = makePk(2, idMap([[1, 0], [2, 1]]))
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-06-20', last_review_at: '2025-06-22T10:00:00Z', retrievability: 0.85 }),
      node(2, { created_at: '2025-06-16', last_review_at: '2025-06-22T10:00:00Z', retrievability: 0.90 }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(0)
    expect(m.existed[1]).toBe(0)
  })

  it('word created ON the target date is visible', () => {
    const pk = makePk(1, idMap([[1, 0]]))
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-06-15 14:30:00', last_review_at: null }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(1)
  })

  it('word created one day after target date is hidden', () => {
    const pk = makePk(1, idMap([[1, 0]]))
    // Word was created June 16; timeline is at June 15.
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-06-16 08:00:00', last_review_at: null }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(0)
  })

  it('falls back to last_review_at when created_at is missing', () => {
    const pk = makePk(3, idMap([[1, 0], [2, 1], [3, 2]]))
    const s = snap('2025-06-15', [
      // created_at is null/undefined — should fall back to last_review_at
      node(1, { created_at: null, last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.85 }),
      // created_at is empty string
      node(2, { created_at: '', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.90 }),
      // both created_at AND last_review_at missing — should stay hidden
      node(3, { created_at: null, last_review_at: null }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(1) // fallback: has review history
    expect(m.existed[1]).toBe(1) // fallback: has review history
    expect(m.existed[2]).toBe(0) // no review history, no created_at → hidden
  })

  it('words that existed but were not reviewed get backend values (0) not NaN', () => {
    const pk = makePk(2, idMap([[1, 0], [2, 1]]))
    const s = snap('2025-06-15', [
      // Existed but not reviewed by target date — backend returns 0 for all metrics
      node(1, { created_at: '2025-06-10', last_review_at: null }),
      // Existed AND reviewed
      node(2, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.90, stability: 10, difficulty: 0.5 }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(1)
    expect(m.existed[1]).toBe(1)
    // Word 1: existed but unreviewed → gets 0 from backend (not blue NaN)
    expect(m.retrievability[0]).toBe(0)
    expect(m.stability[0]).toBe(0)
    expect(m.difficulty[0]).toBe(0)
    // Word 2: existed and reviewed → finite metrics
    expect(m.retrievability[1]).toBeCloseTo(0.9, 4)
    expect(m.stability[1]).toBeCloseTo(10, 4)
    expect(m.difficulty[1]).toBeCloseTo(0.5, 4)
  })

  it('unreviewed words do not render as blue (NaN → DEFAULT_RGB_NORM) anymore', () => {
    const pk = makePk(2, idMap([[1, 0], [2, 1]]))
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-05-01', last_review_at: null }),
      node(2, { created_at: '2025-05-01', last_review_at: null }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(1)
    expect(m.existed[1]).toBe(1)
    // Both should have finite (0) values, not NaN, avoiding the blue fallback.
    expect(Number.isFinite(m.retrievability[0])).toBe(true)
    expect(Number.isFinite(m.stability[0])).toBe(true)
    expect(Number.isFinite(m.difficulty[0])).toBe(true)
    expect(Number.isFinite(m.retrievability[1])).toBe(true)
    expect(m.retrievability[0]).toBe(0)
    expect(m.retrievability[1]).toBe(0)
  })

  it('correctly maps metric values from the snapshot', () => {
    const pk = makePk(2, idMap([[100, 0], [200, 1]]))
    const s = snap('2025-06-15', [
      node(100, { created_at: '2025-06-01', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.42, stability: 3.5, difficulty: 0.77 }),
      node(200, { created_at: '2025-06-01', last_review_at: '2025-06-13T10:00:00Z', retrievability: 0.88, stability: 12.0, difficulty: 0.15 }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.retrievability[0]).toBeCloseTo(0.42, 4)
    expect(m.stability[0]).toBeCloseTo(3.5, 4)
    expect(m.difficulty[0]).toBeCloseTo(0.77, 4)
    expect(m.retrievability[1]).toBeCloseTo(0.88, 4)
    expect(m.stability[1]).toBeCloseTo(12.0, 4)
    expect(m.difficulty[1]).toBeCloseTo(0.15, 4)
    expect(m.existed[0]).toBe(1)
    expect(m.existed[1]).toBe(1)
  })

  it('skips nodes that are not in the idToIdx map', () => {
    const pk = makePk(2, idMap([[1, 0], [2, 1]]))
    // Node 3 and 4 are in the history response but not in the graph.
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z' }),
      node(2, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z' }),
      node(3, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z' }),
      node(4, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z' }),
    ])
    const m = buildHistoryMetrics(s, pk)
    // Only first two should be marked as existed.
    expect(m.existed[0]).toBe(1)
    expect(m.existed[1]).toBe(1)
    // The N=2 arrays are unchanged for indices beyond the snapshot match.
  })

  it('empty snapshot produces all zeros and NaN metrics', () => {
    const pk = makePk(5, idMap([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]]))
    const s = snap('2025-06-15', [])
    const m = buildHistoryMetrics(s, pk)
    for (let i = 0; i < 5; i++) {
      expect(m.existed[i]).toBe(0)
      expect(Number.isNaN(m.retrievability[i])).toBe(true)
      expect(Number.isNaN(m.stability[i])).toBe(true)
      expect(Number.isNaN(m.difficulty[i])).toBe(true)
    }
  })

  it('handles non-finite retrievability values gracefully', () => {
    const pk = makePk(1, idMap([[1, 0]]))
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z', retrievability: Infinity, stability: NaN, difficulty: undefined }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(1)
    // Non-finite values should be filtered out, metrics remain NaN
    expect(Number.isNaN(m.retrievability[0])).toBe(true)
    expect(Number.isNaN(m.stability[0])).toBe(true)
    expect(Number.isNaN(m.difficulty[0])).toBe(true)
  })

  it('mixed scenario: some created before, some after, some unreviewed', () => {
    const pk = makePk(5, idMap([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]]))
    const s = snap('2025-06-15', [
      // Created long ago, reviewed → visible with metrics
      node(1, { created_at: '2025-05-01', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.9, stability: 8, difficulty: 0.3 }),
      // Created yesterday, reviewed yesterday → visible with metrics
      node(2, { created_at: '2025-06-14', last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.95, stability: 12, difficulty: 0.2 }),
      // Created today (after target), reviewed today → hidden
      node(3, { created_at: '2025-06-16', last_review_at: '2025-06-16T10:00:00Z', retrievability: 1.0, stability: 20 }),
      // Created long ago but NOT reviewed by target → visible with 0 metrics from backend
      node(4, { created_at: '2025-05-01', last_review_at: null }),
      // No created_at, no review → hidden
      node(5, { created_at: null, last_review_at: null }),
    ])
    const m = buildHistoryMetrics(s, pk)
    // Word 1: visible with metrics
    expect(m.existed[0]).toBe(1)
    expect(m.retrievability[0]).toBeCloseTo(0.9, 4)
    // Word 2: created yesterday, visible with metrics
    expect(m.existed[1]).toBe(1)
    expect(m.retrievability[1]).toBeCloseTo(0.95, 4)
    // Word 3: created after target, hidden
    expect(m.existed[2]).toBe(0)
    // Word 4: created long ago, unreviewed, visible with 0 metrics from backend
    expect(m.existed[3]).toBe(1)
    expect(m.retrievability[3]).toBe(0)
    expect(m.stability[3]).toBe(0)
    expect(m.difficulty[3]).toBe(0)
    // Word 5: no data at all, hidden
    expect(m.existed[4]).toBe(0)
  })

  it('handles created_at as ISO 8601 date strings correctly', () => {
    // created_at from SQLite: '2025-06-10 14:30:00'
    // created_at from JS:      '2025-06-10T14:30:00.000Z'
    const pk = makePk(2, idMap([[1, 0], [2, 1]]))
    const s = snap('2025-06-15', [
      node(1, { created_at: '2025-06-10 14:30:00', last_review_at: null }),
      node(2, { created_at: '2025-06-10T14:30:00.000Z', last_review_at: null }),
    ])
    const m = buildHistoryMetrics(s, pk)
    // Both should be visible — they were created June 10, target is June 15.
    expect(m.existed[0]).toBe(1)
    expect(m.existed[1]).toBe(1)
  })

  it('handles missing or malformed snap.date gracefully', () => {
    const pk = makePk(2, idMap([[1, 0], [2, 1]]))
    // snap.date is undefined
    const s1 = { nodes: [node(1, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z' })] }
    const m1 = buildHistoryMetrics(s1, pk)
    // Without a target date, can't compare created_at. Falls back to last_review_at.
    expect(m1.existed[0]).toBe(1)

    // snap.date is an empty string
    const s2 = snap('', [node(1, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z' })])
    const m2 = buildHistoryMetrics(s2, pk)
    expect(m2.existed[0]).toBe(1)

    // snap.date is a non-date string
    const s3 = snap('not-a-date', [node(1, { created_at: '2025-06-10', last_review_at: '2025-06-14T10:00:00Z' })])
    const m3 = buildHistoryMetrics(s3, pk)
    expect(m3.existed[0]).toBe(1) // falls back to last_review_at
  })

  it('sorts created_at dates correctly with string comparison', () => {
    const pk = makePk(4, idMap([[1, 0], [2, 1], [3, 2], [4, 3]]))
    const s = snap('2025-12-31', [
      // Cross-year boundary
      node(1, { created_at: '2025-12-30', last_review_at: null }),
      node(2, { created_at: '2026-01-01', last_review_at: null }),
      // Cross-month boundary
      node(3, { created_at: '2025-11-30', last_review_at: null }),
      node(4, { created_at: '2025-12-01', last_review_at: null }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(1) // Dec 30 <= Dec 31 ✓
    expect(m.existed[1]).toBe(0) // Jan 1 2026 > Dec 31 2025 ✓
    expect(m.existed[2]).toBe(1) // Nov 30 <= Dec 31 ✓
    expect(m.existed[3]).toBe(1) // Dec 1 <= Dec 31 ✓
  })

  it('a word with created_at missing but with review history is not double-counted', () => {
    // The fallback path should set existed[idx]=1 exactly once.
    const pk = makePk(1, idMap([[1, 0]]))
    const s = snap('2025-06-15', [
      node(1, { created_at: null, last_review_at: '2025-06-14T10:00:00Z', retrievability: 0.85 }),
    ])
    const m = buildHistoryMetrics(s, pk)
    expect(m.existed[0]).toBe(1)
    expect(m.retrievability[0]).toBeCloseTo(0.85, 4)
  })
})

describe('buildHistoryMetrics — no-blue-nodes (IS-017)', () => {
  // When a word existed at the target date but was never reviewed, the backend
  // returns retrievability=0, stability=0, difficulty=0. The frontend must pass
  // those values through (not leave NaN) so the canvas renders them on the
  // colour scale instead of the DEFAULT_RGB_NORM fallback (#60a5fa = blue).

  it('every existed word gets finite metrics, never NaN from the fill', () => {
    const pk = makePk(10, idMap(Array.from({ length: 10 }, (_, i) => [i + 1, i])))
    // Half reviewed, half unreviewed — all existed.
    const nodes = []
    for (let i = 1; i <= 10; i++) {
      const reviewed = i <= 5
      nodes.push(node(i, {
        created_at: '2025-06-01',
        last_review_at: reviewed ? '2025-06-14T10:00:00Z' : null,
        retrievability: reviewed ? 0.8 : 0,
        stability: reviewed ? 5 : 0,
        difficulty: reviewed ? 0.3 : 0,
      }))
    }
    const m = buildHistoryMetrics(snap('2025-06-15', nodes), pk)
    for (let i = 0; i < 10; i++) {
      expect(m.existed[i]).toBe(1)
      expect(Number.isFinite(m.retrievability[i])).toBe(true)
      expect(Number.isFinite(m.stability[i])).toBe(true)
      expect(Number.isFinite(m.difficulty[i])).toBe(true)
    }
  })

  it('unreviewed words have exactly 0 retrievability (not NaN, not undefined)', () => {
    const pk = makePk(3, idMap([[10, 0], [20, 1], [30, 2]]))
    const s = snap('2025-06-15', [
      node(10, { created_at: '2025-05-01', last_review_at: null }),
      node(20, { created_at: '2025-05-01', last_review_at: null }),
      node(30, { created_at: '2025-05-01', last_review_at: null }),
    ])
    const m = buildHistoryMetrics(s, pk)
    for (let i = 0; i < 3; i++) {
      expect(m.retrievability[i]).toBe(0)
      expect(m.stability[i]).toBe(0)
      expect(m.difficulty[i]).toBe(0)
    }
  })

  it('fully reviewed deck produces no NaN metrics anywhere', () => {
    const pk = makePk(5, idMap([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]]))
    const s = snap('2025-12-01', [
      node(1, { created_at: '2025-01-01', last_review_at: '2025-11-30T10:00:00Z', retrievability: 0.95, stability: 20, difficulty: 0.1 }),
      node(2, { created_at: '2025-01-01', last_review_at: '2025-11-30T10:00:00Z', retrievability: 0.88, stability: 15, difficulty: 0.2 }),
      node(3, { created_at: '2025-01-01', last_review_at: '2025-11-30T10:00:00Z', retrievability: 0.72, stability: 8, difficulty: 0.4 }),
      node(4, { created_at: '2025-01-01', last_review_at: '2025-11-30T10:00:00Z', retrievability: 0.91, stability: 18, difficulty: 0.15 }),
      node(5, { created_at: '2025-01-01', last_review_at: '2025-11-30T10:00:00Z', retrievability: 0.83, stability: 12, difficulty: 0.25 }),
    ])
    const m = buildHistoryMetrics(s, pk)
    for (let i = 0; i < 5; i++) {
      expect(m.existed[i]).toBe(1)
      expect(Number.isFinite(m.retrievability[i])).toBe(true)
      expect(Number.isFinite(m.stability[i])).toBe(true)
      expect(Number.isFinite(m.difficulty[i])).toBe(true)
      expect(m.retrievability[i]).toBeGreaterThan(0)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { isChainComplete, isWordUsed, newlyGrownWords, progressPercent } from './growthModel'

describe('growthModel', () => {
  it('computes progress percent from usedWordIds over the current targetSize', () => {
    expect(progressPercent({ usedWordIds: [1, 2], targetSize: 4 })).toBe(50)
    expect(progressPercent({ usedWordIds: [], targetSize: 0 })).toBe(0)
    expect(progressPercent(undefined)).toBe(0)
  })

  it('clamps to 0-100 even with an inconsistent payload', () => {
    expect(progressPercent({ usedWordIds: [1, 2, 3, 4, 5], targetSize: 4 })).toBe(100)
  })

  it('flags a word as used only if its id is in usedWordIds', () => {
    const growth = { usedWordIds: [1, 3], targetSize: 4 }
    expect(isWordUsed(1, growth)).toBe(true)
    expect(isWordUsed(2, growth)).toBe(false)
  })

  it('detects newly grown words by id, and by expression when id is not yet resolved', () => {
    const prev = [{ id: 1, expression: 'a' }, { id: 2, expression: 'b' }]
    const current = [...prev, { id: 3, expression: 'c' }]
    expect(newlyGrownWords(prev, current)).toEqual([{ id: 3, expression: 'c' }])

    const currentUnresolved = [...prev, { id: null, expression: 'd' }]
    expect(newlyGrownWords(prev, currentUnresolved)).toEqual([{ id: null, expression: 'd' }])
  })

  it('reports no new words when the set is unchanged', () => {
    const prev = [{ id: 1, expression: 'a' }]
    expect(newlyGrownWords(prev, prev)).toEqual([])
  })

  it('reads chainComplete off the growth payload', () => {
    expect(isChainComplete({ chainComplete: true })).toBe(true)
    expect(isChainComplete({})).toBe(false)
  })
})

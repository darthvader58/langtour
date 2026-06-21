// Unit tests for the historyCache fallback path (IndexedDB unavailable).
// IndexedDB integration tests live in historyCache.idb.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest'

function makeMetrics(n) {
  const retrievability = new Float32Array(n)
  const stability = new Float32Array(n)
  const difficulty = new Float32Array(n)
  const existed = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    retrievability[i] = 0.5 + (i % 10) / 100
    stability[i] = 5 + (i % 3)
    difficulty[i] = 0.1 + (i % 7) / 100
    existed[i] = i % 3 === 0 ? 1 : 0
  }
  return { retrievability, stability, difficulty, existed, n }
}

describe('historyCache (unavailable IndexedDB)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('getCachedHistory returns null when IndexedDB is not available', async () => {
    const orig = globalThis.indexedDB
    delete globalThis.indexedDB
    try {
      vi.resetModules()
      const mod = await import('./historyCache.js')
      const hit = await mod.getCachedHistory('2025-06-15', 10)
      expect(hit).toBeNull()
    } finally {
      globalThis.indexedDB = orig
    }
  })

  it('putCachedHistory does not throw when IndexedDB is not available', async () => {
    const orig = globalThis.indexedDB
    delete globalThis.indexedDB
    try {
      vi.resetModules()
      const mod = await import('./historyCache.js')
      const metrics = makeMetrics(5)
      await mod.putCachedHistory('2025-06-15', metrics)
    } finally {
      globalThis.indexedDB = orig
    }
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { graphPayloadToSnapshot, snapshotToGraphState } from './graphSnapshotCache.js'

function sampleData() {
  return {
    totalWords: 2,
    sampled: false,
    dimInfo: { effective_dim: 2 },
    pcaInfo: { eigenvalues: [2, 1] },
    nodes: [
      { id: 1, expression: '你', reading: 'ni3', meaning: 'you', pcScores: [1, 2], umapX: 0.1, umapY: 0.2, umapZ: 0.3, retrievability: 0.9, stability: 5, difficulty: 3, connectivity: 0.1, density: 2, hubness: 4, reps: 2 },
      { id: 2, expression: '好', reading: 'hao3', meaning: 'good', pcScores: [3, 4], umapX: 0.4, umapY: 0.5, umapZ: 0.6, retrievability: 0.8, stability: 6, difficulty: 4, connectivity: 0.2, density: 3, hubness: 5, reps: 3 },
    ],
  }
}

describe('graphSnapshotCache conversion', () => {
  it('round-trips graph payloads through typed-array snapshot shape', () => {
    const snapshot = graphPayloadToSnapshot(sampleData(), {
      edges: [{ source: 1, target: 2, sim: 0.95 }],
    }, 'snap_1', { maxNodes: 10000 })

    expect(snapshot.pc).toBeInstanceOf(Float32Array)
    expect(snapshot.coords).toBeInstanceOf(Float32Array)
    expect(snapshot.edgePairs).toBeInstanceOf(Uint32Array)
    expect(snapshot.metrics.retrievability).toBeInstanceOf(Float32Array)

    const restored = snapshotToGraphState(snapshot)
    expect(restored.data.snapshotKey).toBe('snap_1')
    expect(restored.data.nodes).toHaveLength(2)
    expect(restored.data.nodes[0].pcScores).toEqual([1, 2])
    expect(restored.data.nodes[1].reps).toBe(3)
    expect(restored.edgesData.edges).toEqual([{ source: 1, target: 2, sim: expect.closeTo(0.95, 5) }])
  })
})

describe('graphSnapshotCache IndexedDB fallback', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('getCachedGraphSnapshot returns null when IndexedDB is unavailable', async () => {
    const orig = globalThis.indexedDB
    delete globalThis.indexedDB
    try {
      vi.resetModules()
      const mod = await import('./graphSnapshotCache.js')
      await expect(mod.getCachedGraphSnapshot({ maxNodes: 10000 })).resolves.toBeNull()
    } finally {
      globalThis.indexedDB = orig
    }
  })

  it('putCachedGraphSnapshot does not throw when IndexedDB is unavailable', async () => {
    const orig = globalThis.indexedDB
    delete globalThis.indexedDB
    try {
      vi.resetModules()
      const mod = await import('./graphSnapshotCache.js')
      const snapshot = graphPayloadToSnapshot(sampleData(), { edges: [] }, 'snap_1')
      await expect(mod.putCachedGraphSnapshot(snapshot)).resolves.toBeUndefined()
    } finally {
      globalThis.indexedDB = orig
    }
  })
})

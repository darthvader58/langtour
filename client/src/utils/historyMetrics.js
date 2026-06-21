// buildHistoryMetrics: transform a /api/graph/history API response into
// node-position-indexed Float32Arrays. Shared by the on-demand scrub path
// and the background prefetch in GraphView.

export function buildHistoryMetrics(snap, pk) {
  const N = pk.N
  const idToIdx = pk.idToIdx
  const metrics = {
    retrievability: new Float32Array(N),
    stability:      new Float32Array(N),
    difficulty:     new Float32Array(N),
    existed: new Uint8Array(N),
    n: N,
  }
  metrics.retrievability.fill(NaN)
  metrics.stability.fill(NaN)
  metrics.difficulty.fill(NaN)

  const targetDate = String(snap.date || '').slice(0, 10)

  for (const n of snap.nodes || []) {
    const idx = idToIdx.get(n.id)
    if (idx == null) continue

    const createdDate = String(n.created_at || '').slice(0, 10)
    const hasCreatedAt = !!(createdDate && targetDate)

    if (hasCreatedAt) {
      if (createdDate <= targetDate) metrics.existed[idx] = 1
      // else: created after target date — leave existed[idx] = 0
    } else if (n.last_review_at) {
      // Fallback: created_at is missing, but the word has review history.
      // Treat it as existed (pre-existing word from before created_at was tracked).
      metrics.existed[idx] = 1
    }
    // else: no created_at AND no review history — leave existed[idx] = 0

    if (metrics.existed[idx]) {
      const r = Number(n.retrievability); if (Number.isFinite(r)) metrics.retrievability[idx] = r
      const s = Number(n.stability);      if (Number.isFinite(s)) metrics.stability[idx] = s
      const d = Number(n.difficulty);     if (Number.isFinite(d)) metrics.difficulty[idx] = d
    }
  }

  return metrics
}

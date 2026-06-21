// Client-side k-NN graph over an array of vectors, plus metrics derived from it
// (Moran's I, LOF, neighborhood purity, neighbor-mean). All pure functions.
//
// Operates on `pcScores` in practice, not raw embeddings — raw embeddings aren't sent
// to the client. PC space preserves most of the pairwise structure for the dims we use
// (topK ≈ 8–16), so interactive probes are meaningful even if not exact.

import { euclid } from './metrics.js'

// Build a k-NN graph. For each row i, returns the k nearest *other* row indices plus their
// distances, sorted ascending. O(n² · d + n² · log k) — fine up to a few thousand nodes.
// `distFn(a, b)` defaults to euclidean. Rows that are empty vectors get no neighbors.
export function buildKnnGraph(points, k = 10, distFn = euclid) {
  const n = points.length
  const neighbors = Array.from({ length: n }, () => [])
  const distances = Array.from({ length: n }, () => [])
  if (n <= 1) return { neighbors, distances }
  for (let i = 0; i < n; i++) {
    const pi = points[i]
    if (!pi || pi.length === 0) continue
    // Running top-k (max-heap would be faster; simple sorted array is fine at n ~ 7k).
    const heap = [] // [{ idx, d }]
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const pj = points[j]
      if (!pj || pj.length === 0) continue
      const d = distFn(pi, pj)
      if (heap.length < k) {
        heap.push({ idx: j, d })
        if (heap.length === k) heap.sort((a, b) => b.d - a.d)
      } else if (d < heap[0].d) {
        heap[0] = { idx: j, d }
        // Re-bubble the new head to its sorted position (descending).
        let p = 0
        while (p + 1 < heap.length && heap[p].d < heap[p + 1].d) {
          const t = heap[p]; heap[p] = heap[p + 1]; heap[p + 1] = t; p++
        }
      }
    }
    heap.sort((a, b) => a.d - b.d) // ascending for the stored result
    neighbors[i] = heap.map(h => h.idx)
    distances[i] = heap.map(h => h.d)
  }
  return { neighbors, distances }
}

// For each node, the mean metric value across its k-NN. Non-finite neighbor values drop
// out of the mean. Used by the neighborhood-agreement scatter.
export function knnMeanMetric(neighbors, values) {
  const n = neighbors.length
  const out = new Array(n).fill(NaN)
  for (let i = 0; i < n; i++) {
    const nb = neighbors[i]
    let s = 0, c = 0
    for (const j of nb) {
      const v = values[j]
      if (Number.isFinite(v)) { s += v; c++ }
    }
    out[i] = c > 0 ? s / c : NaN
  }
  return out
}

// Moran's I: global spatial-autocorrelation statistic. Positive ≈ clustering (like values
// near like values), 0 ≈ random, negative ≈ dispersion. Weight matrix is binary over the
// k-NN edges — simple and standard.
//
// Formula: I = (n / W) · Σ_ij w_ij (x_i - x̄)(x_j - x̄) / Σ_i (x_i - x̄)²
// where W = Σ_ij w_ij.
export function moransI(neighbors, values) {
  const n = neighbors.length
  // Mean over finite values only.
  let sum = 0, cnt = 0
  for (const v of values) if (Number.isFinite(v)) { sum += v; cnt++ }
  if (cnt < 2) return 0
  const mean = sum / cnt
  let num = 0, denom = 0, W = 0
  for (let i = 0; i < n; i++) {
    const vi = values[i]
    if (!Number.isFinite(vi)) continue
    const di = vi - mean
    denom += di * di
    for (const j of neighbors[i]) {
      const vj = values[j]
      if (!Number.isFinite(vj)) continue
      num += (di) * (vj - mean)
      W += 1
    }
  }
  if (denom === 0 || W === 0) return 0
  return (n / W) * (num / denom)
}

// Neighborhood purity: fraction of k-NN sharing the same bucket as the center. Per-node
// values in [0, 1]; returns the full array so the caller can histogram or average.
export function neighborhoodPurity(neighbors, bucketIds) {
  const n = neighbors.length
  const out = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const bi = bucketIds[i]
    if (bi == null) { out[i] = NaN; continue }
    const nb = neighbors[i]
    if (!nb.length) { out[i] = NaN; continue }
    let same = 0, total = 0
    for (const j of nb) {
      const bj = bucketIds[j]
      if (bj == null) continue
      total++
      if (bj === bi) same++
    }
    out[i] = total > 0 ? same / total : NaN
  }
  return out
}

// Local Outlier Factor. For each node, compares its local reachability density to that of
// its neighbors; high LOF = unusually isolated relative to its surroundings.
//
// Standard formulation (Breunig et al. 2000):
//   reach_dist_k(a, b) = max(k-distance(b), d(a, b))
//   lrd(a)  = 1 / mean_{b ∈ N_k(a)} reach_dist_k(a, b)
//   LOF(a)  = mean_{b ∈ N_k(a)} lrd(b) / lrd(a)
export function lofScores(neighbors, distances) {
  const n = neighbors.length
  // k-distance(b) = distance to b's k-th (last) neighbor.
  const kDist = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const d = distances[i]
    kDist[i] = d.length ? d[d.length - 1] : 0
  }
  // Local reachability density.
  const lrd = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const nb = neighbors[i]; const dd = distances[i]
    if (!nb.length) { lrd[i] = 0; continue }
    let sumReach = 0
    for (let t = 0; t < nb.length; t++) {
      const b = nb[t]
      const reach = Math.max(kDist[b], dd[t])
      sumReach += reach
    }
    lrd[i] = sumReach > 0 ? nb.length / sumReach : 0
  }
  // LOF = mean neighbor lrd / self lrd.
  const lof = new Array(n).fill(1)
  for (let i = 0; i < n; i++) {
    const nb = neighbors[i]
    if (!nb.length || lrd[i] === 0) { lof[i] = 1; continue }
    let s = 0, c = 0
    for (const j of nb) { s += lrd[j]; c++ }
    lof[i] = c > 0 ? (s / c) / lrd[i] : 1
  }
  return lof
}

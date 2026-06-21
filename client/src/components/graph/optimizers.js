// Axis-optimization routines. Each one takes the current `data` + `W` (the K×3 projection
// matrix, stored as { wx, wy, wz } — three length-K arrays) and returns a fresh { W } or
// { W, lossHistory }. No React state, no side effects — the caller (GraphView shell) applies
// the result via setW.
//
// The optimisers work in the space of V0/V1/V2 (K-dim vectors for the X, Y, and Z world axes).
// applyVectorsToW copies those into W's wx/wy/wz columns. For 2D-only optimisers V2 is
// omitted and wz stays at whatever the user last set.

import { TOP_K } from './constants.js'
import { fisherLDATop2 } from '../../utils/projections.js'
import { runSGD, runIsolateFocus } from './workerBridge.js'

// Copy the optimiser's K×3 result (v0, v1, v2) into W's wx/wy/wz columns. When v2 is
// omitted wz is preserved so 2D-only optimisers don't clobber the user's Z-depth.
// Rescales so max component = 1 for consistent axis-pad knob ranges.
function applyVectorsToW(W, v0, v1, v2, K) {
  const wx = W.wx.slice()
  const wy = W.wy.slice()
  const wz = W.wz.slice()
  let maxSq = 0
  for (let k = 0; k < K; k++) {
    wx[k] = v0[k]
    wy[k] = v1[k]
    const s = wx[k] * wx[k] + wy[k] * wy[k]
    if (s > maxSq) maxSq = s
  }
  if (v2) {
    for (let k = 0; k < K; k++) {
      wz[k] = v2[k]
      const s = wz[k] * wz[k]
      if (s > maxSq) maxSq = s
    }
  }
  const scale = maxSq > 0 ? 1 / Math.sqrt(maxSq) : 1
  for (let k = 0; k < K; k++) { wx[k] *= scale; wy[k] *= scale }
  if (v2) for (let k = 0; k < K; k++) wz[k] *= scale
  return { W: { wx, wy, wz } }
}

// Best 3D perspective: ranks PCs by eigenvalue (largest variance first) and puts the
// top-3 on orthogonal axes at mag=1. Everything else is silenced.
//
// Why this is optimal: for a data matrix X the 3D projection that minimizes the sum of
// squared pairwise-distance errors is the one onto the top-3 eigenvectors of XᵀX (classic
// theorem — PCA = MDS on Euclidean distances). The server already returns `pcScores`
// ordered by descending eigenvalue alongside `pcaInfo.eigenvalues`; we trust that
// ranking when available and fall back to sample-variance ranking otherwise.
export function optimizeForDistances(data, W, TOP_K_IN = TOP_K) {
  if (!data?.nodes?.length) return null
  const K = Math.min(TOP_K_IN, data.nodes[0].pcScores?.length || 0)
  if (K < 3) return null

  const eigs = data.pcaInfo?.eigenvalues
  let scores
  if (Array.isArray(eigs) && eigs.length >= K) {
    scores = eigs.slice(0, K).map((v, k) => ({ k, s: Number(v) || 0 }))
  } else {
    const n = data.nodes.length
    const means = new Float64Array(K)
    for (let i = 0; i < n; i++) {
      const pc = data.nodes[i].pcScores || []
      for (let k = 0; k < K; k++) means[k] += (pc[k] || 0)
    }
    for (let k = 0; k < K; k++) means[k] /= n
    const variance = new Float64Array(K)
    for (let i = 0; i < n; i++) {
      const pc = data.nodes[i].pcScores || []
      for (let k = 0; k < K; k++) {
        const d = (pc[k] || 0) - means[k]
        variance[k] += d * d
      }
    }
    scores = Array.from(variance).map((s, k) => ({ k, s }))
  }
  scores.sort((a, b) => b.s - a.s)
  const i1 = scores[0].k, i2 = scores[1].k, i3 = scores[2].k

  const v0 = new Float64Array(K), v1 = new Float64Array(K), v2 = new Float64Array(K)
  v0[i1] = 1; v1[i2] = 1; v2[i3] = 1
  return applyVectorsToW(W, v0, v1, v2, K)
}

// Spread hubs: farthest-point sampling on top-40 by hubness picks 10 diverse hub centers;
// LDA separates those 10 tribes.
export function optimizeAnglesForHubs(data, W, TOP_K_IN = TOP_K, N_HUBS_IN = 10) {
  if (!data?.nodes?.length) return null
  const K = Math.min(TOP_K_IN, data.nodes[0].pcScores?.length || 0)
  if (K < 2) return null
  const N_HUBS = N_HUBS_IN
  const POOL_N = Math.min(40, data.nodes.length)
  const sortedByHub = data.nodes
    .map((n, i) => ({ i, h: n.hubness || 0 }))
    .sort((a, b) => b.h - a.h)
    .slice(0, POOL_N)
  const candPcs = sortedByHub.map(c => (data.nodes[c.i].pcScores || []).slice(0, K))
  const selected = [0]
  const minDist = new Float64Array(POOL_N)
  for (let i = 0; i < POOL_N; i++) {
    if (i === 0) { minDist[i] = 0; continue }
    let s = 0
    for (let k = 0; k < K; k++) { const d = candPcs[i][k] - candPcs[0][k]; s += d * d }
    minDist[i] = s
  }
  const chosenSet = new Set(selected)
  while (selected.length < N_HUBS && selected.length < POOL_N) {
    let bestI = -1, bestD = -1
    for (let i = 0; i < POOL_N; i++) {
      if (chosenSet.has(i)) continue
      if (minDist[i] > bestD) { bestD = minDist[i]; bestI = i }
    }
    if (bestI < 0) break
    selected.push(bestI)
    chosenSet.add(bestI)
    for (let i = 0; i < POOL_N; i++) {
      if (chosenSet.has(i)) continue
      let s = 0
      for (let k = 0; k < K; k++) { const d = candPcs[i][k] - candPcs[bestI][k]; s += d * d }
      if (s < minDist[i]) minDist[i] = s
    }
  }
  const hubIdx = selected.map(s => sortedByHub[s].i)
  const hubPcs = hubIdx.map(i => (data.nodes[i].pcScores || []).slice(0, K))
  const labels = new Array(data.nodes.length)
  for (let i = 0; i < data.nodes.length; i++) {
    const pc = (data.nodes[i].pcScores || []).slice(0, K)
    let bestHub = 0, bestDist = Infinity
    for (let h = 0; h < hubPcs.length; h++) {
      const hp = hubPcs[h]
      let s = 0
      for (let k = 0; k < K; k++) { const d = hp[k] - (pc[k] || 0); s += d * d }
      if (s < bestDist) { bestDist = s; bestHub = h }
    }
    labels[i] = bestHub
  }
  const counts = new Array(hubIdx.length).fill(0)
  for (const l of labels) counts[l]++
  if (counts.some(c => c < 2)) return null
  const scores = data.nodes.map(n => (n.pcScores || []).slice(0, K))
  const result = fisherLDATop2(scores, labels, K)
  if (!result) return null
  return applyVectorsToW(W, result.v1, result.v2, undefined, K)
}

// Nonlinear MDS-style distance preservation via stochastic gradient descent on the 3×K
// projection matrix. Unlike `optimizeForDistances` (which picks the top-3 eigenvalue PCs
// and stops), this refines a free 3×K mapping to minimize Σ (d_low − d_high)² — so it
// can blend contributions from multiple PCs and find a rotation that PCA misses.
//
// Starts from top-3 eigenvalue PCs as a warm start (so worst-case it matches the linear
// best). Runs on a stride-sampled 400-point subset for speed.
export async function optimizeNonlinearDistances(data, W, TOP_K_IN = TOP_K, onProgress) {
  if (!data?.nodes?.length) return null
  const K = Math.min(TOP_K_IN, data.nodes[0].pcScores?.length || 0)
  if (K < 3) return null

  const { sub } = sampleSub(data, K)
  const m = sub.length

  // Target = normalized high-dim pairwise distances.
  const dTarget = new Float64Array(m * m)
  let meanDist = 0, pairs = 0
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      let s = 0
      for (let k = 0; k < K; k++) { const d = sub[i][k] - sub[j][k]; s += d * d }
      const d = Math.sqrt(s)
      dTarget[i * m + j] = d; dTarget[j * m + i] = d
      meanDist += d; pairs++
    }
  }
  meanDist = Math.max(meanDist / Math.max(pairs, 1), 1e-9)
  for (let i = 0; i < dTarget.length; i++) dTarget[i] /= meanDist

  // Warm start: top-3 eigenvalue PCs.
  const eigs = data.pcaInfo?.eigenvalues
  let ranked
  if (Array.isArray(eigs) && eigs.length >= K) {
    ranked = eigs.slice(0, K).map((v, k) => ({ k, s: Number(v) || 0 }))
  } else {
    const variance = new Float64Array(K)
    for (let i = 0; i < m; i++) {
      for (let k = 0; k < K; k++) { const v = sub[i][k]; variance[k] += v * v }
    }
    ranked = Array.from(variance).map((s, k) => ({ k, s }))
  }
  ranked.sort((a, b) => b.s - a.s)
  return runStressSGD(W, sub, K, dTarget, initAxisAlignedV(K, ranked[0].k, ranked[1].k, ranked[2].k), false, onProgress)
}

// Shared SGD stress-minimization core. Given a stride-sampled subset of pcScores plus
// a target-distance matrix (one entry per pair, in [0, ∞) — negative entries signal
// "skip this pair"), it warm-starts from a provided initial 2×K or 3×K projection and runs
// SGD to minimize Σ (d_proj − d_target)².
//
// Returns `{ W, lossHistory }` where lossHistory[iter] is the mean squared
// stress over a 500-pair sample at the end of that iteration. Early-stops when loss
// fails to improve by ≥ 0.1 % for PATIENCE consecutive iterations (after a MIN_ITERS
// warm-up), so cheap problems converge fast without burning the full 200 iters.
async function runStressSGD(W, sub, K, dTarget, initV, freezeV0 = false, onProgress) {
  const m = sub.length
  // Pack sub (m × K) into a flat Float32 buffer. dTarget is already flat. V0/V1/V2 are length K.
  const subFlat = new Float32Array(m * K)
  for (let i = 0; i < m; i++) {
    const row = sub[i]
    for (let k = 0; k < K; k++) subFlat[i * K + k] = row[k] || 0
  }
  const dTargetF32 = dTarget instanceof Float32Array ? dTarget : Float32Array.from(dTarget)
  const V0F32 = Float32Array.from(initV[0])
  const V1F32 = Float32Array.from(initV[1])
  const V2F32 = initV[2] ? Float32Array.from(initV[2]) : null

  // Decorate the caller's onProgress so each SGD snapshot also carries the
  // intermediate (mags, angles) axis representation — the UI uses this to animate
  // the projection live while optimization runs.
  const wrappedProgress = onProgress ? (p) => {
    if (p.V0 && p.V1) {
      const live = applyVectorsToW(W, p.V0, p.V1, p.V2, K)
      onProgress({ iter: p.iter, loss: p.loss, W: live.W })
    } else {
      onProgress({ iter: p.iter, loss: p.loss })
    }
  } : undefined

  const sgdParams = {
    m, K,
    sub: subFlat,
    dTarget: dTargetF32,
    V0: V0F32, V1: V1F32,
    iters: 200, lr: 0.02, samplesPerIter: 1500,
    minIters: 20, patience: 15, improveTol: 0.001,
    dlFloor: 1e-9, coefClip: Infinity, freezeV0,
    progressEvery: 5,
  }
  if (V2F32) sgdParams.V2 = V2F32

  const result = await runSGD(sgdParams, wrappedProgress)

  return { ...applyVectorsToW(W, result.V0, result.V1, result.V2, K), lossHistory: result.lossHistory }
}

// Sample subset of pcScores for SGD speed. Returns { sub, origIdx } where origIdx[i] is
// the original data.nodes index of sub[i].
function sampleSub(data, K, targetN = 400) {
  const subN = Math.min(targetN, data.nodes.length)
  const stride = data.nodes.length / subN
  const sub = new Array(subN)
  const origIdx = new Array(subN)
  for (let i = 0; i < subN; i++) {
    const idx = Math.floor(i * stride)
    origIdx[i] = idx
    sub[i] = (data.nodes[idx].pcScores || []).slice(0, K)
  }
  return { sub, origIdx }
}

// Warm-start K×3 projection with a single PC on each axis.
function initAxisAlignedV(K, i1, i2, i3) {
  const V0 = new Float64Array(K)
  const V1 = new Float64Array(K)
  V0[i1] = 1; V1[i2] = 1
  if (i3 != null) {
    const V2 = new Float64Array(K)
    V2[i3] = 1
    return [V0, V1, V2]
  }
  return [V0, V1]
}

// Nonlinear MDS-style distance preservation for a per-node metric. For each sampled
// pair, the target distance is |metric_i − metric_j| (normalized to mean = 1). SGD
// finds the 2D projection that best reproduces those metric-weighted distances — pairs
// with very different metric values end up far apart in 2D, pairs with similar values
// end up close. Catches non-linear structure the quartile LDA misses.
export async function optimizeNonlinearForMetric(data, W, metricKey, TOP_K_IN = TOP_K, onProgress, opts = {}) {
  if (!data?.nodes?.length) return null
  const K = Math.min(TOP_K_IN, data.nodes[0].pcScores?.length || 0)
  if (K < 2) return null
  const { valuesOverride = null, visibilityMask = null } = opts

  const { sub, origIdx } = sampleSub(data, K)
  const m = sub.length
  // Per-subsample metric value: honor the historical override (if given) and the
  // visibility mask (hidden nodes get NaN so their dTarget slots become -1 sentinels
  // and get skipped by SGD entirely).
  const values = origIdx.map((i) => {
    if (visibilityMask && !visibilityMask[i]) return NaN
    return valuesOverride ? valuesOverride[i] : Number(data.nodes[i][metricKey])
  })
  const finiteValues = values.filter(Number.isFinite)
  if (finiteValues.length < 10) return null

  // Target = |Δmetric|, normalized so the mean nonzero target is 1.
  const dTarget = new Float64Array(m * m)
  let sum = 0, pairs = 0
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      if (!Number.isFinite(values[i]) || !Number.isFinite(values[j])) {
        dTarget[i * m + j] = -1; dTarget[j * m + i] = -1 // sentinel = skip
        continue
      }
      const d = Math.abs(values[i] - values[j])
      dTarget[i * m + j] = d; dTarget[j * m + i] = d
      sum += d; pairs++
    }
  }
  const meanD = Math.max(sum / Math.max(pairs, 1), 1e-9)
  for (let i = 0; i < dTarget.length; i++) if (dTarget[i] > 0) dTarget[i] /= meanD

  // Warm start: top-2 eigenvalue PCs (same as best 3D's linear component).
  const eigs = data.pcaInfo?.eigenvalues
  let ranked
  if (Array.isArray(eigs) && eigs.length >= K) {
    ranked = eigs.slice(0, K).map((v, k) => ({ k, s: Number(v) || 0 }))
  } else {
    ranked = Array.from({ length: K }, (_, k) => ({ k, s: 0 }))
  }
  ranked.sort((a, b) => b.s - a.s)
  const initV = initAxisAlignedV(K, ranked[0].k, ranked[1].k)
  return runStressSGD(W, sub, K, dTarget, initV, false, onProgress)
}

// Nonlinear isolate-focus. Takes the linear OLS similarity-regression result (focus
// pinned at the positive-x extreme) and runs SGD *only on V[1]* — the orthogonal axis —
// to tighten focus-relative 2D distances. V[0] is frozen because that's what's keeping
// the focus at the edge; letting SGD touch it would let the cloud drift around the focus
// (the symmetric "focus in the middle with others in a ring" solution is also stress-
// optimal but loses the isolation property).
export async function optimizeNonlinearIsolateFocus(data, W, focusNodeRef, TOP_K_IN = TOP_K, onProgress) {
  if (!data?.nodes?.length || !focusNodeRef) return null
  const K = Math.min(TOP_K_IN, data.nodes[0].pcScores?.length || 0)
  if (K < 2) return null

  // Start from the linear OLS similarity result — already has focus at the extreme.
  const linear = await optimizeIsolateFocus(data, W, focusNodeRef, K)
  if (!linear) return null
  const initV0 = new Float64Array(K), initV1 = new Float64Array(K)
  for (let k = 0; k < K; k++) {
    initV0[k] = linear.W.wx[k]
    initV1[k] = linear.W.wy[k]
  }

  // Sample subset, force focus at index 0 so every pair sampled from index 0 is a
  // focus-vs-other pair. The target matrix mirrors that: only row/col 0 carries real
  // targets; all other entries are −1 (sentinel = skip in the worker).
  const { sub } = sampleSub(data, K)
  sub[0] = (focusNodeRef.pcScores || []).slice(0, K)
  const m = sub.length

  let sumFocus = 0, nFocus = 0
  for (let j = 1; j < m; j++) {
    let s = 0
    for (let k = 0; k < K; k++) { const d = sub[0][k] - sub[j][k]; s += d * d }
    sumFocus += Math.sqrt(s); nFocus++
  }
  const meanFocus = Math.max(sumFocus / Math.max(nFocus, 1), 1e-9)
  const dTarget = new Float32Array(m * m).fill(-1)
  for (let j = 1; j < m; j++) {
    let s = 0
    for (let k = 0; k < K; k++) { const d = sub[0][k] - sub[j][k]; s += d * d }
    const t = Math.sqrt(s) / meanFocus
    dTarget[0 * m + j] = t
    dTarget[j * m + 0] = t
  }

  // Delegate to the shared worker SGD with V[0] frozen so focus stays at the extreme.
  // `dlFloor` + `coefClip` tighter here because this problem had numerical divergence
  // issues in its previous main-thread form.
  const subFlat = new Float32Array(m * K)
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < K; k++) subFlat[i * K + k] = sub[i][k] || 0
  }
  // Live stream: renormalize intermediate V0/V1 (same way we do for the final result
  // below) before feeding them to the UI so the animation doesn't collapse to a line
  // on early iterations.
  const wrappedProgress = onProgress ? (p) => {
    if (p.V0 && p.V1) {
      const nn0 = Math.sqrt(p.V0.reduce((s, v) => s + v * v, 0)) || 1
      const nn1 = Math.sqrt(p.V1.reduce((s, v) => s + v * v, 0)) || 1
      const v0 = new Float32Array(K); for (let k = 0; k < K; k++) v0[k] = p.V0[k] / nn0
      const v1 = new Float32Array(K); for (let k = 0; k < K; k++) v1[k] = p.V1[k] / nn1
      const live = applyVectorsToW(W, v0, v1, undefined, K)
      onProgress({ iter: p.iter, loss: p.loss, W: live.W })
    } else {
      onProgress({ iter: p.iter, loss: p.loss })
    }
  } : undefined

  const { V0, V1, lossHistory } = await runSGD({
    m, K,
    sub: subFlat,
    dTarget,
    V0: Float32Array.from(initV0), V1: Float32Array.from(initV1),
    iters: 200, lr: 0.02, samplesPerIter: 1500,
    minIters: 20, patience: 15, improveTol: 0.001,
    dlFloor: 0.05, coefClip: 50, freezeV0: true,
    progressEvery: 5,
  }, wrappedProgress)

  // Rescale V0 and V1 to equal norms before applyVectorsToAxes so neither dominates
  // the max-mag normalization (otherwise the 2D projection collapses to a line).
  let n0 = 0, n1 = 0
  for (let k = 0; k < K; k++) { n0 += V0[k] * V0[k]; n1 += V1[k] * V1[k] }
  n0 = Math.sqrt(n0) || 1
  n1 = Math.sqrt(n1) || 1
  for (let k = 0; k < K; k++) { V0[k] /= n0; V1[k] /= n1 }
  return { ...applyVectorsToW(W, V0, V1, undefined, K), lossHistory }
}

// Isolate the focus — strong similarity gradient layout.
//
//   V[0] = direction that MAXIMIZES correlation between projection and (−distance to
//          focus). Solved by ordinary-least-squares regression of the per-node similarity
//          score onto the pcScores. This gives the linear axis where position ≈
//          similarity-to-focus: focus at one extreme, dissimilar nodes at the opposite.
//          Much stronger and more faithful than the naïve (focus − μ) direction, which
//          only reflects the focus's offset from the cloud center, not per-node similarity.
//   V[1] = top-variance PC direction orthogonal to V[0]. Minor axis — spreads the cloud
//          so nearby-similarity nodes don't stack on top of each other.
//
// The net visual: a hard horizontal gradient of similarity, focus pinned at one edge.
// Isolate the focus — strong similarity gradient layout. All O(N·K) linear algebra
// runs in the graph worker (see optimizers.worker.js handleIsolateFocus) so even
// N=10k·K=384 clouds don't freeze the main thread.
//
// See the worker handler for the math: v0 = OLS regression of similarity-to-focus
// onto pcScores, v1 = highest-variance PC direction orthogonal to v0.
export async function optimizeIsolateFocus(data, W, focusNodeRef, TOP_K_IN = TOP_K) {
  if (!data?.nodes?.length || !focusNodeRef) return null
  const K = Math.min(TOP_K_IN, data.nodes[0].pcScores?.length || 0)
  if (K < 2) return null
  const focusIdx = data.nodes.findIndex(n => n.id === focusNodeRef.id)
  if (focusIdx < 0) return null

  const { v0, v1 } = await runIsolateFocus(focusIdx)
  return applyVectorsToW(W, v0, v1, undefined, K)
}

// Best perspective for exposing structure in a per-node metric. Buckets the metric into
// quartiles (4 bins) and runs Fisher's LDA to find the 2D subspace that best separates
// those buckets. Quartile bucketing is the trick that catches **non-linear and
// non-monotonic** relationships: a V-shape, a threshold effect, or a bimodal split all
// show up as separable quartiles even though a linear regression would miss them.
//
// Nodes with a non-finite metric value are dropped from the LDA sample but kept in the
// final 2D projection (they just aren't considered when solving for the axes).
export function optimizeForMetric(data, W, metricKey, TOP_K_IN = TOP_K, opts = {}) {
  if (!data?.nodes?.length) return null
  const K = Math.min(TOP_K_IN, data.nodes[0].pcScores?.length || 0)
  if (K < 2) return null
  const { valuesOverride = null, visibilityMask = null } = opts

  const N = data.nodes.length
  const values = new Array(N)
  for (let i = 0; i < N; i++) {
    if (visibilityMask && !visibilityMask[i]) { values[i] = NaN; continue }
    values[i] = valuesOverride
      ? valuesOverride[i]
      : Number(data.nodes[i][metricKey])
  }
  const valid = values
    .map((v, i) => ({ v, i }))
    .filter(x => Number.isFinite(x.v))
  if (valid.length < 20) return null

  // Rank-bucket into quartiles, assign label 0…3.
  valid.sort((a, b) => a.v - b.v)
  const BINS = 4
  const labels = []
  const rows = []
  const perBin = valid.length / BINS
  const pc = (i) => (data.nodes[i].pcScores || []).slice(0, K)
  for (let r = 0; r < valid.length; r++) {
    const bin = Math.min(BINS - 1, Math.floor(r / perBin))
    labels.push(bin)
    rows.push(pc(valid[r].i))
  }

  // Need at least 2 samples in each bin for LDA covariance estimates to be non-degenerate.
  const counts = new Array(BINS).fill(0)
  for (const l of labels) counts[l]++
  if (counts.some(c => c < 2)) return null

  const lda = fisherLDATop2(rows, labels, K)
  if (!lda) return null
  return applyVectorsToW(W, lda.v1, lda.v2, undefined, K)
}

// Connectivity clustering — pulls connected nodes close together while preserving the
// overall PC-space structure. For sampled pairs that share an edge, the target distance
// is set to near-zero; all other pairs use their PC-space distance. The result clusters
// highly-interconnected regions compactly.
export async function optimizeNonlinearConnectivity(data, W, edgeIndexPairs, TOP_K_IN = TOP_K, onProgress) {
  if (!data?.nodes?.length) return null
  const K = Math.min(TOP_K_IN, data.nodes[0].pcScores?.length || 0)
  if (K < 2) return null

  const { sub, origIdx } = sampleSub(data, K)
  const m = sub.length

  const origToSampled = new Map()
  for (let i = 0; i < origIdx.length; i++) origToSampled.set(origIdx[i], i)

  const dTarget = new Float32Array(m * m)
  let meanPC = 0, pcPairs = 0
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      let s = 0
      for (let k = 0; k < K; k++) { const d = sub[i][k] - sub[j][k]; s += d * d }
      const d = Math.sqrt(s)
      dTarget[i * m + j] = d; dTarget[j * m + i] = d
      meanPC += d; pcPairs++
    }
  }
  meanPC = Math.max(meanPC / Math.max(pcPairs, 1), 1e-9)

  if (edgeIndexPairs) {
    const { pairs, count } = edgeIndexPairs
    for (let e = 0; e < count; e++) {
      const a = pairs[e * 2], b = pairs[e * 2 + 1]
      const ai = origToSampled.get(a), bi = origToSampled.get(b)
      if (ai != null && bi != null) {
        dTarget[ai * m + bi] = 0.05 * meanPC
        dTarget[bi * m + ai] = 0.05 * meanPC
      }
    }
  }

  for (let i = 0; i < dTarget.length; i++) dTarget[i] /= meanPC

  const eigs = data.pcaInfo?.eigenvalues
  let ranked
  if (Array.isArray(eigs) && eigs.length >= K) {
    ranked = eigs.slice(0, K).map((v, k) => ({ k, s: Number(v) || 0 }))
  } else {
    const variance = new Float64Array(K)
    for (let i = 0; i < m; i++) {
      for (let k = 0; k < K; k++) { const v = sub[i][k]; variance[k] += v * v }
    }
    ranked = Array.from(variance).map((s, k) => ({ k, s }))
  }
  ranked.sort((a, b) => b.s - a.s)

  return runStressSGD(W, sub, K, dTarget, initAxisAlignedV(K, ranked[0].k, ranked[1].k), false, onProgress)
}

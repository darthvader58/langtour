// Web Worker: SGD stress-minimization loop. The main thread builds the inputs (sub,
// dTarget, V0, V1) as typed arrays, transfers them here, and gets back the final V
// rows plus a loss history. No React, no DOM — pure math.
//
// Message contract (request ID multiplexes concurrent calls, though we only ever fire
// one at a time in practice):
//
//   main → worker
//     { type: 'sgd', requestId, m, K, sub, dTarget, V0, V1,
//       iters, lr, samplesPerIter, minIters, patience, improveTol,
//       dlFloor, coefClip, freezeV0, progressEvery }
//
//   worker → main (streaming)
//     { type: 'progress', requestId, iter, loss }
//
//   worker → main (terminal)
//     { type: 'done', requestId, V0, V1, lossHistory }

// Long-lived worker state. The main thread sends 'init' once per data load with the
// packed pcScores; subsequent focusSim / isolateFocus calls reference this cached
// buffer so we don't transfer megabytes of pcScores on every focus change.
let CACHED = null // { pc: Float32Array, N, K }

self.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    CACHED = { pc: new Float32Array(msg.pc), N: msg.N, K: msg.K }
    self.postMessage({ type: 'done', requestId: msg.requestId })
    return
  }
  if (msg.type === 'focusSim') { handleFocusSim(msg); return }
  if (msg.type === 'isolateFocus') { handleIsolateFocus(msg); return }
  if (msg.type === 'cosineSims') { handleCosineSims(msg); return }
  if (msg.type === 'colorize') { handleColorize(msg); return }
  if (msg.type !== 'sgd') return
  const {
    requestId, m, K,
    sub, dTarget, V0: V0buf, V1: V1buf, V2: V2buf,
    iters = 200, lr = 0.02, samplesPerIter = 1500,
    minIters = 20, patience = 15, improveTol = 0.001,
    dlFloor = 1e-9, coefClip = Infinity, freezeV0 = false,
    progressEvery = 5,
  } = msg

  const V0 = new Float32Array(V0buf)
  const V1 = new Float32Array(V1buf)
  const dT = new Float32Array(dTarget)
  const SUB = new Float32Array(sub) // flat m·K

  const use3D = V2buf != null && V2buf.byteLength > 0
  const V2 = use3D ? new Float32Array(V2buf) : null

  const pcAt = (i, k) => SUB[i * K + k]

  const lossHistory = []
  let bestLoss = Infinity
  let stagnantIters = 0

  for (let iter = 0; iter < iters; iter++) {
    const g0 = new Float64Array(K)
    const g1 = new Float64Array(K)
    const g2 = use3D ? new Float64Array(K) : null
    for (let s = 0; s < samplesPerIter; s++) {
      const i = Math.floor(Math.random() * m)
      const j = Math.floor(Math.random() * m)
      if (i === j) continue
      const dh = dT[i * m + j]
      if (dh < 0) continue
      let vx = 0, vy = 0, vz = 0
      for (let k = 0; k < K; k++) {
        const dxk = pcAt(i, k) - pcAt(j, k)
        vx += V0[k] * dxk
        vy += V1[k] * dxk
        if (use3D) vz += V2[k] * dxk
      }
      const dlRaw = Math.sqrt(vx * vx + vy * vy + (use3D ? vz * vz : 0))
      const dl = Math.max(dlRaw, dlFloor)
      const err = dl - dh
      let coef = (2 * err) / dl
      if (coef > coefClip) coef = coefClip
      else if (coef < -coefClip) coef = -coefClip
      if (!freezeV0) {
        for (let k = 0; k < K; k++) {
          const dxk = pcAt(i, k) - pcAt(j, k)
          g0[k] += coef * vx * dxk
        }
      }
      for (let k = 0; k < K; k++) {
        const dxk = pcAt(i, k) - pcAt(j, k)
        g1[k] += coef * vy * dxk
      }
      if (use3D) {
        for (let k = 0; k < K; k++) {
          const dxk = pcAt(i, k) - pcAt(j, k)
          g2[k] += coef * vz * dxk
        }
      }
    }
    const scale = lr / samplesPerIter
    if (!freezeV0) {
      for (let k = 0; k < K; k++) {
        const delta = scale * g0[k]
        if (Number.isFinite(delta)) V0[k] -= delta
      }
    }
    for (let k = 0; k < K; k++) {
      const delta = scale * g1[k]
      if (Number.isFinite(delta)) V1[k] -= delta
    }
    if (use3D) {
      for (let k = 0; k < K; k++) {
        const delta = scale * g2[k]
        if (Number.isFinite(delta)) V2[k] -= delta
      }
    }

    // End-of-iter loss probe on a 500-pair subsample.
    let lossSum = 0, lossN = 0
    for (let s = 0; s < 500; s++) {
      const i = Math.floor(Math.random() * m)
      const j = Math.floor(Math.random() * m)
      if (i === j) continue
      const dh = dT[i * m + j]
      if (dh < 0) continue
      let vx = 0, vy = 0, vz = 0
      for (let k = 0; k < K; k++) {
        const dxk = pcAt(i, k) - pcAt(j, k)
        vx += V0[k] * dxk
        vy += V1[k] * dxk
        if (use3D) vz += V2[k] * dxk
      }
      const dl = Math.sqrt(vx * vx + vy * vy + (use3D ? vz * vz : 0))
      const err = dl - dh
      lossSum += err * err
      lossN++
    }
    const batchLoss = lossN > 0 ? lossSum / lossN : 0
    lossHistory.push(batchLoss)

    if (iter % progressEvery === 0) {
      const v0snap = new Float32Array(V0)
      const v1snap = new Float32Array(V1)
      if (use3D) {
        const v2snap = new Float32Array(V2)
        self.postMessage(
          { type: 'progress', requestId, iter, loss: batchLoss, V0: v0snap.buffer, V1: v1snap.buffer, V2: v2snap.buffer },
          [v0snap.buffer, v1snap.buffer, v2snap.buffer],
        )
      } else {
        self.postMessage(
          { type: 'progress', requestId, iter, loss: batchLoss, V0: v0snap.buffer, V1: v1snap.buffer },
          [v0snap.buffer, v1snap.buffer],
        )
      }
    }

    if (iter >= minIters) {
      if (batchLoss < bestLoss * (1 - improveTol)) {
        bestLoss = batchLoss
        stagnantIters = 0
      } else {
        stagnantIters++
        if (stagnantIters >= patience) break
      }
    } else {
      bestLoss = Math.min(bestLoss, batchLoss)
    }
  }

  const outV0 = V0.buffer
  const outV1 = V1.buffer
  const outLoss = new Float32Array(lossHistory).buffer
  if (use3D) {
    const outV2 = V2.buffer
    self.postMessage({ type: 'done', requestId, V0: outV0, V1: outV1, V2: outV2, lossHistory: outLoss },
      [outV0, outV1, outV2, outLoss])
  } else {
    self.postMessage({ type: 'done', requestId, V0: outV0, V1: outV1, lossHistory: outLoss },
      [outV0, outV1, outLoss])
  }
}

// focusSim: for the given focus index, return sims[i] = −‖pc_i − pc_focus‖ as a
// Float32Array of length N. Runs against the cached pcScores so main thread only
// sends { focusIdx }. O(N·K) — was the main blocker on focus change.
function handleFocusSim(msg) {
  if (!CACHED) {
    self.postMessage({ type: 'error', requestId: msg.requestId, error: 'worker not initialized' })
    return
  }
  const { pc, N, K } = CACHED
  const { requestId, focusIdx } = msg
  const sims = new Float32Array(N)
  const base = focusIdx * K
  for (let i = 0; i < N; i++) {
    const row = i * K
    let s = 0
    for (let k = 0; k < K; k++) {
      const d = pc[base + k] - pc[row + k]
      s += d * d
    }
    sims[i] = -Math.sqrt(s)
  }
  self.postMessage({ type: 'done', requestId, sims: sims.buffer }, [sims.buffer])
}

// isolateFocus: returns v0 (OLS regression of −distance-to-focus onto pcScores) and
// v1 (highest-variance PC orthogonal to v0). Mirrors the optimizeIsolateFocus core
// that used to run on the main thread — 4 passes of O(N·K), which freezes the UI
// at N=10k·K=384.
function handleIsolateFocus(msg) {
  if (!CACHED) {
    self.postMessage({ type: 'error', requestId: msg.requestId, error: 'worker not initialized' })
    return
  }
  const { pc, N, K } = CACHED
  const { requestId, focusIdx } = msg
  const focusBase = focusIdx * K

  // Pass 1: sim[i] = −‖pc_i − pc_focus‖, plus running sums for means.
  const sim = new Float64Array(N)
  const muPc = new Float64Array(K)
  let muSim = 0
  for (let i = 0; i < N; i++) {
    const row = i * K
    let s = 0
    for (let k = 0; k < K; k++) {
      const d = pc[row + k] - pc[focusBase + k]
      s += d * d
      muPc[k] += pc[row + k]
    }
    sim[i] = -Math.sqrt(s)
    muSim += sim[i]
  }
  for (let k = 0; k < K; k++) muPc[k] /= N
  muSim /= N

  // Pass 2: v0 ∝ Σ (pc_i − μ_pc) · (sim_i − μ_sim). Centre both, accumulate.
  const v0 = new Float64Array(K)
  for (let i = 0; i < N; i++) {
    const row = i * K
    const ds = sim[i] - muSim
    for (let k = 0; k < K; k++) v0[k] += (pc[row + k] - muPc[k]) * ds
  }
  let n0 = 0
  for (let k = 0; k < K; k++) n0 += v0[k] * v0[k]
  n0 = Math.sqrt(n0) || 1
  for (let k = 0; k < K; k++) v0[k] /= n0

  // Pass 3: per-PC variance.
  const variance = new Float64Array(K)
  for (let i = 0; i < N; i++) {
    const row = i * K
    for (let k = 0; k < K; k++) {
      const d = pc[row + k] - muPc[k]
      variance[k] += d * d
    }
  }

  // Pick highest-variance PC direction not too aligned with v0, then Gram-Schmidt.
  const pcOrder = Array.from({ length: K }, (_, i) => i).sort((a, b) => variance[b] - variance[a])
  let pickK = pcOrder[0]
  for (const k of pcOrder) {
    if (Math.abs(v0[k]) < 0.9) { pickK = k; break }
  }
  const v1 = new Float64Array(K)
  v1[pickK] = 1
  let dot = 0
  for (let k = 0; k < K; k++) dot += v0[k] * v1[k]
  for (let k = 0; k < K; k++) v1[k] -= dot * v0[k]
  let n1 = 0
  for (let k = 0; k < K; k++) n1 += v1[k] * v1[k]
  n1 = Math.sqrt(n1) || 1
  for (let k = 0; k < K; k++) v1[k] /= n1

  // Transfer back as Float32 (compact + matches downstream axisFromVectors).
  const out0 = Float32Array.from(v0)
  const out1 = Float32Array.from(v1)
  self.postMessage(
    { type: 'done', requestId, v0: out0.buffer, v1: out1.buffer },
    [out0.buffer, out1.buffer],
  )
}

// cosineSims: cosine similarity of focus against every node, returned pre-sorted
// descending. ExploreTask's neighbor useMemo used to do this on main thread (O(N·K)
// + O(N log N) sort), which at N=10k·K=384 was the main freeze on focus change.
function handleCosineSims(msg) {
  if (!CACHED) {
    self.postMessage({ type: 'error', requestId: msg.requestId, error: 'worker not initialized' })
    return
  }
  const { pc, N, K } = CACHED
  const { requestId, focusIdx } = msg
  const focusBase = focusIdx * K

  // Precompute focus norm + every row's norm. Two passes: norms first, then sims.
  // Cache per-node norms so a second focus change doesn't recompute them — but the
  // worker is stateless per-call except for CACHED, so recompute each call is fine
  // (it's O(N·K), same as the sim loop — cost dominates either way).
  let focusNorm = 0
  for (let k = 0; k < K; k++) { const v = pc[focusBase + k]; focusNorm += v * v }
  focusNorm = Math.sqrt(focusNorm) || 1

  const sims = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const row = i * K
    let dot = 0, nsq = 0
    for (let k = 0; k < K; k++) {
      const a = pc[focusBase + k]
      const b = pc[row + k]
      dot += a * b
      nsq += b * b
    }
    const norm = Math.sqrt(nsq) || 1
    sims[i] = dot / (focusNorm * norm)
  }

  // Sort indices by sim descending, then trim to the top-K since the consumer (Explore
  // task's mnemonic-anchor + nearby-unknown filters) only needs the closest neighbors.
  // Sending the full N=10k sorted list back forced the main thread to allocate a 10k
  // object array per click — now 500 at most.
  const entries = new Array(N)
  for (let i = 0; i < N; i++) entries[i] = [i, sims[i]]
  entries.sort((a, b) => b[1] - a[1])
  const TOP = Math.min(500, N)
  const sortedIdx = new Uint32Array(TOP)
  const sortedSims = new Float32Array(TOP)
  for (let i = 0; i < TOP; i++) { sortedIdx[i] = entries[i][0]; sortedSims[i] = entries[i][1] }

  self.postMessage(
    { type: 'done', requestId, sortedIdx: sortedIdx.buffer, sortedSims: sortedSims.buffer },
    [sortedIdx.buffer, sortedSims.buffer],
  )
}

// Viridis palette. Keep in sync with VIRIDIS_STOPS in utils/colormap.js.
const VIRIDIS = new Float32Array([
  0.0,   68/255,   1/255,  84/255,
  0.25,  59/255,  82/255, 139/255,
  0.5,   33/255, 144/255, 141/255,
  0.75,  94/255, 201/255,  98/255,
  1.0,  253/255, 231/255,  37/255,
])
const DEFAULT_RGB = [0x60/255, 0xa5/255, 0xfa/255] // matches DEFAULT_POINT_COLOR

// colorize: given a Float32Array(N) of per-node metric values plus a (lo, hi) range
// or `diverging=true`, emit a Float32Array(N*3) of RGB for direct upload to WebGL.
// This replaces the main-thread 10k-point loop that called gradientColor (string
// allocation) + parseColor (regex) for every node on every color-invalidating change.
function handleColorize(msg) {
  const { requestId, values: valBuf, lo, hi, diverging } = msg
  const vals = new Float32Array(valBuf)
  const N = vals.length
  const out = new Float32Array(N * 3)
  const span = Math.max(hi - lo, 1e-9)
  for (let i = 0; i < N; i++) {
    const v = vals[i]
    if (!Number.isFinite(v)) {
      out[i * 3] = DEFAULT_RGB[0]; out[i * 3 + 1] = DEFAULT_RGB[1]; out[i * 3 + 2] = DEFAULT_RGB[2]
      continue
    }
    if (diverging) {
      // Input already normalized to [-1, 1]. grey → red for positive, grey → blue for negative.
      const u = Math.max(-1, Math.min(1, v))
      if (u >= 0) {
        out[i * 3]     = (220 + u * 35)  / 255
        out[i * 3 + 1] = (220 - u * 160) / 255
        out[i * 3 + 2] = (220 - u * 160) / 255
      } else {
        const a = -u
        out[i * 3]     = (220 - a * 160) / 255
        out[i * 3 + 1] = (220 - a * 160) / 255
        out[i * 3 + 2] = (220 + a * 35)  / 255
      }
      continue
    }
    // Sequential viridis gradient.
    const u = Math.max(0, Math.min(1, (v - lo) / span))
    let r = VIRIDIS[16 + 1], g = VIRIDIS[16 + 2], b = VIRIDIS[16 + 3] // last stop
    for (let s = 0; s < 4; s++) {
      const t0 = VIRIDIS[s * 4], t1 = VIRIDIS[(s + 1) * 4]
      if (u <= t1) {
        const a = (u - t0) / Math.max(t1 - t0, 1e-9)
        r = VIRIDIS[s * 4 + 1]     + a * (VIRIDIS[(s + 1) * 4 + 1] - VIRIDIS[s * 4 + 1])
        g = VIRIDIS[s * 4 + 2]     + a * (VIRIDIS[(s + 1) * 4 + 2] - VIRIDIS[s * 4 + 2])
        b = VIRIDIS[s * 4 + 3]     + a * (VIRIDIS[(s + 1) * 4 + 3] - VIRIDIS[s * 4 + 3])
        break
      }
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b
  }
  self.postMessage({ type: 'done', requestId, colors: out.buffer }, [out.buffer])
}

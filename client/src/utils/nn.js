// Tiny MLP for detecting nonlinear patterns in the embedding. Pure JS — no deps, no
// web worker. Two hidden layers, tanh activation, linear output, Adam optimizer, MSE
// loss. Trains in ≤1s on the sizes we use (≤8000 rows × 8–16 features, ≤200 epochs).
//
// Used by NNProbes: train(X, y) for each metric, compare held-out R² to the linear
// baseline to expose nonlinear dependence.

// Deterministic PRNG (mulberry32) so repeated training runs from the same seed produce
// the same weights. Matters for the "gap" being reproducible across re-renders.
export function makeRng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Glorot-uniform init for a [fanIn, fanOut] weight matrix.
function initMatrix(fanIn, fanOut, rng) {
  const lim = Math.sqrt(6 / (fanIn + fanOut))
  const W = new Array(fanIn)
  for (let i = 0; i < fanIn; i++) {
    W[i] = new Array(fanOut)
    for (let j = 0; j < fanOut; j++) W[i][j] = (rng() * 2 - 1) * lim
  }
  return W
}
function zeros(n) { return new Array(n).fill(0) }
function zerosMat(r, c) { return Array.from({ length: r }, () => zeros(c)) }

// Single forward pass for one sample. Returns { h1, h2, out } with pre-activations saved
// so backward can reuse them.
function forwardSample(net, x) {
  const { W1, b1, W2, b2, W3, b3 } = net
  const H1 = net.H1, H2 = net.H2, D = net.D
  const z1 = zeros(H1)
  for (let j = 0; j < H1; j++) {
    let s = b1[j]
    for (let i = 0; i < D; i++) s += x[i] * W1[i][j]
    z1[j] = s
  }
  const a1 = z1.map(Math.tanh)
  const z2 = zeros(H2)
  for (let j = 0; j < H2; j++) {
    let s = b2[j]
    for (let i = 0; i < H1; i++) s += a1[i] * W2[i][j]
    z2[j] = s
  }
  const a2 = z2.map(Math.tanh)
  let out = b3[0]
  for (let i = 0; i < H2; i++) out += a2[i] * W3[i][0]
  return { z1, a1, z2, a2, out }
}

// Create an MLP: D inputs → H1 → H2 → 1. Returns a plain object holding weights,
// hyperparameters, and Adam state. `predict`, `fit`, and `r2` operate on this object.
export function createMLP({ inputDim, hidden1 = 16, hidden2 = 8, seed = 1 } = {}) {
  const rng = makeRng(seed)
  const W1 = initMatrix(inputDim, hidden1, rng)
  const W2 = initMatrix(hidden1, hidden2, rng)
  const W3 = initMatrix(hidden2, 1, rng)
  const b1 = zeros(hidden1), b2 = zeros(hidden2), b3 = zeros(1)
  // Adam moments (zero-init). Same shape as their param tensors.
  return {
    D: inputDim, H1: hidden1, H2: hidden2,
    W1, b1, W2, b2, W3, b3,
    mW1: zerosMat(inputDim, hidden1), vW1: zerosMat(inputDim, hidden1), mb1: zeros(hidden1), vb1: zeros(hidden1),
    mW2: zerosMat(hidden1, hidden2), vW2: zerosMat(hidden1, hidden2), mb2: zeros(hidden2), vb2: zeros(hidden2),
    mW3: zerosMat(hidden2, 1), vW3: zerosMat(hidden2, 1), mb3: zeros(1), vb3: zeros(1),
    t: 0,
  }
}

export function predict(net, x) { return forwardSample(net, x).out }
export function predictAll(net, X) { return X.map(x => predict(net, x)) }

// Single Adam step on one sample. Accumulates gradient into temporary arrays returned —
// caller may average before stepping or step per-sample (SGD). We go per-sample for
// simplicity.
function adamUpdate(param, m, v, g, t, { lr, beta1, beta2, eps }) {
  m = beta1 * m + (1 - beta1) * g
  v = beta2 * v + (1 - beta2) * g * g
  const mHat = m / (1 - Math.pow(beta1, t))
  const vHat = v / (1 - Math.pow(beta2, t))
  const newParam = param - lr * mHat / (Math.sqrt(vHat) + eps)
  return { param: newParam, m, v }
}

// One SGD (via Adam) step on a single (x, y) pair. Returns loss.
export function stepOne(net, x, y, opts) {
  const { z1, a1, z2, a2, out } = forwardSample(net, x)
  const err = out - y
  const loss = 0.5 * err * err
  net.t += 1

  // dL/d_out = err
  // Output layer grads
  for (let i = 0; i < net.H2; i++) {
    const g = err * a2[i]
    const u = adamUpdate(net.W3[i][0], net.mW3[i][0], net.vW3[i][0], g, net.t, opts)
    net.W3[i][0] = u.param; net.mW3[i][0] = u.m; net.vW3[i][0] = u.v
  }
  {
    const gb = err
    const u = adamUpdate(net.b3[0], net.mb3[0], net.vb3[0], gb, net.t, opts)
    net.b3[0] = u.param; net.mb3[0] = u.m; net.vb3[0] = u.v
  }

  // dL/d_a2 = err * W3   →   dL/d_z2 = dL/d_a2 * (1 - a2²)
  const dz2 = zeros(net.H2)
  for (let i = 0; i < net.H2; i++) dz2[i] = err * net.W3[i][0] * (1 - a2[i] * a2[i])
  // Hidden layer 2 grads
  for (let i = 0; i < net.H1; i++) {
    for (let j = 0; j < net.H2; j++) {
      const g = a1[i] * dz2[j]
      const u = adamUpdate(net.W2[i][j], net.mW2[i][j], net.vW2[i][j], g, net.t, opts)
      net.W2[i][j] = u.param; net.mW2[i][j] = u.m; net.vW2[i][j] = u.v
    }
  }
  for (let j = 0; j < net.H2; j++) {
    const u = adamUpdate(net.b2[j], net.mb2[j], net.vb2[j], dz2[j], net.t, opts)
    net.b2[j] = u.param; net.mb2[j] = u.m; net.vb2[j] = u.v
  }

  // dL/d_a1 = sum_j dz2[j] * W2[i][j]   →   dL/d_z1 = (1 - a1²) * dL/d_a1
  const dz1 = zeros(net.H1)
  for (let i = 0; i < net.H1; i++) {
    let s = 0
    for (let j = 0; j < net.H2; j++) s += dz2[j] * net.W2[i][j]
    dz1[i] = s * (1 - a1[i] * a1[i])
  }
  for (let i = 0; i < net.D; i++) {
    for (let j = 0; j < net.H1; j++) {
      const g = x[i] * dz1[j]
      const u = adamUpdate(net.W1[i][j], net.mW1[i][j], net.vW1[i][j], g, net.t, opts)
      net.W1[i][j] = u.param; net.mW1[i][j] = u.m; net.vW1[i][j] = u.v
    }
  }
  for (let j = 0; j < net.H1; j++) {
    const u = adamUpdate(net.b1[j], net.mb1[j], net.vb1[j], dz1[j], net.t, opts)
    net.b1[j] = u.param; net.mb1[j] = u.m; net.vb1[j] = u.v
  }

  return loss
}

// Fit on (X, y). Shuffles indices per epoch. Returns the final train + validation R² if
// a split is provided. Standardizes y internally so a constant target doesn't require
// weight-tuning (subtract mean, divide by std). `onEpoch(epoch, trainR2, valR2)` is
// optional and called synchronously; callers can yield to the browser there.
export function fit(net, X, y, {
  epochs = 100, lr = 0.02, beta1 = 0.9, beta2 = 0.999, eps = 1e-8,
  valFrac = 0.2, seed = 42, onEpoch = null,
} = {}) {
  const n = X.length
  if (!n) return { trainR2: 0, valR2: 0, yMean: 0, yStd: 1 }

  // Standardize y so the loss surface is the same regardless of metric scale.
  let yMean = 0; for (const v of y) yMean += v; yMean /= n
  let yStd = 0; for (const v of y) yStd += (v - yMean) ** 2
  yStd = Math.sqrt(yStd / n) || 1
  const yNorm = y.map(v => (v - yMean) / yStd)

  // Deterministic 80/20 split by shuffling indices with the provided seed.
  const rng = makeRng(seed)
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t
  }
  const valCount = Math.max(1, Math.floor(n * valFrac))
  const valIdx = idx.slice(0, valCount)
  const trainIdx = idx.slice(valCount)
  const opts = { lr, beta1, beta2, eps }

  for (let ep = 0; ep < epochs; ep++) {
    // Shuffle training indices each epoch.
    for (let i = trainIdx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const t = trainIdx[i]; trainIdx[i] = trainIdx[j]; trainIdx[j] = t
    }
    for (const i of trainIdx) stepOne(net, X[i], yNorm[i], opts)
    if (onEpoch) {
      const tr = r2OnIndices(net, X, yNorm, trainIdx)
      const va = r2OnIndices(net, X, yNorm, valIdx)
      onEpoch(ep, tr, va)
    }
  }

  const trainR2 = r2OnIndices(net, X, yNorm, trainIdx)
  const valR2 = r2OnIndices(net, X, yNorm, valIdx)
  return { trainR2, valR2, yMean, yStd, trainIdx, valIdx, yNorm }
}

function r2OnIndices(net, X, yNorm, idx) {
  if (!idx.length) return 0
  let ssRes = 0, ssTot = 0
  let mean = 0; for (const i of idx) mean += yNorm[i]; mean /= idx.length
  for (const i of idx) {
    const pred = predict(net, X[i])
    ssRes += (yNorm[i] - pred) ** 2
    ssTot += (yNorm[i] - mean) ** 2
  }
  return ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0
}

// Predicted-vs-actual pairs on a subset (usually the validation indices) in ORIGINAL
// y-space. Caller needs the (yMean, yStd) returned by fit to de-normalize.
export function predictedVsActual(net, X, y, idx, yMean, yStd) {
  return idx.map(i => ({
    idx: i,
    actual: y[i],
    predicted: predict(net, X[i]) * yStd + yMean,
  }))
}

// Standardize feature columns (z-score) — MLPs converge much faster with zero-mean unit-
// variance inputs. Returns the normalized X plus the means/stds so future inputs can be
// transformed the same way.
export function standardize(X) {
  if (!X.length) return { Xn: [], mean: [], std: [] }
  const D = X[0].length
  const mean = zeros(D), std = zeros(D)
  for (const row of X) for (let i = 0; i < D; i++) mean[i] += row[i]
  for (let i = 0; i < D; i++) mean[i] /= X.length
  for (const row of X) for (let i = 0; i < D; i++) std[i] += (row[i] - mean[i]) ** 2
  for (let i = 0; i < D; i++) std[i] = Math.sqrt(std[i] / X.length) || 1
  const Xn = X.map(row => row.map((v, i) => (v - mean[i]) / std[i]))
  return { Xn, mean, std }
}

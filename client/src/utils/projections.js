// Client-side projection helpers. Extracted from GraphView.jsx so tasks (Review, Explore,
// Hubs) can call them independently and so we can write focused tests.
//
// The big one is fisherLDATop2: given per-point scores and integer class labels, find the
// top-2 discriminant directions via the classical Fisher procedure (Cholesky whitening +
// subspace iteration). Small helpers below it do Cholesky, triangular inverse, power
// iteration, etc. — all tiny and trivially testable.

export function zeros(m, n) {
  return Array.from({ length: m }, () => new Array(n).fill(0))
}

export function matMul(A, B) {
  const m = A.length, p = A[0].length, q = B[0].length
  const out = zeros(m, q)
  for (let i = 0; i < m; i++) for (let k = 0; k < p; k++) {
    const a = A[i][k]
    if (a === 0) continue
    for (let j = 0; j < q; j++) out[i][j] += a * B[k][j]
  }
  return out
}

export function matVec(A, v) {
  const m = A.length, n = v.length
  const out = new Array(m).fill(0)
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < n; j++) s += A[i][j] * v[j]; out[i] = s }
  return out
}

export function transpose(A) {
  const m = A.length, n = A[0].length
  const out = zeros(n, m)
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) out[j][i] = A[i][j]
  return out
}

// Cholesky decomposition A = L Lᵀ for symmetric positive-definite A. Returns null if A isn't
// positive definite. Used to whiten Sw before the eigen-step of Fisher's LDA.
export function cholesky(A) {
  const n = A.length
  const L = zeros(n, n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k]
      if (i === j) {
        const v = A[i][i] - sum
        if (v <= 0) return null
        L[i][i] = Math.sqrt(v)
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j]
      }
    }
  }
  return L
}

// Invert a lower-triangular matrix in O(n²) by forward-substituting each column. The
// returned matrix is also lower-triangular.
export function invertLowerTriangular(L) {
  const n = L.length
  const inv = zeros(n, n)
  for (let i = 0; i < n; i++) {
    inv[i][i] = 1 / L[i][i]
    for (let j = 0; j < i; j++) {
      let sum = 0
      for (let k = j; k < i; k++) sum += L[i][k] * inv[k][j]
      inv[i][j] = -sum / L[i][i]
    }
  }
  return inv
}

function randomUnit(n, rng = Math.random) {
  const v = new Array(n)
  for (let i = 0; i < n; i++) v[i] = rng() - 0.5
  normalize(v)
  return v
}
function normalize(v) {
  let nm = 0
  for (const x of v) nm += x * x
  nm = Math.sqrt(nm)
  if (nm < 1e-14) return
  for (let i = 0; i < v.length; i++) v[i] /= nm
}
function orthogonalize(v, u) {
  let dot = 0
  for (let i = 0; i < v.length; i++) dot += v[i] * u[i]
  for (let i = 0; i < v.length; i++) v[i] -= dot * u[i]
}
function orthoNormalize2(a, b) {
  normalize(a)
  orthogonalize(b, a)
  normalize(b)
}
function rayleigh(M, v) {
  let num = 0
  for (let i = 0; i < v.length; i++) {
    let s = 0
    for (let j = 0; j < v.length; j++) s += M[i][j] * v[j]
    num += v[i] * s
  }
  return num
}

// Find the top-2 eigenvectors of a symmetric matrix via subspace iteration. Keeps both
// vectors orthonormal at every step so the second converges to the second eigenvector, not
// a rotation of the first. Good enough for the small (K ≤ 32) matrices used in LDA.
export function symmetricTop2(M, n, { maxIter = 400, rng = Math.random } = {}) {
  let y1 = randomUnit(n, rng)
  let y2 = randomUnit(n, rng)
  orthoNormalize2(y1, y2)
  for (let iter = 0; iter < maxIter; iter++) {
    const ny1 = matVec(M, y1)
    const ny2 = matVec(M, y2)
    normalize(ny1)
    orthogonalize(ny2, ny1)
    normalize(ny2)
    let diff = 0
    for (let i = 0; i < n; i++) diff += Math.abs(ny1[i] - y1[i]) + Math.abs(ny2[i] - y2[i])
    y1 = ny1; y2 = ny2
    if (diff < 1e-10) break
  }
  const lam1 = rayleigh(M, y1)
  const lam2 = rayleigh(M, y2)
  if (lam2 > lam1) return { y1: y2, y2: y1 }
  return { y1, y2 }
}

function projVar(scores, w) {
  const n = scores.length
  if (!n) return 0
  let mean = 0
  const projs = new Array(n)
  for (let p = 0; p < n; p++) {
    let s = 0
    for (let i = 0; i < w.length; i++) s += scores[p][i] * w[i]
    projs[p] = s
    mean += s
  }
  mean /= n
  let v = 0
  for (const x of projs) v += (x - mean) ** 2
  return v / n
}

// Fisher's LDA top-2. Returns { v1, v2 } in K-dim feature space — the 2D subspace that best
// separates the given classes. Both directions are rescaled so projections onto them have
// equal variance, so the visual 2D cloud doesn't collapse onto one axis when one eigenvalue
// dominates.
export function fisherLDATop2(scores, labels, K) {
  const n = scores.length
  if (n < 2 || K < 1) return null

  const clusterMeans = new Map()
  const clusterCounts = new Map()
  const mu = new Array(K).fill(0)
  for (let p = 0; p < n; p++) {
    const c = labels[p]
    if (!clusterMeans.has(c)) clusterMeans.set(c, new Array(K).fill(0))
    const m = clusterMeans.get(c)
    for (let i = 0; i < K; i++) { m[i] += scores[p][i]; mu[i] += scores[p][i] }
    clusterCounts.set(c, (clusterCounts.get(c) || 0) + 1)
  }
  for (let i = 0; i < K; i++) mu[i] /= n
  for (const [c, m] of clusterMeans) {
    const cnt = clusterCounts.get(c)
    for (let i = 0; i < K; i++) m[i] /= cnt
  }

  const SB = zeros(K, K)
  for (const [c, m] of clusterMeans) {
    const cnt = clusterCounts.get(c)
    const diff = new Array(K)
    for (let i = 0; i < K; i++) diff[i] = m[i] - mu[i]
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) SB[i][j] += cnt * diff[i] * diff[j]
  }
  const SW = zeros(K, K)
  for (let p = 0; p < n; p++) {
    const c = labels[p]
    const m = clusterMeans.get(c)
    const diff = new Array(K)
    for (let i = 0; i < K; i++) diff[i] = scores[p][i] - m[i]
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) SW[i][j] += diff[i] * diff[j]
  }

  let trSW = 0
  for (let i = 0; i < K; i++) trSW += SW[i][i]
  const eps = Math.max(trSW * 1e-5, 1e-10)
  for (let i = 0; i < K; i++) SW[i][i] += eps

  const L = cholesky(SW)
  if (!L) return null
  const Linv = invertLowerTriangular(L)
  const LinvT = transpose(Linv)
  const M = matMul(matMul(Linv, SB), LinvT) // symmetric

  const { y1, y2 } = symmetricTop2(M, K)
  if (!y1 || !y2) return null

  let w1 = matVec(LinvT, y1)
  let w2 = matVec(LinvT, y2)

  const var1 = projVar(scores, w1)
  const var2 = projVar(scores, w2)
  if (var1 > 0) { const s = 1 / Math.sqrt(var1); for (let i = 0; i < K; i++) w1[i] *= s }
  if (var2 > 0) { const s = 1 / Math.sqrt(var2); for (let i = 0; i < K; i++) w2[i] *= s }

  return { v1: w1, v2: w2 }
}

// Convenience: given the 2×K projection stored as (v0, v1), extract per-axis (mag, angle)
// and rescale the max magnitude to 1 so the AxisPad knobs land in-range.
export function axesFromVectors(v0, v1, K) {
  const mags = new Array(K).fill(0)
  const angles = new Array(K).fill(0)
  let maxMag = 0
  for (let k = 0; k < K; k++) {
    const m = Math.hypot(v0[k], v1[k])
    if (m > maxMag) maxMag = m
    mags[k] = m
    angles[k] = Math.atan2(v1[k], v0[k])
  }
  if (maxMag > 0) for (let k = 0; k < K; k++) mags[k] /= maxMag
  return { mags, angles }
}

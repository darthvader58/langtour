// Statistical helpers for the Analyze task. Pure functions — arrays in, numbers out. Used
// by the metric correlation heatmap, linear-probe R² scoreboard, and PC extreme-word
// inspector. All helpers tolerate NaN / missing by filtering paired entries.

// Pair two arrays, dropping any index where either value isn't finite. Most of the other
// helpers start with this step so they don't have to repeat the NaN handling.
export function pairFinite(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  const px = [], py = []
  for (let i = 0; i < n; i++) {
    const a = xs[i], b = ys[i]
    if (Number.isFinite(a) && Number.isFinite(b)) { px.push(a); py.push(b) }
  }
  return [px, py]
}

export function mean(xs) {
  if (!xs.length) return 0
  let s = 0; for (const v of xs) s += v
  return s / xs.length
}

export function variance(xs, m = mean(xs)) {
  if (xs.length < 2) return 0
  let s = 0; for (const v of xs) { const d = v - m; s += d * d }
  return s / (xs.length - 1)
}

// Pearson product-moment correlation. Returns 0 when either column is constant (std = 0)
// rather than NaN; callers display this as "no linear relationship".
export function pearson(xs, ys) {
  const [px, py] = pairFinite(xs, ys)
  if (px.length < 2) return 0
  const mx = mean(px), my = mean(py)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < px.length; i++) {
    const a = px[i] - mx, b = py[i] - my
    num += a * b; dx += a * a; dy += b * b
  }
  const denom = Math.sqrt(dx * dy)
  return denom > 0 ? num / denom : 0
}

// Spearman rank correlation — Pearson applied to rank vectors. Useful as a nonlinear
// sanity check: if Pearson is 0 but Spearman is high, the relationship is monotonic but
// not linear.
export function spearman(xs, ys) {
  const [px, py] = pairFinite(xs, ys)
  if (px.length < 2) return 0
  return pearson(ranks(px), ranks(py))
}

// Average-rank transform (handles ties by averaging). Foundation for Spearman.
export function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const r = new Array(xs.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1 // 1-based ranks
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}

// Pairwise Pearson matrix over an array of columns (each column is a number[]). Returns
// a 2D array [i][j] = correlation(columns[i], columns[j]). Diagonal is always 1.
export function correlationMatrix(columns) {
  const k = columns.length
  const M = Array.from({ length: k }, () => new Array(k).fill(0))
  for (let i = 0; i < k; i++) {
    M[i][i] = 1
    for (let j = i + 1; j < k; j++) {
      const c = pearson(columns[i], columns[j])
      M[i][j] = c; M[j][i] = c
    }
  }
  return M
}

// R² for a least-squares linear regression of y on a single feature x. Equivalent to
// pearson(x,y)² — included as a named helper so the Analyze panel can label it honestly.
export function linearR2(xs, ys) {
  const c = pearson(xs, ys)
  return c * c
}

// Multivariate ridge regression: find β minimizing ||y - Xβ||² + λ||β||². Returns
// coefficients and the in-sample R². Ridge (λ > 0) so a near-singular X (collinear PCs)
// doesn't blow up. Solves (XᵀX + λI)β = Xᵀy by Gauss-Jordan on the augmented system —
// fine for the small k (≤32 PCs) we use here.
export function ridgeRegression(X, y, lambda = 0.01) {
  const n = X.length
  if (!n) return { coef: [], r2: 0 }
  const k = X[0].length
  // XᵀX + λI
  const A = Array.from({ length: k }, () => new Array(k).fill(0))
  const b = new Array(k).fill(0)
  for (let i = 0; i < n; i++) {
    const row = X[i]; const yi = y[i]
    if (!Number.isFinite(yi)) continue
    for (let a = 0; a < k; a++) {
      if (!Number.isFinite(row[a])) continue
      b[a] += row[a] * yi
      for (let c = a; c < k; c++) {
        if (!Number.isFinite(row[c])) continue
        A[a][c] += row[a] * row[c]
      }
    }
  }
  for (let a = 0; a < k; a++) {
    A[a][a] += lambda
    for (let c = a + 1; c < k; c++) A[c][a] = A[a][c]
  }
  const coef = solveLinearSystem(A, b)
  // in-sample R²
  const my = mean(y)
  let ssRes = 0, ssTot = 0
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(y[i])) continue
    let pred = 0
    for (let a = 0; a < k; a++) pred += X[i][a] * coef[a]
    const d = y[i] - pred; ssRes += d * d
    const dt = y[i] - my; ssTot += dt * dt
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
  return { coef, r2 }
}

// Gauss-Jordan elimination on a square system Ax = b. Mutates A and b. Returns x. Not
// fast, but fine for k ≤ 32.
export function solveLinearSystem(A, b) {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    if (Math.abs(M[pivot][col]) < 1e-12) continue
    if (pivot !== col) { const tmp = M[col]; M[col] = M[pivot]; M[pivot] = tmp }
    const p = M[col][col]
    for (let c = col; c <= n; c++) M[col][c] /= p
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col]
      if (f === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map(row => row[n])
}

// Top-N and bottom-N indices by score. Used to populate the PC extreme-word inspector.
// Non-finite scores sort last and are excluded from the picks.
export function topKIndices(values, k) {
  const idx = values.map((v, i) => [v, i]).filter(p => Number.isFinite(p[0]))
  idx.sort((a, b) => b[0] - a[0])
  return idx.slice(0, k).map(p => p[1])
}
export function bottomKIndices(values, k) {
  const idx = values.map((v, i) => [v, i]).filter(p => Number.isFinite(p[0]))
  idx.sort((a, b) => a[0] - b[0])
  return idx.slice(0, k).map(p => p[1])
}

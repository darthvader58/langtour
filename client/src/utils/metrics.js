// Shared per-node metric helpers. Pure functions only — no React, no DOM. The task panels
// and the color picker call these for deriving values from the raw `graphData` response.

// Milliseconds in a day (FSRS uses days, backend stores ISO timestamps).
export const DAY_MS = 24 * 60 * 60 * 1000

// FSRS retrievability: probability of recall now, given elapsed time since last review and
// card stability. Formula from the FSRS-5 reference: R = exp(ln(0.9) · t / stability)
// where t is elapsed days and stability is in days.
//
// Edge cases:
//   - No stability → treat as R = 0 (fragile, not yet reviewed).
//   - No last_review_at → treat as R = 0 (same reason).
//   - t <= 0 (reviewed in the future somehow) → R = 1 (clamp).
export function retrievability({ stability, last_review_at, now = Date.now() }) {
  if (!stability || stability <= 0) return 0
  if (!last_review_at) return 0
  const lastMs = typeof last_review_at === 'string' ? Date.parse(last_review_at) : last_review_at
  if (!Number.isFinite(lastMs)) return 0
  const elapsedDays = Math.max(0, (now - lastMs) / DAY_MS)
  if (elapsedDays === 0) return 1
  return Math.exp((Math.log(0.9) * elapsedDays) / stability)
}

// Review-priority composite: what to drill first. Higher = review sooner. Unclamped so
// the caller can rank; clients typically normalize via 5/95 percentile in `colorForNode`.
//
// Weighting rationale:
//   (1 - retrievability) — if you've already forgotten, priority spikes.
//   difficulty           — harder cards need more exposure.
//   (1 + lapses)         — leeches get a boost so they don't hide.
//
// Multiplication, not sum, so a card that's solidly-known (R high, difficulty low) can't
// gain priority from lapses alone.
export function reviewPriority({ retrievability: r = 0, difficulty = 0, lapses = 0 }) {
  return (1 - r) * difficulty * (1 + lapses)
}

// Centroid in N-dim space. Returns a plain array of length D. Used by tribe-analysis code
// and by tests that need a quick barycenter.
export function centroid(points) {
  if (!points?.length) return []
  const D = points[0].length
  const c = new Array(D).fill(0)
  for (const p of points) for (let i = 0; i < D; i++) c[i] += p[i]
  for (let i = 0; i < D; i++) c[i] /= points.length
  return c
}

// Cosine similarity for normalized vectors; equivalent to dot product. Robust against
// arrays of different lengths (takes min). Used everywhere from "why-similar" decomposition
// to neighbor listing.
export function cosine(a, b) {
  const n = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return dot
}

// Euclidean distance in N-dim. Same robustness as cosine.
export function euclid(a, b) {
  const n = Math.min(a.length, b.length)
  let s = 0
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d }
  return Math.sqrt(s)
}

// Robust min/max from a sample via percentiles. `lo`/`hi` default to 5/95 — matches the
// `colorForNode` memo in the prior GraphView so outliers don't wash out the gradient.
export function robustRange(values, { lo = 0.05, hi = 0.95 } = {}) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return { lo: 0, hi: 1 }
  const li = Math.max(0, Math.floor(sorted.length * lo))
  const hi2 = Math.min(sorted.length - 1, Math.floor(sorted.length * hi))
  return { lo: sorted[li], hi: sorted[hi2] }
}

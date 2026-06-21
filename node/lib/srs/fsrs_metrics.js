// FSRS-derived per-word learning metrics used by the graph API. Pure functions — no DB, no
// side effects. Takes values that would be pulled from `words.*` columns or review_logs
// aggregates and returns derived scores the client needs for color modes + task panels.

export const DAY_MS = 24 * 60 * 60 * 1000;

// FSRS retrievability: probability of recall now given elapsed time and stability. The
// standard FSRS-5 formula is R = exp(ln(0.9) · t_days / stability_days) — so at
// t_days = stability the word has exactly 90% recall probability, and it decays
// exponentially from there.
//
// Missing inputs all map to R = 0 (treated as unknown / fragile), which lets the client
// surface them as highest priority in the review queue.
export function retrievability({ stability, last_review_at, now = Date.now() }) {
  if (!stability || stability <= 0) return 0;
  if (last_review_at == null) return 0;
  const lastMs = typeof last_review_at === 'string' ? Date.parse(last_review_at) : last_review_at;
  if (!Number.isFinite(lastMs)) return 0;
  const elapsedDays = Math.max(0, (now - lastMs) / DAY_MS);
  if (elapsedDays === 0) return 1;
  return Math.exp((Math.log(0.9) * elapsedDays) / stability);
}

// Review-priority composite. Higher = should review sooner. Symmetric with the client-side
// helper so both sides agree on ranking if they compute it independently.
export function reviewPriority({ retrievability: r = 0, difficulty = 0, lapses = 0 }) {
  return (1 - r) * difficulty * (1 + lapses);
}

// Map FSRS integer state to readable label. Kept server-side so the API can ship both — the
// integer is easier for filters; the label is handy in tooltips.
export const FSRS_STATE_LABELS = Object.freeze({
  0: 'new',
  1: 'learning',
  2: 'review',
  3: 'relearning',
});
export function fsrsStateLabel(n) {
  return FSRS_STATE_LABELS[n] || 'unknown';
}

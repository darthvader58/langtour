// App-wide settings store, backed by localStorage. Mirrors Anki's "Deck Options"
// page style: a flat object of typed values. Anything that should persist across
// reloads lives here — at the moment that's the desired-attention threshold used
// by the Hubs panel's mastery tag, plus FSRS scaffolding for later wiring.

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'maizu.settings.v1'

// Sync dayStartHour with backend on first read.
async function syncBackendSettings() {
  try {
    const res = await fetch('/api/settings')
    if (!res.ok) return
    const data = await res.json()
    if (typeof data.dayStartHour === 'number') {
      _snapshot = { ..._snapshot, dayStartHour: data.dayStartHour }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_snapshot)) } catch {}
      emit()
    }
  } catch {
    // Backend unavailable — localStorage value wins
  }
}

export const DEFAULTS = Object.freeze({
  // Retrievability a neighbor must reach to count toward a hub's mastery %.
  // Lower = lenient (easier to score "known"), higher = stricter.
  desiredAttention: 0.7,

  // FSRS scheduling (not yet wired to the scheduler — these are just the
  // standard Anki-style knobs users expect to see here).
  desiredRetention: 0.9,    // FSRS's target probability of recall at due time
  maximumInterval: 36500,   // days — cap on FSRS-emitted intervals (~100 years)
  newCardsPerDay: 20,
  reviewsPerDay: 9999,
  learningSteps: '1m 10m',
  relearningSteps: '10m',

  // Day start hour for stats (0-23). Reviews before this hour count as the previous day.
  dayStartHour: 0,

  // FSRS-6 model weights (w0..w19 + decay exponent). Defaults are the ts-fsrs
  // library's `default_w`. The #settings page exposes an "Optimize" button that
  // hits /api/fsrs/optimize to fit these to the user's review history.
  fsrsWeights: [
    0.212,  1.2931, 2.3065, 8.2956, 6.4133,
    0.8334, 3.0194, 0.001,  1.8722, 0.1666,
    0.796,  1.4835, 0.0614, 0.2629, 1.6483,
    0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
    0.2, // FSRS-6 decay
  ],

  // Graph view display / filter defaults.
  graphNodeSize: 1,
  graphLineThickness: 1,
  graphNodeOpacity: 1,
  graphEdgeOpacity: 1,
  graphSimCutoff: null,
})

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

// Snapshot is recreated every write so useSyncExternalStore sees a new reference.
let _snapshot = readStorage()
const _subs = new Set()

// Kick off backend sync (fire-and-forget)
syncBackendSettings()

function emit() { for (const cb of _subs) cb() }

export function getSettings() { return _snapshot }

export function updateSettings(patch) {
  _snapshot = { ..._snapshot, ...patch }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_snapshot)) } catch { /* quota / private mode */ }
  emit()

  // Sync dayStartHour to backend
  if (patch.dayStartHour !== undefined) {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayStartHour: patch.dayStartHour }),
    }).catch(() => {})
  }
}

export function resetSettings() {
  _snapshot = { ...DEFAULTS }
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  emit()
}

function subscribe(cb) { _subs.add(cb); return () => _subs.delete(cb) }

export function useSettings() {
  return useSyncExternalStore(subscribe, getSettings, getSettings)
}

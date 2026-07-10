// Pure view-model mapping for GET /api/scenario/list
// (docs/contracts/scenario-list.md). Kept separate from ScenariosPage so the
// mapping — icons, per-mission progress, the completion counter, the
// country-complete trigger condition — is unit-testable without touching the
// DOM. No economy math here: `completed` / `countryComplete` are read
// straight off the server response, never derived from client state.
import { iconForSuperset } from './components/supersetIcons'

export function toMissionViewModel(entry) {
  const targetSize = entry?.targetSize ?? 0
  const usedCount = entry?.usedCount ?? 0
  // Cap in-progress bars below 100 so only a server-confirmed `completed`
  // ever shows a full bar — mirrors the growth model's own display rule.
  const progress = entry?.completed
    ? 100
    : targetSize > 0
      ? Math.min(99, Math.round((usedCount / targetSize) * 100))
      : 0

  return {
    id: entry?.scenarioId,
    title: entry?.title ?? entry?.scenarioId ?? 'Scenario',
    superset: entry?.superset ?? null,
    icon: iconForSuperset(entry?.superset),
    position: entry?.position ?? 0,
    completed: Boolean(entry?.completed),
    targetSize,
    usedCount,
    chainClosing: Boolean(entry?.chainClosing),
    progress,
  }
}

// Maps the raw /api/scenario/list response into what ScenariosPage renders:
// the ordered mission cards, the discovered-missions counter, and whether a
// "Next Mission" card should appear.
export function buildMissionListViewModel(listResponse) {
  const scenarios = Array.isArray(listResponse?.scenarios) ? listResponse.scenarios : []
  const missions = scenarios.map(toMissionViewModel)
  const completedCount = missions.filter((m) => m.completed).length

  return {
    missions,
    completedCount,
    totalCount: missions.length,
    nextAvailable: Boolean(listResponse?.nextAvailable),
    totalSituations: listResponse?.totalSituations ?? missions.length,
    countryComplete: Boolean(listResponse?.countryComplete),
  }
}

// The only gate allowed to show CompletionScreen / trigger the claim call
// (docs/contracts/scenario-list.md "Country completion"): a server-reported
// `countryComplete: true` on the list response, nothing derived client-side.
export function shouldShowCompletion(listResponse) {
  return Boolean(listResponse?.countryComplete)
}

// Thin IO wrapper around GET /api/scenario/list (docs/contracts/scenario-list.md).
// Read path only — no economy math, no client-trusted completion; the pure
// mapping/derivation logic lives in missionListModel.js so it's testable
// without mocking fetch.
import { authFetch } from './api'

export class MissionListApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message)
    this.name = 'MissionListApiError'
    this.status = status
    this.payload = payload
  }
}

export async function getMissionList({ countryCode, signal } = {}) {
  if (!countryCode) {
    throw new TypeError('countryCode is required to load the mission list')
  }

  const search = new URLSearchParams({ countryCode })
  const response = await authFetch(`/api/scenario/list?${search}`, { signal })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    // Non-JSON body (e.g. an empty response) — payload stays null.
  }

  if (!response.ok) {
    const message = payload?.error ?? `Unable to load missions (${response.status})`
    throw new MissionListApiError(message, { status: response.status, payload })
  }

  return payload
}

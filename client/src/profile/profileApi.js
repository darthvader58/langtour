import { authFetch } from '../api'

export class ProfileApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message)
    this.name = 'ProfileApiError'
    this.status = status
    this.payload = payload
  }
}

async function readProfileResponse(response) {
  const contentType = response.headers?.get?.('content-type') ?? ''
  let payload

  if (contentType.includes('application/json')) {
    payload = await response.json()
  } else {
    const text = await response.text()
    payload = text || null
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error
      ? payload.error
      : typeof payload === 'object' && payload?.message
        ? payload.message
        : typeof payload === 'string' && payload
          ? payload
          : `Unable to load profile (${response.status})`

    throw new ProfileApiError(message, { status: response.status, payload })
  }

  return payload
}

export async function getProfileProgress({
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  signal,
} = {}) {
  const search = new URLSearchParams({ timezone })
  const response = await authFetch(`/api/profile/progress?${search}`, { signal })
  return readProfileResponse(response)
}

export async function getProfileWordGraph({ countryCode, scenarioId, signal } = {}) {
  if (!countryCode) {
    throw new TypeError('countryCode is required to load a profile word graph')
  }

  const search = new URLSearchParams({ countryCode })
  if (scenarioId) search.set('scenarioId', scenarioId)

  const response = await authFetch(`/api/profile/word-graph?${search}`, { signal })
  return readProfileResponse(response)
}

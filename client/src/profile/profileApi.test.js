import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({ authFetch: vi.fn() }))

import { authFetch } from '../api'
import {
  getProfileProgress,
  getProfileWordGraph,
  ProfileApiError,
} from './profileApi'

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: vi.fn().mockResolvedValue(payload),
  }
}

describe('profileApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads progress with an encoded timezone and forwards the abort signal', async () => {
    const signal = new AbortController().signal
    authFetch.mockResolvedValue(jsonResponse({ metrics: { reviews: 4 } }))

    await expect(getProfileProgress({ timezone: 'America/Los_Angeles', signal }))
      .resolves.toEqual({ metrics: { reviews: 4 } })

    expect(authFetch).toHaveBeenCalledWith(
      '/api/profile/progress?timezone=America%2FLos_Angeles',
      { signal },
    )
  })

  it('loads a graph using country and optional scenario filters', async () => {
    authFetch.mockResolvedValue(jsonResponse({ nodes: [], edges: [] }))

    await getProfileWordGraph({ countryCode: 'CN', scenarioId: 'street market' })

    expect(authFetch).toHaveBeenCalledWith(
      '/api/profile/word-graph?countryCode=CN&scenarioId=street+market',
      { signal: undefined },
    )
  })

  it('does not request an unscoped graph', async () => {
    await expect(getProfileWordGraph()).rejects.toThrow(TypeError)
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('surfaces structured server errors without losing their status', async () => {
    authFetch.mockResolvedValue(jsonResponse(
      { error: 'Sign in required' },
      { ok: false, status: 401 },
    ))

    const error = await getProfileProgress().catch((caught) => caught)

    expect(error).toBeInstanceOf(ProfileApiError)
    expect(error).toMatchObject({ message: 'Sign in required', status: 401 })
  })
})


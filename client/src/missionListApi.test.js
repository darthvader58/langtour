import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ authFetch: vi.fn() }))

import { authFetch } from './api'
import { getMissionList, MissionListApiError } from './missionListApi'

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(payload) }
}

describe('getMissionList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests the list scoped to countryCode and returns the parsed payload', async () => {
    const payload = { scenarios: [], nextAvailable: true, totalSituations: 15, countryComplete: false }
    authFetch.mockResolvedValue(jsonResponse(payload))

    await expect(getMissionList({ countryCode: 'cn' })).resolves.toEqual(payload)

    expect(authFetch).toHaveBeenCalledWith('/api/scenario/list?countryCode=cn', { signal: undefined })
  })

  it('rejects without calling fetch when countryCode is missing', async () => {
    await expect(getMissionList()).rejects.toThrow(TypeError)
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('surfaces a structured error on a non-ok response, without losing the status', async () => {
    authFetch.mockResolvedValue(jsonResponse({ error: 'Unknown countryCode' }, { ok: false, status: 400 }))

    const error = await getMissionList({ countryCode: 'zz' }).catch((caught) => caught)

    expect(error).toBeInstanceOf(MissionListApiError)
    expect(error).toMatchObject({ message: 'Unknown countryCode', status: 400 })
  })
})

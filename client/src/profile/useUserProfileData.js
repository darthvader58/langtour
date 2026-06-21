import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getProfileProgress, getProfileWordGraph } from './profileApi'

function useLatestRequest() {
  const sequence = useRef(0)
  const controller = useRef(null)

  return useMemo(() => ({
    begin() {
      controller.current?.abort()
      controller.current = new AbortController()
      sequence.current += 1
      return { requestId: sequence.current, signal: controller.current.signal }
    },
    isLatest(requestId) {
      return sequence.current === requestId
    },
    cancel() {
      controller.current?.abort()
      controller.current = null
      sequence.current += 1
    },
  }), [])
}

export function useProfileProgress({ enabled = true, timezone } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const requests = useLatestRequest()

  const reload = useCallback(() => setReloadVersion((version) => version + 1), [])

  useEffect(() => {
    if (!enabled) {
      requests.cancel()
      return undefined
    }

    const { requestId, signal } = requests.begin()

    Promise.resolve().then(async () => {
      if (signal.aborted || !requests.isLatest(requestId)) return
      setLoading(true)
      setError(null)

      try {
        const payload = await getProfileProgress({ timezone, signal })
        if (requests.isLatest(requestId)) setData(payload)
      } catch (requestError) {
        if (requestError?.name !== 'AbortError' && requests.isLatest(requestId)) {
          setError(requestError)
        }
      } finally {
        if (requests.isLatest(requestId)) setLoading(false)
      }
    })

    return requests.cancel
  }, [enabled, reloadVersion, requests, timezone])

  return {
    data: enabled ? data : null,
    loading: enabled ? loading : false,
    error: enabled ? error : null,
    reload,
  }
}

export function useProfileWordGraph({ enabled = true, countryCode, scenarioId } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const requests = useLatestRequest()

  const reload = useCallback(() => setReloadVersion((version) => version + 1), [])

  useEffect(() => {
    if (!enabled || !countryCode) {
      requests.cancel()
      return undefined
    }

    const { requestId, signal } = requests.begin()

    Promise.resolve().then(async () => {
      if (signal.aborted || !requests.isLatest(requestId)) return
      setLoading(true)
      setError(null)

      try {
        const payload = await getProfileWordGraph({ countryCode, scenarioId, signal })
        if (requests.isLatest(requestId)) setData(payload)
      } catch (requestError) {
        if (requestError?.name !== 'AbortError' && requests.isLatest(requestId)) {
          setError(requestError)
        }
      } finally {
        if (requests.isLatest(requestId)) setLoading(false)
      }
    })

    return requests.cancel
  }, [countryCode, enabled, reloadVersion, requests, scenarioId])

  const active = enabled && Boolean(countryCode)
  return {
    data: active ? data : null,
    loading: active ? loading : false,
    error: active ? error : null,
    reload,
  }
}

export function useUserProfileData({
  enabled = true,
  timezone,
  countryCode,
  scenarioId,
} = {}) {
  const progress = useProfileProgress({ enabled, timezone })
  const graph = useProfileWordGraph({
    enabled: enabled && Boolean(countryCode),
    countryCode,
    scenarioId,
  })
  const reloadProgress = progress.reload
  const reloadGraph = graph.reload

  const reload = useCallback(() => {
    reloadProgress()
    if (countryCode) reloadGraph()
  }, [countryCode, reloadGraph, reloadProgress])

  return { progress, graph, reload }
}

// Shared API read-cache for GET endpoints. Same idiom as settings.js / fsrsStore.js
// (a module-level store + useSyncExternalStore), extended with per-key entries so
// many components can share one cached response.
//
// What it buys over raw fetch-in-useEffect:
//   • Dedup    — N components mounting the same key share ONE in-flight request.
//   • Cache    — a revisited page paints instantly from the last response, then
//                revalidates in the background (stale-while-revalidate).
//   • Invalidate — mutations call invalidate(key) / invalidatePrefix(prefix) to
//                refetch affected reads without prop-drilling refresh callbacks.
//
// It deliberately does NOT replace POST/streaming/SSE calls — only plain GET reads.

import { useSyncExternalStore, useEffect } from 'react'
import { API } from '../api'

// key (URL path, e.g. "/api/dashboard?...") → entry
// entry = { data, error, status: 'idle'|'loading'|'success'|'error', ts, promise }
const cache = new Map()
const subs = new Map() // key → Set<callback>

// Default time a cached entry is considered fresh. While fresh, a new subscriber
// reuses the cached value without hitting the network; once stale, the next read
// triggers a background revalidation but still serves the cached value first.
const DEFAULT_TTL = 30_000

// Stable fallback for cache misses. getEntry/getSnapshot MUST return the same
// reference every call for a missing key — a fresh object literal each time
// makes useSyncExternalStore think the store changed on every render, triggering
// React's "getSnapshot should be cached to avoid an infinite loop" error.
const EMPTY_ENTRY = { data: undefined, error: null, status: 'idle', ts: 0, promise: null }

function emit(key) {
  const cbs = subs.get(key)
  if (cbs) for (const cb of cbs) cb()
}

function subscribe(key, cb) {
  let cbs = subs.get(key)
  if (!cbs) { cbs = new Set(); subs.set(key, cbs) }
  cbs.add(cb)
  return () => {
    cbs.delete(cb)
    if (!cbs.size) subs.delete(key)
  }
}

function getEntry(key) {
  return cache.get(key) || EMPTY_ENTRY
}

// Fire (or reuse) the network request for `key`. Shares the in-flight promise so
// concurrent callers don't double-fetch. Returns the promise.
function fetchKey(key, { force = false } = {}) {
  const prev = cache.get(key)
  if (prev?.promise) return prev.promise // already in flight — dedup
  if (!force && prev && prev.status === 'success' && Date.now() - prev.ts < DEFAULT_TTL) {
    return Promise.resolve(prev.data) // still fresh
  }

  const promise = fetch(`${API}${key}`)
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((data) => {
      cache.set(key, { data, error: null, status: 'success', ts: Date.now(), promise: null })
      emit(key)
      return data
    })
    .catch((error) => {
      const e = cache.get(key)
      cache.set(key, { data: e?.data, error, status: 'error', ts: Date.now(), promise: null })
      emit(key)
      throw error
    })

  // Mark loading while preserving any previously-cached data (stale-while-revalidate).
  cache.set(key, { data: prev?.data, error: prev?.error ?? null, status: 'loading', ts: prev?.ts ?? 0, promise })
  emit(key)
  return promise
}

/**
 * useApiQuery(key) — cached GET. `key` is the API path including query string,
 * e.g. `/api/dashboard?trend_days=90`. Pass `null`/`undefined` key to skip
 * fetching (conditional queries). Returns { data, error, loading, refetch }.
 */
export function useApiQuery(key, { ttl } = {}) {
  const snapshot = useSyncExternalStore(
    (cb) => (key ? subscribe(key, cb) : () => {}),
    () => (key ? getEntry(key) : EMPTY_ENTRY),
    () => (key ? getEntry(key) : EMPTY_ENTRY),
  )

  useEffect(() => {
    if (!key) return
    const e = cache.get(key)
    const stale = !e || e.status === 'idle' || (e.status === 'success' && Date.now() - e.ts >= (ttl ?? DEFAULT_TTL))
    if (stale && !e?.promise) fetchKey(key).catch(() => {})
  }, [key, ttl])

  return {
    data: snapshot.data,
    error: snapshot.error,
    // "loading" only when we have nothing to show yet; a background revalidate
    // with cached data present is not surfaced as loading (snappy revisits).
    loading: snapshot.status === 'loading' && snapshot.data === undefined,
    refetch: () => (key ? fetchKey(key, { force: true }) : Promise.resolve()),
  }
}

// Drop a cached entry and refetch any live subscribers. Call after a mutation
// that changes what `key` returns.
export function invalidate(key) {
  if (subs.get(key)?.size) fetchKey(key, { force: true }).catch(() => {})
  else cache.delete(key)
}

// Invalidate every cached key starting with `prefix` (e.g. "/api/lessons").
export function invalidatePrefix(prefix) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) invalidate(key)
  }
}

// Imperative prefetch — warm the cache before a component mounts (e.g. on nav hover).
export function prefetch(key) {
  if (key) fetchKey(key).catch(() => {})
}

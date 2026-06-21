import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { API } from '../api'
import { theme, radius, shadow, motion } from '../theme.js'
import { Icon } from '../components/ui/Icon.jsx'

import {
  TOP_K, MAX_NODES,
  defaultW,
  WIDTH, HEIGHT, AXIS_PAD_CARD,
} from '../components/graph/constants.js'
import { robustRange } from '../utils/metrics.js'
import {
  optimizeNonlinearDistances,
  optimizeNonlinearForMetric,
  optimizeNonlinearIsolateFocus,
  optimizeNonlinearConnectivity,
} from '../components/graph/optimizers.js'
import { initGraphWorker, runFocusSim } from '../components/graph/workerBridge.js'
import { colorizeSync } from '../utils/colormap.js'
import { getCachedHistory, putCachedHistory } from '../utils/historyCache.js'
import {
  getCachedGraphSnapshot,
  graphPayloadToSnapshot,
  putCachedGraphSnapshot,
  snapshotToGraphState,
} from '../utils/graphSnapshotCache.js'
import { buildHistoryMetrics as computeHistoryMetrics } from '../utils/historyMetrics.js'

import AxisPadGrid from '../components/graph/AxisPadGrid.jsx'
import GraphCanvas from '../components/graph/GraphCanvas.jsx'
import GradientLegend from '../components/graph/GradientLegend.jsx'
import MetaBar from '../components/graph/MetaBar.jsx'
import TimelineControl from '../components/graph/TimelineControl.jsx'
import ExploreTask from '../components/graph/tasks/ExploreTask.jsx'
import HubsPanel from '../components/graph/tasks/HubsPanel.jsx'
import CoMoverExplorer from '../components/graph/tasks/CoMoverExplorer.jsx'
import { makeRingsOverlay, composeOverlays } from '../components/graph/overlays/labels.js'
import { updateSettings, getSettings, DEFAULTS } from '../utils/settings.js'
import GraphSettingsPanel from '../components/graph/GraphSettingsPanel.jsx'

const LOAD_STAGE = {
  LOADING_NODES: 'loading_nodes',
  NODES_READY: 'nodes_ready',
  EDGES_READY: 'edges_ready',
  METRICS_READY: 'metrics_ready',
  ERROR: 'error',
}

async function consumeNDJSON(response, onChunk) {
  if (!response.ok) throw new Error(await response.text())
  const reader = response.body?.getReader()
  if (!reader) throw new Error('streaming not supported')
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      const chunk = JSON.parse(line)
      if (chunk.type === 'error') throw new Error(chunk.error || 'graph stream failed')
      await onChunk(chunk)
    }
  }
  buf += decoder.decode()
  if (buf.trim()) {
    const chunk = JSON.parse(buf)
    if (chunk.type === 'error') throw new Error(chunk.error || 'graph stream failed')
    await onChunk(chunk)
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// Shared micro-label for the control console sections (Color / Perspective / Timeline).
const consoleLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: theme.inkSoft,
}

// Top-level GraphView shell. Single unified view — no task tabs. All panels render
// together below the canvas (Review queue, Explore word card when focused, Analyze
// = hubs + co-mover explorer). On first data load the projection is seeded with
// top-2 PCA; user can override via optimizer buttons in the meta bar.

function GraphStreamStatus({ message, compact = false }) {
  return (
    <div style={{
      minHeight: compact ? 0 : 96,
      display: 'flex',
      alignItems: 'center',
      justifyContent: compact ? 'flex-start' : 'center',
      gap: 8,
      padding: compact ? '6px 0' : '0.85rem 1rem',
      background: compact ? 'transparent' : theme.panel,
      border: compact ? 'none' : `1px solid ${theme.border}`,
      borderRadius: compact ? 0 : radius.md,
      color: theme.inkSoft,
      fontSize: compact ? 12 : 13,
      fontFamily: 'monospace',
      textAlign: compact ? 'left' : 'center',
    }}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: theme.matchaMid,
        boxShadow: `0 0 10px ${theme.matchaMid}`,
        flexShrink: 0,
      }} />
      {message}
    </div>
  )
}

export default function GraphView() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [colorMode, setColorMode] = useState('retrievability')
  const projectionMode = 'linear'
  const [W, setW] = useState(defaultW)
  const [nnColoring, setNnColoring] = useState(null)
  const [viewResetKey, setViewResetKey] = useState(0) // bumped by optimizers that want to also reset canvas pan/zoom
  const [lastLoss, setLastLoss] = useState(null) // { label: string, history: number[] } from the last nonlinear optimizer run
  const [optimizerBusy, setOptimizerBusy] = useState(false)
  // Timeline: 0 = "now" (use live values). Any positive value fetches a historical
  // snapshot and swaps in those per-node metric values for coloring + legend.
  const [timelineDaysAgo, setTimelineDaysAgo] = useState(0)
  // historicalMetrics: null when on "now", otherwise { retrievability, stability,
  // difficulty } each a Float32Array(N) indexed by packed.points position.
  const [historicalMetrics, setHistoricalMetrics] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false) // true while a fetch is in flight
  const historyCacheRef = useRef(new Map()) // date-string → metrics object
  const [searchValue, setSearchValue] = useState('')
  const [searchMatches, setSearchMatches] = useState([])
  const [display, setDisplay] = useState(() => {
    const s = getSettings()
    return {
      nodeSize: clamp(s.graphNodeSize ?? DEFAULTS.graphNodeSize, 0.3, 4),
      lineThickness: clamp(s.graphLineThickness ?? DEFAULTS.graphLineThickness, 0.3, 4),
      nodeOpacity: clamp(s.graphNodeOpacity ?? DEFAULTS.graphNodeOpacity, 0, 1),
      edgeOpacity: clamp(s.graphEdgeOpacity ?? DEFAULTS.graphEdgeOpacity, 0, 1),
    }
  })
  const [simCutoff, setSimCutoff] = useState(() => {
    const persisted = getSettings().graphSimCutoff
    return Number.isFinite(persisted) ? persisted : null
  })
  const displayPersistTimeoutRef = useRef(null)
  const simCutoffPersistTimeoutRef = useRef(null)
  const [loadStage, setLoadStage] = useState(LOAD_STAGE.LOADING_NODES)
  const [edgesData, setEdgesData] = useState(null)
  const [loadMessage, setLoadMessage] = useState('Preparing graph stream...')
  const [showingCachedGraph, setShowingCachedGraph] = useState(false)

  // The right rail is height-locked to the left (map) column so the two columns
  // always bottom out together and the rail scrolls internally — whether it's
  // showing the long Hubs deck or a tall focused-word detail. We measure the left
  // column with a ResizeObserver and pin the rail to that pixel height. Only kicks
  // in once the columns are side-by-side (wide viewport); when they wrap to a
  // single column the cap is dropped so the rail can flow naturally.
  const leftColRef = useRef(null)
  const [railHeight, setRailHeight] = useState(null)
  useEffect(() => {
    const el = leftColRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      // Side-by-side only: if the column already spans most of the row the layout
      // has wrapped, so don't impose a height.
      const wrapped = el.parentElement && el.offsetWidth >= el.parentElement.offsetWidth - 4
      setRailHeight(wrapped ? null : el.offsetHeight)
    })
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [])

  const handleDisplayChange = useCallback((patch) => {
    setDisplay((d) => {
      const next = { ...d, ...patch }
      clearTimeout(displayPersistTimeoutRef.current)
      displayPersistTimeoutRef.current = setTimeout(() => {
        updateSettings({
          graphNodeSize: next.nodeSize,
          graphLineThickness: next.lineThickness,
          graphNodeOpacity: next.nodeOpacity,
          graphEdgeOpacity: next.edgeOpacity,
        })
      }, 200)
      return next
    })
  }, [])

  const handleSimCutoffChange = useCallback((value) => {
    setSimCutoff(value)
    clearTimeout(simCutoffPersistTimeoutRef.current)
    simCutoffPersistTimeoutRef.current = setTimeout(() => {
      updateSettings({ graphSimCutoff: value })
    }, 200)
  }, [])

  useEffect(() => {
    return () => {
      clearTimeout(displayPersistTimeoutRef.current)
      clearTimeout(simCutoffPersistTimeoutRef.current)
    }
  }, [])

  const initializedProjection = useRef(false)

  // Kill any stale localStorage left by a previous iteration (axis state was briefly
  // persisted there). Harmless no-op if the keys don't exist.
  useEffect(() => {
    try {
      localStorage.removeItem('graph.axisCount.v1')
      localStorage.removeItem('graph.mags.v1')
      localStorage.removeItem('graph.angles.v1')
    } catch { /* ignore */ }
  }, [])

  const applyEdgePayload = useCallback((edgesPayload) => {
    setEdgesData(edgesPayload)
    const sims = (edgesPayload.edges || []).map((e) => e.sim).filter(Number.isFinite).sort((a, b) => a - b)
    if (!sims.length) return
    const max = sims[sims.length - 1]
    const persisted = getSettings().graphSimCutoff
    if (persisted != null && persisted >= sims[0] && persisted <= max) {
      setSimCutoff(persisted)
    } else {
      setSimCutoff(max)
    }
  }, [])

  // Fetch graph data in stages. Browser cache paints first when available; the
  // server stream then refreshes nodes, edges, and metrics without repeating giant
  // ID lists through request URLs or POST bodies.
  useEffect(() => {
    setErr(null)
    setLoadMessage('Checking browser cache...')

    let cancelled = false
    const run = async () => {
      let latestData = null
      let latestEdges = null
      let snapshotKey = null
      try {
        const cached = await getCachedGraphSnapshot({ maxNodes: MAX_NODES })
        if (cancelled) return
        const cachedState = snapshotToGraphState(cached)
        if (cachedState) {
          latestData = cachedState.data
          latestEdges = cachedState.edgesData
          snapshotKey = cached.snapshotKey
          setData(cachedState.data)
          applyEdgePayload(cachedState.edgesData)
          setShowingCachedGraph(true)
          setLoadStage(LOAD_STAGE.METRICS_READY)
          setLoadMessage('Showing cached graph. Refreshing...')
        } else {
          setData(null)
          setEdgesData(null)
          setShowingCachedGraph(false)
          setLoadStage(LOAD_STAGE.LOADING_NODES)
          setLoadMessage('Streaming graph...')
        }

        const stream = await fetch(`${API}/api/graph/stream?maxNodes=${MAX_NODES}`)
        await consumeNDJSON(stream, async (chunk) => {
          if (cancelled) return
          if (chunk.snapshotKey) snapshotKey = chunk.snapshotKey
          if (chunk.type === 'status') {
            setLoadMessage('Graph stream connected. Preparing geometry...')
          } else if (chunk.type === 'manifest') {
            setLoadMessage(`Streaming ${chunk.nodeCount?.toLocaleString?.() || chunk.nodeCount || ''} graph nodes...`)
          } else if (chunk.type === 'nodes') {
            latestData = {
              nodes: chunk.nodes || [],
              totalWords: chunk.totalWords,
              sampled: chunk.sampled,
              dimInfo: chunk.dimInfo,
              pcaInfo: chunk.pcaInfo,
              snapshotKey,
              fromBrowserCache: false,
            }
            latestEdges = null
            setData(latestData)
            setEdgesData(null)
            setShowingCachedGraph(false)
            setLoadStage(LOAD_STAGE.NODES_READY)
            setLoadMessage('Streaming edges...')
          } else if (chunk.type === 'edges') {
            latestEdges = { edges: chunk.edges || [] }
            applyEdgePayload(latestEdges)
            setLoadStage(LOAD_STAGE.EDGES_READY)
            setLoadMessage('Streaming metrics...')
          } else if (chunk.type === 'metrics') {
            const metrics = chunk.metrics || {}
            latestData = {
              ...latestData,
              nodes: (latestData?.nodes || []).map(n => ({ ...n, ...(metrics[n.id] || {}) })),
            }
            setData(latestData)
            setLoadStage(LOAD_STAGE.METRICS_READY)
            setLoadMessage('Graph ready')
            if (latestData && latestEdges && snapshotKey) {
              const snapshot = graphPayloadToSnapshot(latestData, latestEdges, snapshotKey, { maxNodes: MAX_NODES })
              await putCachedGraphSnapshot(snapshot)
            }
          } else if (chunk.type === 'done') {
            setShowingCachedGraph(false)
          }
        })
      } catch (e) {
        if (!cancelled) setErr(e.message)
      }
    }
    run()
    return () => { cancelled = true }
  }, [applyEdgePayload])

  // One-time initial projection: top-2 PCA + retrievability color. Runs on first data
  // load only. User can override with any optimizer button in the meta bar.
  useEffect(() => {
    if (!data?.nodes?.length || initializedProjection.current) return
    setColorMode('retrievability')
    initializedProjection.current = true
  }, [data])

  // Compute similarity stats and initial cutoff from edge data.
  const simStats = useMemo(() => {
    const edges = edgesData?.edges || []
    if (!edges.length) return { min: 0, max: 0 }
    const sims = edges.map(e => e.sim).filter(Number.isFinite).sort((a, b) => a - b)
    if (!sims.length) return { min: 0, max: 0 }
    return { min: sims[0], max: sims[sims.length - 1] }
  }, [edgesData])

  useEffect(() => {
    if (simStats.max <= simStats.min) return
    setSimCutoff((prev) => {
      if (prev != null && prev >= simStats.min && prev <= simStats.max) return prev
      return simStats.max
    })
  }, [simStats])

  // Count of active vs total links for the similarity slider hint.
  const linkCount = useMemo(() => {
    const edges = edgesData?.edges || []
    if (!edges.length) return { active: 0, total: 0 }
    const total = edges.length
    let active = total
    if (simCutoff != null) {
      active = edges.filter(e => e.sim <= simCutoff).length
    }
    return { active, total }
  }, [edgesData, simCutoff])

  // Pack pcScores + per-metric values into flat Float32Arrays once per data load.
  // Everything downstream (projection, color buffer, worker uploads) reads from these
  // typed arrays — so click-time code paths never iterate data.nodes to gather values.
  //
  // NOTE: this runs ONCE per data fetch on the main thread. For N=10k·K=384 it's ~30 ms
  // of up-front cost. Not per click.
  const packed = useMemo(() => {
    if (!data?.nodes?.length) return null
    const N = data.nodes.length
    const K = TOP_K
    const pc = new Float32Array(N * K)
    const points = new Array(N)
    const metricKeys = ['retrievability', 'stability', 'difficulty', 'connectivity', 'density', 'hubness']
    const metricArrays = {}
    for (const k of metricKeys) metricArrays[k] = new Float32Array(N)
    const idToIdx = new Map()
    for (let i = 0; i < N; i++) {
      const n = data.nodes[i]
      const scores = n.pcScores || []
      const lim = Math.min(K, scores.length)
      for (let k = 0; k < lim; k++) pc[i * K + k] = scores[k] || 0
      points[i] = { id: n.id, x: n.umapX ?? 0, y: n.umapY ?? 0, z: n.umapZ ?? 0, sx: 0, sy: 0, depth: 0, ref: n, idx: i, _umapX: n.umapX ?? 0, _umapY: n.umapY ?? 0, _umapZ: n.umapZ ?? 0 }
      idToIdx.set(n.id, i)
      for (const mk of metricKeys) {
        const v = n[mk]
        metricArrays[mk][i] = Number.isFinite(v) ? v : NaN
      }
    }
    return { pc, N, K, points, metricArrays, idToIdx }
  }, [data])

  // Fetch a historical snapshot for the selected timeline date and reshape it into
  // Float32Arrays indexed by node position (same index space as packed.metricArrays).
  // Cached by date string so dragging back to a previously-seen date is instant.
  // Helper: transform a /api/graph/history response into node-position-indexed
  // Float32Arrays. Shared by the on-demand scrub path and the background prefetch.
  // Defined in utils/historyMetrics.js for testability.
  const buildHistoryMetrics = useCallback((snap, pk) => computeHistoryMetrics(snap, pk), [])

  // On-demand fetch for the currently-selected date. With the prefetcher below
  // populating both the in-memory and IndexedDB caches up front, this effect
  // almost always hits a cache and never triggers the `loading…` flag.
  useEffect(() => {
    if (timelineDaysAgo === 0 || !packed || !data) { setHistoricalMetrics(null); setHistoryLoading(false); return }
    const date = new Date(Date.now() - timelineDaysAgo * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10)
    const memHit = historyCacheRef.current.get(date)
    if (memHit) { setHistoricalMetrics(memHit); setHistoryLoading(false); return }
    // Cache miss — keep the previous metrics visible while loading so the map
    // never flashes back to live/default colors during scrubbing.
    setHistoryLoading(true)
    let cancelled = false
    const run = async () => {
      const diskHit = await getCachedHistory(date, packed.N)
      if (cancelled) return
      if (diskHit) {
        historyCacheRef.current.set(date, diskHit)
        setHistoricalMetrics(diskHit)
        setHistoryLoading(false)
        return
      }
      try {
        const snap = await fetch(`${API}/api/graph/history?date=${date}`).then(r => r.json())
        if (cancelled) return
        if (snap.error) { console.error('history fetch:', snap.error); setHistoryLoading(false); return }
        const metrics = buildHistoryMetrics(snap, packed)
        historyCacheRef.current.set(date, metrics)
        setHistoricalMetrics(metrics)
        putCachedHistory(date, metrics)
      } catch (e) {
        if (!cancelled) console.error('history fetch:', e)
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [timelineDaysAgo, packed, data, buildHistoryMetrics])

  // Background prefetch: walk every day from 1..365, pull each snapshot, populate
  // both caches. Runs concurrently (4 in flight) so the full year hydrates in a
  // few seconds rather than a few minutes. Skips any date already cached on disk.
  // Cancelled if the component unmounts.
  useEffect(() => {
    if (!packed || !data) return
    let cancelled = false
    const CONCURRENT = 4
    const MAX_DAYS = 365
    let next = 1
    const worker = async () => {
      while (!cancelled) {
        const day = next++
        if (day > MAX_DAYS) return
        const date = new Date(Date.now() - day * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10)
        if (historyCacheRef.current.has(date)) continue
        const diskHit = await getCachedHistory(date, packed.N)
        if (cancelled) return
        if (diskHit) { historyCacheRef.current.set(date, diskHit); continue }
        try {
          const snap = await fetch(`${API}/api/graph/history?date=${date}`).then(r => r.json())
          if (cancelled) return
          if (snap.error) continue
          const metrics = buildHistoryMetrics(snap, packed)
          historyCacheRef.current.set(date, metrics)
          putCachedHistory(date, metrics) // fire-and-forget
        } catch {
          // Transient fetch errors skip this date; slider still works from the server.
        }
      }
    }
    const workers = Array.from({ length: CONCURRENT }, worker)
    Promise.all(workers)
    return () => { cancelled = true }
  }, [packed, data, buildHistoryMetrics])

  // Initialize the graph worker with packed pcScores once per data load. All other
  // bridge methods auto-await this, so downstream effects just call them directly.
  useEffect(() => {
    if (!packed) return
    initGraphWorker(packed.pc, packed.N, packed.K)
  }, [packed])

  // Similarity-to-focus — Float32Array of length N, indexed by data.nodes position.
  // Only computed when the user is actually viewing similarity coloring; otherwise
  // clicking a node shouldn't fire a worker call or trigger any state update for this.
  // That alone removes the main per-click cost (worker roundtrip + React rerender +
  // projected-wrapper rebuild) in every non-similarity colorMode.
  const deferredFocusId = useDeferredValue(focusId)
  const [simForId, setSimForId] = useState(null)
  const needsSim = colorMode === 'similarity'
  useEffect(() => {
    if (!needsSim || !packed || deferredFocusId == null) { setSimForId(null); return }
    const focusIdx = packed.idToIdx.get(deferredFocusId)
    if (focusIdx == null) { setSimForId(null); return }
    let cancelled = false
    runFocusSim(focusIdx).then(sims => {
      if (cancelled) return
      startTransition(() => setSimForId(sims))
    })
    return () => { cancelled = true }
  }, [packed, deferredFocusId, needsSim])

  const pointsGeom = useMemo(() => {
    if (!packed) return { scale: 1 }
    const { pc, N, K, points } = packed
    if (projectionMode === 'umap') {
      for (let i = 0; i < N; i++) { points[i].x = points[i]._umapX; points[i].y = points[i]._umapY; points[i].z = points[i]._umapZ }
      let sumX = 0, sumY = 0, sumZ = 0
      for (let i = 0; i < N; i++) { sumX += points[i].x; sumY += points[i].y; sumZ += points[i].z }
      const mx = sumX / N, my = sumY / N, mz = sumZ / N
      let maxSq = 0
      for (let i = 0; i < N; i++) {
        points[i].x -= mx; points[i].y -= my; points[i].z -= mz
        const d = points[i].x * points[i].x + points[i].y * points[i].y + points[i].z * points[i].z
        if (d > maxSq) maxSq = d
      }
      const scale = maxSq > 0 ? 1 / Math.sqrt(maxSq) : 1
      for (let i = 0; i < N; i++) { points[i].x *= scale; points[i].y *= scale; points[i].z *= scale }
      return { scale }
    }
    const wx = W.wx, wy = W.wy, wz = W.wz
    const xs = new Float64Array(N), ys = new Float64Array(N), zs = new Float64Array(N)
    let sumX = 0, sumY = 0, sumZ = 0
    for (let i = 0; i < N; i++) {
      let x = 0, y = 0, z = 0
      const base = i * K
      for (let k = 0; k < K; k++) { const v = pc[base + k]; x += v * (wx[k] || 0); y += v * (wy[k] || 0); z += v * (wz[k] || 0) }
      xs[i] = x; ys[i] = y; zs[i] = z; sumX += x; sumY += y; sumZ += z
    }
    const mx = sumX / N, my = sumY / N, mz = sumZ / N
    let max = 0
    for (let i = 0; i < N; i++) { const dx = xs[i] - mx, dy = ys[i] - my, dz = zs[i] - mz; xs[i] = dx; ys[i] = dy; zs[i] = dz; const d = dx*dx+dy*dy+dz*dz; if (d > max) max = d }
    max = Math.sqrt(max)
    const scale = max > 0 ? 1 / max : 1
    for (let i = 0; i < N; i++) { const p = points[i]; p.x = xs[i] * scale; p.y = ys[i] * scale; p.z = zs[i] * scale }
    return { scale }
  }, [packed, W, projectionMode])

  // Thin wrapper — combines geometry with focus/sim state. Changes to focus alone
  // don't retrigger the heavy projection above. focusIdx lookup is O(1) via idToIdx.
  const projected = useMemo(() => {
    if (!packed) return { points: [], scale: 1, focusIdx: -1, simForId: null }
    const focusIdx = focusId == null ? -1 : (packed.idToIdx.get(focusId) ?? -1)
    return { points: packed.points, scale: pointsGeom.scale, focusIdx, simForId }
  }, [packed, pointsGeom, focusId, simForId])

  const projectionKey = useMemo(() => ({ mode: projectionMode, W }), [projectionMode, W])

  // Edge endpoint index pairs + per-edge similarity, resolved once when the edge list arrives
  const edgeIndexPairs = useMemo(() => {
    if (!packed || !edgesData?.edges?.length) return null
    const idToIdx = packed.idToIdx
    const pairs = []; const sims = []
    for (const e of edgesData.edges) {
      const a = idToIdx.get(e.source); const b = idToIdx.get(e.target)
      if (a == null || b == null) continue
      pairs.push(a, b); sims.push(e.sim)
    }
    return { pairs: new Uint32Array(pairs), sims: new Float32Array(sims), count: sims.length }
  }, [packed, edgesData])

  // Precompute the robust range for each per-node color metric, keyed on data +
  // colorMode only. Avoids re-mapping a 10k-element array + sorting it on every
  // click (was happening twice — once here, once in colorLegend). For similarity /
  // nnColoring the range is computed inline below since those inputs change more
  // often and aren't worth memoizing at the metric level.
  const metricRange = useMemo(() => {
    if (!data?.nodes || colorMode === 'similarity' || nnColoring) return null
    // Prefer the timeline override if it has this colorMode (retrievability /
    // stability / difficulty). Otherwise fall back to the live values.
    const overrideArr = historicalMetrics?.[colorMode]
    const vals = []
    if (overrideArr) {
      for (let i = 0; i < overrideArr.length; i++) {
        if (Number.isFinite(overrideArr[i])) vals.push(overrideArr[i])
      }
    } else {
      const n = data.nodes
      for (let i = 0; i < n.length; i++) {
        const v = n[i][colorMode]
        if (Number.isFinite(v)) vals.push(v)
      }
    }
    if (!vals.length) return null
    return robustRange(vals)
  }, [data, colorMode, nnColoring, historicalMetrics])

  // Only tie derived color work to simForId when similarity mode is active.
  const effectiveSim = colorMode === 'similarity' ? simForId : null

  const colorLegend = useMemo(() => {
    if (!data?.nodes) return null
    if (nnColoring) {
      const vals = [...nnColoring.values.values()].filter(Number.isFinite)
      if (!vals.length) return null
      if (nnColoring.kind === 'residual') {
        let maxAbs = 0
        for (const v of vals) if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v)
        return { label: `MLP residual · ${nnColoring.metric}`, lo: -maxAbs, hi: maxAbs, diverging: true }
      }
      const { lo, hi } = robustRange(vals)
      return { label: `MLP-predicted ${nnColoring.metric}`, lo, hi }
    }
    if (colorMode === 'similarity') {
      if (!simForId) return null
      const vals = []
      for (let i = 0; i < simForId.length; i++) {
        if (Number.isFinite(simForId[i])) vals.push(simForId[i])
      }
      if (!vals.length) return null
      const { lo, hi } = robustRange(vals)
      return { label: 'similarity', lo, hi }
    }
    if (!metricRange) return null
    return { label: colorMode, lo: metricRange.lo, hi: metricRange.hi }
  }, [data, colorMode, effectiveSim, nnColoring, metricRange])

  // WebGL color buffer — Float32Array(N*3) of RGB in [0, 1], built entirely in the
  // worker. The main thread just hands the worker a reference to a precomputed
  // Float32Array of values (from `packed.metricArrays[colorMode]`, or `simForId`) and
  // receives the packed RGB buffer to upload. No per-node iteration runs on main.
  const [colorBuffer, setColorBuffer] = useState(null)
  useEffect(() => {
    if (!packed) { setColorBuffer(null); return }
    let values = null
    let lo = 0, hi = 1, diverging = false
    if (nnColoring) {
      // nnColoring values are a Map<id, number> from the NNProbes task. Build the
      // Float32Array once here (unavoidable since the data origin is a Map), but only
      // fires when nnColoring itself changes — not on focus clicks.
      const N = packed.N
      const arr = new Float32Array(N)
      if (nnColoring.kind === 'residual') {
        let maxAbs = 0
        for (const v of nnColoring.values.values()) {
          if (Number.isFinite(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v)
        }
        const span = Math.max(maxAbs, 1e-9)
        for (let i = 0; i < N; i++) {
          const v = nnColoring.values.get(data.nodes[i].id)
          arr[i] = Number.isFinite(v) ? v / span : NaN
        }
        diverging = true
      } else {
        const finite = []
        for (const v of nnColoring.values.values()) if (Number.isFinite(v)) finite.push(v)
        if (!finite.length) { setColorBuffer(null); return }
        const r = robustRange(finite); lo = r.lo; hi = r.hi
        for (let i = 0; i < N; i++) {
          const v = nnColoring.values.get(data.nodes[i].id)
          arr[i] = Number.isFinite(v) ? v : NaN
        }
      }
      values = arr
    } else if (colorMode === 'similarity') {
      if (!simForId) { setColorBuffer(null); return }
      values = simForId // pass the worker-produced Float32Array straight through
      // Range is computed in the worker's colorize handler via the explicit lo/hi —
      // but we need to pass those in too. Cheap O(N) on the Float32Array.
      let mn = Infinity, mx = -Infinity
      for (let i = 0; i < values.length; i++) {
        const v = values[i]
        if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v }
      }
      if (mn === Infinity) { setColorBuffer(null); return }
      lo = mn; hi = mx
    } else {
      if (!metricRange) { setColorBuffer(null); return }
      // Timeline override for retrievability/stability/difficulty; otherwise the
      // precomputed current-values array from packed.
      values = historicalMetrics?.[colorMode] || packed.metricArrays[colorMode]
      if (!values) { setColorBuffer(null); return }
      lo = metricRange.lo; hi = metricRange.hi
    }
    // Sync colorize on main thread — ~2 ms for N=10k. Previously this went through
    // the graph worker, but the worker is serial: a colorize message queued behind
    // a running nonlinear SGD would be stuck until SGD finished, so color-mode
    // changes during the live animation visually lagged. On main we just compute
    // and commit immediately.
    const buf = colorizeSync(values, { lo, hi, diverging, ramp: colorMode })
    startTransition(() => setColorBuffer(buf))
  }, [packed, data, colorMode, effectiveSim, nnColoring, metricRange, historicalMetrics])

  // Visibility mask for the timeline: nodes that didn't yet exist at the selected
  // historical date get hidden. The backend returns an entry for every current
  // word regardless, so we use the `existed` bitmap set in buildHistoryMetrics
  // (1 iff the word's created_at <= the target date).
  const visibilityMask = useMemo(() => {
    if (!packed || !historicalMetrics?.existed) return null // null = all visible
    return historicalMetrics.existed
  }, [packed, historicalMetrics])

  const eigenvalues = data?.pcaInfo?.eigenvalues || []
  const focusNode = useMemo(() => {
    if (focusId == null || !packed || !data?.nodes) return null
    const idx = packed.idToIdx.get(focusId)
    return idx == null ? null : data.nodes[idx] || null
  }, [packed, data, focusId])
  // Deferred copy of focusNode for heavy downstream panels. React renders the focus
  // ring + badge using the fresh value, then renders the expensive panels (Explore
  // neighbors, CoMover analysis) at low priority using this deferred value — so they
  // can't block input if the user clicks several nodes in succession.
  const deferredFocusNode = useDeferredValue(focusNode)

  const dataRef = useRef(data); dataRef.current = data
  const historicalMetricsRef = useRef(historicalMetrics); historicalMetricsRef.current = historicalMetrics
  const visibilityMaskRef = useRef(visibilityMask); visibilityMaskRef.current = visibilityMask
  const WRef = useRef(W); WRef.current = W
  const edgeRef = useRef(edgeIndexPairs); edgeRef.current = edgeIndexPairs

  // Timeline-aware node accessors. Panels (HubsPanel, ExploreTask, …) call these
  // instead of reading n.retrievability / n.stability / n.difficulty directly so
  // their lists + filters respond to the slider. `getMetric` falls back to the
  // live value for metrics that aren't in the history payload (connectivity,
  // density, hubness). `isVisible` is true unless the timeline has hidden the
  // node (created after the selected date).
  const historyIdToIdx = packed?.idToIdx
  const getMetric = useCallback((node, key) => {
    if (!historicalMetrics || !historyIdToIdx) return Number(node?.[key])
    const arr = historicalMetrics[key]
    if (!arr) return Number(node?.[key])
    const idx = historyIdToIdx.get(node?.id)
    if (idx == null) return NaN
    const v = arr[idx]
    return Number.isFinite(v) ? v : NaN
  }, [historicalMetrics, historyIdToIdx])
  const isVisible = useCallback((node) => {
    if (!visibilityMask || !historyIdToIdx) return true
    const idx = historyIdToIdx.get(node?.id)
    return idx != null ? !!visibilityMask[idx] : false
  }, [visibilityMask, historyIdToIdx])

  // Search match: lowercase substring over expression / reading / meaning. Match set feeds
  // the rings overlay + auto-focuses the single match.
  useEffect(() => {
    if (!data?.nodes?.length || !searchValue.trim()) { setSearchMatches([]); return }
    const q = searchValue.trim().toLowerCase()
    const matches = data.nodes.filter(n =>
      n.expression.toLowerCase().includes(q) ||
      (n.reading || '').toLowerCase().includes(q) ||
      (n.meaning || '').toLowerCase().includes(q)
    ).slice(0, 30)
    setSearchMatches(matches)
  }, [searchValue, data])

  // Compose per-task overlays. Only search-match rings at the moment — inline text
  // labels were removed per user preference (cluttered the canvas).
  const overlayPainter = useMemo(() => {
    if (!projected?.points?.length) return null
    const overlays = []
    if (searchMatches.length > 0) {
      overlays.push(makeRingsOverlay(projected, new Set(searchMatches.map(m => m.id)), { color: '#facc15' }))
    }
    return composeOverlays(...overlays)
  }, [projected, searchMatches])

  const optimizerGroups = useMemo(() => {
    if (projectionMode !== 'linear') return []
    const applyResult = (result, colorKey, label) => {
      if (!result) return
      setW(result.W); setViewResetKey(k => k + 1)
      if (colorKey) setColorMode(colorKey)
      if (result.lossHistory?.length) setLastLoss({ label: label || '', history: result.lossHistory })
      else setLastLoss(null)
    }
    const applyAsync = async (fnWithProgress, colorKey, label) => {
      if (optimizerBusy) return
      setOptimizerBusy(true)
      if (colorKey) setColorMode(colorKey)
      const live = []
      setLastLoss({ label: label || '', history: [] })
      let pendingW = null, rafId = null
      const flush = () => { rafId = null; if (pendingW) { setW(pendingW); pendingW = null }; setLastLoss({ label: label || '', history: live.slice() }) }
      try {
        const result = await fnWithProgress(({ loss, W: liveW }) => { live.push(loss); if (liveW) pendingW = liveW; if (rafId == null) rafId = requestAnimationFrame(flush) })
        if (rafId != null) { cancelAnimationFrame(rafId); rafId = null }
        applyResult(result, colorKey, label)
      } catch (e) { console.error('optimizer failed', e); if (rafId != null) cancelAnimationFrame(rafId) }
      finally { setOptimizerBusy(false) }
    }
    const Wnow = () => WRef.current
    const D = () => dataRef.current
    const metric = (key, label) => ({
      label, color: key,
      onClick: () => applyAsync(onP => optimizeNonlinearForMetric(D(), Wnow(), key, TOP_K, onP, { valuesOverride: historicalMetricsRef.current?.[key] || null, visibilityMask: visibilityMaskRef.current }), key, label),
      hint: `SGD stress minimization with |Δ${key}| targets`,
    })
    return [
      { label: 'best 3D', onClick: () => applyAsync(onP => optimizeNonlinearDistances(D(), Wnow(), TOP_K, onP), null, 'best 3D'), hint: 'SGD stress minimization in 3D — preserves pairwise distances' },
      { label: 'connectivity', onClick: () => applyAsync(onP => optimizeNonlinearConnectivity(D(), Wnow(), edgeRef.current, TOP_K, onP), 'connectivity', 'connectivity'), hint: 'SGD — pulls connected nodes together' },
      metric('retrievability', 'retrievability'),
      metric('stability', 'stability'),
      metric('difficulty', 'difficulty'),
      ...(focusNode ? [{ label: `isolate ${focusNode.expression}`, onClick: () => applyAsync(onP => optimizeNonlinearIsolateFocus(D(), Wnow(), focusNode, TOP_K, onP), 'similarity', `isolate ${focusNode.expression}`), hint: 'SGD on V[1] — refines focus-relative distances' }] : []),
    ]
  }, [projectionMode, focusNode, optimizerBusy])

  const availableMetrics = useMemo(() => [
    { value: 'retrievability', label: 'retrievability' },
    { value: 'stability', label: 'stability' },
    { value: 'difficulty', label: 'difficulty' },
    { value: 'connectivity', label: 'connectivity' },
    { value: 'density', label: 'density' },
    { value: 'hubness', label: 'hubness' },
    {
      value: 'similarity',
      label: `similarity${projected.focusIdx < 0 ? ' (click a node first)' : ''}`,
      disabled: projected.focusIdx < 0,
    },
  ], [projected])

  const renderHoverTooltip = useCallback(
    (h, mp) => <HoverTooltip hover={h} mousePos={mp} />,
    [],
  )

  const focusIdRef = useRef(focusId); focusIdRef.current = focusId
  const onPickWord = useCallback((node) => {
    if (!node) return
    if (focusIdRef.current === node.id) {
      startTransition(() => setFocusId(null))
      return
    }
    // Mark focus change as a transition. The focus ring paint is immediate (urgent
    // render), but the expensive panel re-computes (ExploreTask neighbors sort,
    // CoMoverExplorer time-series analysis, simForId) are concurrent and can be
    // interrupted by subsequent clicks, keeping the UI responsive.
    //
    // The auto-run of optimizeIsolateFocus on click was removed — with N=10k·K=384
    // it's ~15 M ops of sync linear algebra per click. Users who want the axis
    // reorientation can still hit the "isolate" button in the meta bar.
    startTransition(() => {
      setFocusId(node.id)
    })
  }, [])

  const handleSearchSubmit = useCallback(() => {
    if (searchMatches.length === 1) onPickWord(searchMatches[0])
  }, [searchMatches, onPickWord])

  const availablePCs = data?.nodes?.[0]?.pcScores?.length || TOP_K
  const axisCount = Math.min(TOP_K, availablePCs)
  const hasGraphData = !!data?.nodes?.length

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', minHeight: 0 }}>
      {/* Header: title + search */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${theme.border}` }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.ink, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          Word graph
          {data && <span style={{ fontSize: 12, color: theme.inkSoft, fontWeight: 'normal', fontFamily: 'monospace' }}>
            {data.nodes.length.toLocaleString()} words
          </span>}
        </h2>
        <GraphSearch
          value={searchValue}
          onChange={setSearchValue}
          matches={searchMatches}
          onPick={(n) => { onPickWord(n); setSearchValue('') }}
          onSubmit={handleSearchSubmit}
        />
      </header>

      {err && <div style={{ color: theme.badInk, padding: '8px 12px', background: theme.badSoft, border: `1px solid ${theme.bad}`, borderRadius: radius.sm }}>Error: {err}</div>}

      {/* Two stable regions side by side. The LEFT region (canvas + its own
          controls) is fixed-width and never reflows when a word is selected. The
          RIGHT rail is ALWAYS populated: the global Hubs deck when nothing is
          focused, swapping to the focused word's detail on click — so the rail is
          never an empty "click a word" void, and the map width stays stable
          (IS-016). */}
      <section style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', minWidth: 0, flexWrap: 'wrap' }}>
          {/* ── LEFT: the map and everything that drives the map ── */}
          <div ref={leftColRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: `0 1 ${WIDTH + 132 + 10}px`, width: WIDTH + 132 + 10, maxWidth: '100%', minWidth: 0 }}>
            {/* Fixed row height = canvas height. Without this hard cap the axis
                panel (alignItems:stretch) could grow to its own content height,
                which AxisPadGrid then reads to compute perPage → more pads → taller
                → runaway. Pinning the row to HEIGHT bounds the pagination math. */}
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'stretch', height: HEIGHT }}>
              <div style={{ position: 'relative', width: WIDTH, height: HEIGHT, flexShrink: 0 }}>
                <GraphCanvas
                  projected={projected}
                  edgeIndexPairs={edgeIndexPairs}
                  projectionKey={projectionKey}
                  colorBuffer={colorBuffer}
                  visibilityMask={visibilityMask}
                  onPick={onPickWord}
                  renderOverlays={overlayPainter}
                  viewResetKey={viewResetKey}
                  renderHoverTooltip={renderHoverTooltip}
                  display={display}
                  simCutoff={simCutoff}
                >
                  {!err && showingCachedGraph && (
                    <span style={{
                      position: 'absolute', bottom: 6, right: 6,
                      fontSize: 11, color: theme.inkSoft, fontFamily: 'monospace',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 8px', background: 'rgba(21,21,28,0.82)',
                      border: `1px solid ${theme.border}`, borderRadius: radius.sm,
                    }}>
                      <Icon.Spinner size={11} style={{ flexShrink: 0 }} />
                      showing cached graph · refreshing…
                    </span>
                  )}
                  {focusNode && (
                    <span style={{
                      position: 'absolute', top: 6, right: 6,
                      fontSize: 12, color: theme.matchaInk, fontFamily: 'monospace',
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 8px', background: 'rgba(21,21,28,0.82)',
                      border: `1px solid ${theme.border}`, borderRadius: radius.sm,
                    }}>
                      focus: <strong>{focusNode.expression}</strong>
                      <button onClick={(e) => { e.stopPropagation(); setFocusId(null) }}
                        style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}>clear</button>
                    </span>
                  )}
                  {!hasGraphData && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: theme.bg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: radius.md,
                    }}>
                      <GraphStreamStatus message={loadMessage} compact />
                    </div>
                  )}
                  {hasGraphData && (
                    <GraphSettingsPanel
                      display={display}
                      onDisplayChange={handleDisplayChange}
                      simCutoff={simCutoff}
                      onSimCutoffChange={handleSimCutoffChange}
                      simStats={simStats}
                      linkCount={linkCount}
                      disabled={loadStage !== LOAD_STAGE.METRICS_READY}
                    />
                  )}
                </GraphCanvas>

              </div>

              {hasGraphData && (
                <div style={{
                  width: 132,
                  height: '100%',
                  minHeight: 0,
                  padding: '11px 12px',
                  background: theme.panel,
                  border: `1px solid ${theme.border}`,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}>
                  <AxisPadGrid
                    W={W}
                    setW={setW}
                    axisCount={axisCount}
                    eigenvalues={eigenvalues}
                  />
                </div>
              )}
            </div>

            {/* One unified control console below the map — Color, Perspective and
                Timeline read as a single instrument (one frame, hairline-divided
                sections) instead of three disconnected boxes. */}
            {hasGraphData && (
              <div style={{
                background: theme.panel,
                border: `1px solid ${theme.border}`,
                borderRadius: radius.md,
                overflow: 'hidden',
              }}>
                {/* ── Section: Color ── the single most-used control, always first. */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '9px 12px',
                }}>
                  <span style={{ ...consoleLabel }}>color</span>
                  <select
                    value={colorMode}
                    onChange={(e) => setColorMode(e.target.value)}
                    disabled={loadStage !== LOAD_STAGE.METRICS_READY}
                    style={{ fontFamily: 'monospace', fontSize: 12, padding: '4px 8px' }}
                  >
                    {availableMetrics.map((m) => (
                      <option key={m.value} value={m.value} disabled={m.disabled}>{m.label}</option>
                    ))}
                  </select>
                  {colorLegend && <span style={{ marginLeft: 'auto' }}><GradientLegend legend={colorLegend} /></span>}
                  {nnColoring && (
                    <span style={{
                      fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '2px 8px', background: theme.goldSoft,
                      border: `1px solid ${theme.gold}`, borderRadius: radius.sm, color: theme.goldInk,
                    }}>
                      <Icon.Brain size={12} style={{ flexShrink: 0 }} />
                      MLP {nnColoring.kind === 'residual' ? 'residual' : 'predicted'} · <strong>{nnColoring.metric}</strong>
                      <button onClick={() => setNnColoring(null)} style={{ fontSize: 10, padding: '1px 6px' }}>clear</button>
                    </span>
                  )}
                  {data?.sampled && (
                    <span style={{ color: theme.warn, fontSize: 11 }}>
                      sampled {data.nodes.length.toLocaleString()} of {data.totalWords?.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* ── Section: Perspective ── the expressive 384-D reprojection bars. */}
                <div style={{ borderTop: `1px solid ${theme.borderSoft}`, padding: '11px 12px' }}>
                  <MetaBar
                    colorMode={colorMode}
                    setColorMode={setColorMode}
                    colorLegend={null}
                    availableMetrics={availableMetrics}
                    optimizerGroups={optimizerGroups}
                    optimizerBusy={optimizerBusy}
                    lastLoss={lastLoss}
                    data={data}
                    nnColoring={null}
                    onClearNnColoring={() => setNnColoring(null)}
                    hideColorSelect
                  />
                </div>

                {/* ── Section: Timeline ── drives the whole map's historical state. */}
                <div style={{
                  borderTop: `1px solid ${theme.borderSoft}`,
                  padding: '4px 12px 9px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <TimelineControl
                    daysAgo={timelineDaysAgo}
                    onChange={setTimelineDaysAgo}
                    labelColor={theme.inkSoft}
                    activeColor={theme.matchaInk}
                    style={{ flex: 1, borderTop: 'none', marginTop: 0, paddingTop: 0, padding: '6px 0' }}
                  />
                  {historyLoading && (
                    <span style={{ fontSize: 11, color: theme.inkFaint, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      loading…
                    </span>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ── RIGHT: the rail beside the map (own scroll). Always populated —
              the global Hubs deck until a word is focused, then that word's detail.
              No empty state. ── */}
          <div style={{ flex: '1 1 340px', minWidth: 340, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '0.6rem', height: railHeight ? `${railHeight}px` : 'auto', minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: 4 }}>
              {hasGraphData ? (
                focusNode ? (
                  <>
                    <ExploreTask data={data} focusNode={deferredFocusNode} onPickWord={onPickWord} getMetric={getMetric} isVisible={isVisible} />
                    <CoMoverExplorer
                      data={data}
                      focusNode={deferredFocusNode}
                      onPickWord={onPickWord}
                      getMetric={getMetric}
                      isVisible={isVisible}
                      anchorDaysAgo={timelineDaysAgo}
                    />
                  </>
                ) : (
                  <HubsPanel data={data} onPickWord={onPickWord} getMetric={getMetric} isVisible={isVisible} />
                )
              ) : (
                <GraphStreamStatus message="Select a word after the graph stream provides nodes." />
              )}
            </div>
          </div>
        </section>
    </div>
  )
}

function HoverTooltip({ hover, mousePos }) {
  return (
    <div style={{
      position: 'absolute',
      left: mousePos.x + 6,
      top: mousePos.y + 4,
      background: 'rgba(21,21,28,0.96)',
      color: theme.ink,
      padding: '6px 10px',
      borderRadius: radius.sm,
      fontSize: 13,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      boxShadow: shadow.lg,
      border: `1px solid ${theme.border}`,
    }}>
      <div style={{ fontSize: 20, fontWeight: 'bold' }}>{hover.expression}</div>
      <div style={{ color: theme.matchaInk, fontSize: 12 }}>{hover.reading}</div>
      <div style={{ color: theme.inkSoft, fontSize: 12 }}>{hover.meaning}</div>
      <div style={{ color: theme.slateInk, fontSize: 11, marginTop: 4, fontFamily: 'monospace' }}>
        R {(hover.retrievability ?? 0 * 100).toFixed(0)}% · stab {(hover.stability ?? 0).toFixed(1)}d · diff {(hover.difficulty ?? 0).toFixed(2)} · hub {hover.hubness ?? 0}
      </div>
      <div style={{ color: theme.inkFaint, fontSize: 10, fontFamily: 'monospace' }}>
        {hover.state_label} · {hover.reps} reps · {hover.lapses} laps
      </div>
    </div>
  )
}

// Modern search box for the word graph. Adds: focus ring, inline clear button,
// keyboard navigation over the results (↑/↓ to move, Enter to pick, Esc to
// dismiss), an active-row highlight, and an empty state.
function GraphSearch({ value, onChange, matches, onPick, onSubmit }) {
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0) // highlighted result index
  const open = focused && value.trim().length > 0

  // Reset the highlight whenever the result set changes so it never points past
  // the end of a freshly-narrowed list.
  useEffect(() => { setActive(0) }, [matches])

  // Keep the active row scrolled into view as the user arrows through results.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter') { e.preventDefault(); onSubmit() }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = matches[active]
      if (pick) onPick(pick)
      else onSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onChange('')
      inputRef.current?.blur()
    }
  }

  return (
    <div style={{ position: 'relative' }} onKeyDown={onKeyDown}>
      <Icon.Search
        size={14}
        style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: theme.inkFaint, pointerEvents: 'none' }}
      />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search word, pinyin, or meaning"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)} // let row mousedown land first
        aria-label="Search the word graph"
        autoComplete="off"
        spellCheck={false}
        style={{
          width: 300, fontSize: 13,
          padding: value ? '8px 32px 8px 32px' : '8px 12px 8px 32px',
          background: theme.paper, color: theme.ink,
          borderRadius: radius.md,
        }}
      />
      {value && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onChange(''); inputRef.current?.focus() }}
          aria-label="Clear search"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, padding: 0,
            background: 'transparent', border: 'none', borderRadius: radius.sm,
            color: theme.inkSoft, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = theme.matchaSoft; e.currentTarget.style.color = theme.ink }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.inkSoft }}
        >
          <Icon.Close size={14} />
        </button>
      )}

      {open && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            width: 340, maxHeight: 400, overflowY: 'auto',
            background: theme.panel, border: `1px solid ${theme.border}`,
            borderRadius: radius.md, boxShadow: shadow.lg, zIndex: 10,
            padding: 4,
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: '14px 12px', color: theme.inkSoft, fontSize: 12.5, textAlign: 'center' }}>
              No words match “<span style={{ color: theme.ink }}>{value.trim()}</span>”
            </div>
          ) : matches.map((n, i) => {
            const isActive = i === active
            return (
              <div
                key={n.id}
                data-idx={i}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => { e.preventDefault(); onPick(n) }}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  padding: '8px 10px', cursor: 'pointer',
                  borderRadius: radius.sm,
                  background: isActive ? theme.matchaSoft : 'transparent',
                  transition: `background ${motion.fast}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <strong style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>{n.expression}</strong>
                  {n.reading && <span style={{ color: theme.matchaInk, fontSize: 12, whiteSpace: 'nowrap' }}>{n.reading}</span>}
                </div>
                {n.meaning && (
                  <div style={{ color: theme.inkSoft, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {n.meaning.slice(0, 64)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

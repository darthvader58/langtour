import { memo, useMemo, useState, useEffect, useRef } from 'react'
import { API } from '../../../api.js'
import { pearson } from '../../../utils/correlations.js'
import PageNav from '../PageNav.jsx'
import { theme, space, fontSize, font, num } from '../../../theme.js'
import { Icon } from '../../ui/Icon.jsx'

const trajLabelStyle = {
  fontSize: fontSize.xs,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: theme.inkSoft,
}

const PAGE_SIZE = 10

const TRAJ_SORTERS = {
  word:    (a, b) => a.node.expression.localeCompare(b.node.expression),
  pinyin:  (a, b) => (a.node.reading || '').localeCompare(b.node.reading || ''),
  meaning: (a, b) => (a.node.meaning || '').localeCompare(b.node.meaning || ''),
  corr:    (a, b) => a.r - b.r,
  n:       (a, b) => a.overlap - b.overlap,
}

// CoMoverExplorer — pick a word, find the words whose learning history most closely
// tracks it over time. Fetches history snapshots at several past dates, builds a
// time-series of (stability / difficulty / retrievability) per word, and correlates
// the picked word's trajectory against every other word's trajectory.
//
// A high Pearson correlation between W's and X's retrievability trajectories means:
// when X's retrievability dipped, so did W's (same weeks). Usually surfaces words the
// user reviewed in the same sessions, or cards whose forgetting/refreshing cycles
// synced up.
//
// Six snapshot dates per preset window. More points per preset = more stable per-pair
// correlations, at the cost of more history endpoint calls on window change.
const WINDOW_PRESETS = {
  30:  [3, 7, 14, 21, 28],
  90:  [7, 14, 30, 45, 60, 90],
  180: [14, 30, 60, 90, 120, 180],
  365: [7, 30, 60, 90, 180, 365],
  730: [30, 90, 180, 365, 550, 730],
}
const METRICS = [
  { key: 'retrievability', label: 'retrievability' },
  { key: 'stability',      label: 'stability' },
  { key: 'difficulty',     label: 'difficulty' },
]
const MIN_OVERLAP = 4 // require at least this many shared finite points for a correlation

function CoMoverExplorerInner({
  data, focusNode, onPickWord,
  getMetric, isVisible, anchorDaysAgo = 0,
}) {
  const metricOf = getMetric || ((n, k) => Number(n?.[k]))
  const visibleAt = isVisible || (() => true)
  const [metric, setMetric] = useState('retrievability')
  const [windowDays, setWindowDays] = useState(365)
  const [snapshots, setSnapshots] = useState(null) // Map<days, Map<id, row>>
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Cache key includes the anchor date so switching the global timeline slider
  // invalidates the snapshot set correctly (we're looking at a different window
  // of the past now).
  const cacheRef = useRef(new Map())
  const pickedNode = focusNode || null
  const snapshotDays = WINDOW_PRESETS[windowDays]
  const anchorMs = Date.now() - anchorDaysAgo * 24 * 60 * 60 * 1000

  // Fetch all snapshots for the current window in parallel. Cached by window so switching
  // back to a previously-loaded window is instant.
  useEffect(() => {
    if (!data?.nodes?.length) return
    const cacheKey = `${windowDays}@${anchorDaysAgo}`
    if (cacheRef.current.has(cacheKey)) {
      setSnapshots(cacheRef.current.get(cacheKey))
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    // All snapshot dates are measured relative to the anchor (the global timeline
    // position) rather than `Date.now()` — so if the user time-travels to 90 days
    // ago, the "90-day window" spans day −90 through day −180 in real time.
    Promise.all(snapshotDays.map(d => {
      const date = new Date(anchorMs - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      return fetch(`${API}/api/graph/history?date=${date}`).then(r => r.json()).then(j => [d, j])
    })).then(results => {
      if (cancelled) return
      const out = new Map()
      for (const [d, j] of results) {
        if (j.error) { setError(j.error); return }
        const m = new Map()
        for (const n of j.nodes) {
          // Only include nodes that actually existed at that snapshot date.
          if (!n.last_review_at) continue
          m.set(n.id, {
            stability: Number(n.stability) || 0,
            difficulty: Number(n.difficulty) || 0,
            retrievability: Number(n.retrievability) || 0,
          })
        }
        out.set(d, m)
      }
      cacheRef.current.set(cacheKey, out)
      setSnapshots(out)
    }).catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [data, windowDays, snapshotDays, anchorDaysAgo, anchorMs])

  // Time-series correlation analysis. Runs async via a chunked setTimeout loop so the
  // N·T pearson computation (~100 ms at N=10k) doesn't block the main thread on focus
  // change. Yields to the browser every CHUNK_SIZE nodes so input/paint can interleave.
  const [analysis, setAnalysis] = useState(null)
  useEffect(() => {
    if (!pickedNode || !snapshots) { setAnalysis(null); return }
    let cancelled = false
    const timeSeriesFor = (node) => {
      // Anchor-point value honors the global timeline (metricOf falls back to live
      // node values when anchorDaysAgo === 0). Remaining entries come from the
      // fetched snapshot set, which is itself anchor-relative.
      const ts = [metricOf(node, metric)]
      for (const d of snapshotDays) {
        const snap = snapshots.get(d)
        const hit = snap?.get(node.id)
        ts.push(hit ? Number(hit[metric] ?? NaN) : NaN)
      }
      return ts
    }
    const pickedTs = timeSeriesFor(pickedNode)
    const pickedFiniteCount = pickedTs.filter(Number.isFinite).length
    if (pickedFiniteCount < MIN_OVERLAP) {
      setAnalysis({ pickedTs, pickedFiniteCount, ranked: [] })
      return
    }
    const ranked = []
    const nodes = data.nodes
    const CHUNK_SIZE = 500
    let i = 0
    let timerId = null
    const step = () => {
      timerId = null
      if (cancelled) return
      const end = Math.min(i + CHUNK_SIZE, nodes.length)
      for (; i < end; i++) {
        const n = nodes[i]
        if (n.id === pickedNode.id) continue
        // Skip words that didn't exist at the anchor date — they'd just be
        // all-NaN trajectories anyway and can't co-move.
        if (!visibleAt(n)) continue
        const ts = timeSeriesFor(n)
        let overlap = 0
        for (let j = 0; j < ts.length; j++) {
          if (Number.isFinite(ts[j]) && Number.isFinite(pickedTs[j])) overlap++
        }
        if (overlap < MIN_OVERLAP) continue
        const r = pearson(pickedTs, ts)
        if (Number.isFinite(r)) ranked.push({ node: n, r, overlap, ts })
      }
      if (i < nodes.length) {
        timerId = setTimeout(step, 0)
      } else {
        ranked.sort((a, b) => b.r - a.r)
        if (!cancelled) setAnalysis({ pickedTs, pickedFiniteCount, ranked })
      }
    }
    step()
    return () => {
      cancelled = true
      if (timerId != null) clearTimeout(timerId)
    }
  }, [pickedNode, snapshots, metric, data, snapshotDays, metricOf, visibleAt])

  if (!data?.nodes?.length) return null
  const allRanked = analysis?.ranked ?? []

  return (
    <div style={{ padding: `${space.md}px ${space.lg}px`, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
      {/* Title + selected word */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <div style={{ fontWeight: 600, fontSize: fontSize.base, color: theme.ink }}>Who moves with this word?</div>
        {pickedNode && analysis && analysis.pickedFiniteCount >= MIN_OVERLAP && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ color: theme.inkFaint, fontSize: 10, fontFamily: 'monospace' }}>{snapshotDays[snapshotDays.length - 1]}d</span>
            <Trajectory ts={analysis.pickedTs} compact />
            <span style={{ color: theme.inkFaint, fontSize: 10, fontFamily: 'monospace' }}>now</span>
          </span>
        )}
      </div>
      <div style={{ fontFamily: font.ui, fontSize: 14, marginBottom: 10, minHeight: 18 }}>
        {pickedNode ? (
          <>
            <strong style={{ color: theme.ink }}>{pickedNode.expression}</strong>
            <span style={{ color: theme.matchaInk, fontSize: 12, marginLeft: 6 }}>{pickedNode.reading}</span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: theme.inkSoft, fontFamily: 'inherit' }}>click a word on the canvas</span>
        )}
      </div>

      {/* Controls row — metric + window on the left, trajectory sparkline on the right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 12 }}>
        <label style={{ color: theme.inkSoft, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          metric
          <select value={metric} onChange={e => setMetric(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }}>
            {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <span style={{ color: theme.inkFaint }}>·</span>
        <span style={{ color: theme.inkSoft }}>window</span>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {Object.keys(WINDOW_PRESETS).map(Number).map(d => {
            const on = windowDays === d
            return (
              <button key={d} onClick={() => setWindowDays(d)}
                style={{
                  fontSize: 11, padding: '3px 9px', cursor: 'pointer',
                  background: on ? theme.matchaMid : 'transparent',
                  color: on ? '#fff' : theme.inkSoft,
                  border: `1px solid ${on ? theme.matchaMid : theme.border}`,
                  borderRadius: 6,
                  fontWeight: on ? 600 : 500,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                {d}d
              </button>
            )
          })}
        </span>
        {loading && <span style={{ color: theme.inkSoft }}>loading…</span>}
        {error && <span style={{ color: theme.badInk }}>error: {error}</span>}
      </div>

      {!pickedNode && (
        <div style={{ fontSize: 12, color: theme.inkSoft }}>
          Shows which other words' <b style={{ color: theme.ink }}>{metric}</b> history most closely tracks the selected word over time. Snapshots: {snapshotDays.join('d, ')}d ago + now.
        </div>
      )}
      {pickedNode && analysis && analysis.pickedFiniteCount < MIN_OVERLAP && (
        <div style={{ fontSize: 12, color: theme.inkSoft }}>
          "{pickedNode.expression}" only has {analysis.pickedFiniteCount} snapshot(s) on record — need ≥ {MIN_OVERLAP} to correlate. (Recent import?)
        </div>
      )}
      {pickedNode && analysis && analysis.pickedFiniteCount >= MIN_OVERLAP && (
        <>
          <TrajectorySection
            title="Moves together"
            hint={`sorted by correlation over last ${snapshotDays[snapshotDays.length - 1]} days`}
            rows={allRanked} color={theme.matchaMid} onPickWord={onPickWord}
            defaultDir={-1}
          />
        </>
      )}
    </div>
  )
}

// Inline trajectory sparkline. ts[0] = now, later indices = further back. We draw
// left→right going forward in time (i.e. reversed) so the rightmost point is "now".
function Trajectory({ ts, compact = false }) {
  const W = compact ? 130 : 180, H = compact ? 22 : 34, pad = 3
  const finite = ts.map((v, i) => ({ v, i })).filter(p => Number.isFinite(p.v))
  if (finite.length < 2) return <span style={{ color: theme.inkFaint, fontSize: 11, marginLeft: 6 }}>(insufficient history)</span>
  let lo = Infinity, hi = -Infinity
  for (const p of finite) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v }
  const span = Math.max(hi - lo, 1e-9)
  // Map time index (0 = now, len-1 = oldest) to x (rightmost = now, leftmost = oldest).
  const len = ts.length
  const sx = (i) => pad + ((len - 1 - i) / (len - 1)) * (W - pad * 2)
  const sy = (v) => H - pad - ((v - lo) / span) * (H - pad * 2)
  // Build polyline of finite points in chronological order (oldest → now).
  const chrono = finite.slice().sort((a, b) => b.i - a.i)
  const points = chrono.map(p => `${sx(p.i).toFixed(1)},${sy(p.v).toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} style={{ verticalAlign: 'middle', background: theme.bg, border: `1px solid ${theme.borderSoft}`, borderRadius: 3 }}>
      <polyline points={points} fill="none" stroke={theme.matchaInk} strokeWidth={1.2} />
      {chrono.map(p => (
        <circle key={p.i} cx={sx(p.i)} cy={sy(p.v)} r={1.4} fill={theme.matchaInk} />
      ))}
    </svg>
  )
}

function TrajectorySection({ title, hint, rows, color, onPickWord, defaultDir = -1 }) {
  const [sort, setSort] = useState({ col: 'corr', dir: defaultDir })
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    const cmp = TRAJ_SORTERS[sort.col] || TRAJ_SORTERS.corr
    return rows.slice().sort((a, b) => sort.dir * cmp(a, b))
  }, [rows, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  useEffect(() => { if (page > totalPages - 1) setPage(totalPages - 1) }, [page, totalPages])
  useEffect(() => { setPage(0) }, [sort, rows])

  const start = page * PAGE_SIZE
  const visible = sorted.slice(start, start + PAGE_SIZE)

  const toggleSort = (col) => {
    setSort(prev => prev.col === col
      ? { col, dir: -prev.dir }
      : { col, dir: col === 'corr' || col === 'n' ? -1 : 1 })
  }

  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, borderBottom: `1px solid ${color}33`, paddingBottom: 4, marginBottom: 5 }}>
        <span style={{ color, fontWeight: 700, fontSize: fontSize.md }}>{title}</span>
        <span style={{ color: theme.inkSoft, fontSize: fontSize.xs }}>{hint}</span>
      </div>
      <table style={{ fontFamily: font.ui, fontSize: fontSize.md, borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 52 }} />
          <col style={{ width: 78 }} />
          <col />
          <col style={{ width: 52 }} />
          <col style={{ width: 132 }} />
          <col style={{ width: 26 }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <TrajHeader col="word" label="word" sort={sort} onToggle={toggleSort} />
            <TrajHeader col="pinyin" label="pinyin" sort={sort} onToggle={toggleSort} />
            <TrajHeader col="meaning" label="meaning" sort={sort} onToggle={toggleSort} />
            <TrajHeader col="corr" label="corr" sort={sort} onToggle={toggleSort} align="right" />
            <th align="center" style={{ paddingRight: 6, whiteSpace: 'nowrap', ...trajLabelStyle }}>trajectory</th>
            <TrajHeader col="n" label="n" sort={sort} onToggle={toggleSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {visible.map(({ node, r, overlap, ts }) => (
            <tr
              key={node.id}
              onClick={() => onPickWord?.(node)}
              style={{ cursor: onPickWord ? 'pointer' : 'default', borderBottom: `1px solid ${theme.borderSoft}` }}
              onMouseEnter={(e) => { if (onPickWord) e.currentTarget.style.background = theme.matchaSoft }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <td style={{ padding: '4px 6px 4px 0', fontSize: 14, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.expression}>{node.expression}</td>
              <td style={{ padding: '4px 6px 4px 0', color: theme.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.reading}>{node.reading}</td>
              <td style={{ padding: '4px 6px 4px 0', color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.meaning}>{node.meaning}</td>
              <td align="right" style={{ paddingRight: 6, color: r >= 0 ? theme.goodInk : theme.badInk, fontWeight: Math.abs(r) > 0.7 ? 700 : 400, ...num }}>
                {(r >= 0 ? '+' : '') + r.toFixed(2)}
              </td>
              <td align="center" style={{ paddingRight: 6 }}><Trajectory ts={ts} compact /></td>
              <td align="right" style={{ color: theme.inkFaint, ...num }}>{overlap}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
          <PageNav page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  )
}

function TrajHeader({ col, label, sort, onToggle, align = 'left' }) {
  const active = sort.col === col
  return (
    <th
      style={{
        padding: '4px 6px 4px 0', textAlign: align, cursor: 'pointer',
        ...trajLabelStyle,
        color: active ? theme.ink : theme.inkSoft,
        userSelect: 'none', whiteSpace: 'nowrap',
      }}
      onClick={() => onToggle(col)}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = theme.ink }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = theme.inkSoft }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: 3, color: theme.matchaMid, display: 'inline-flex', verticalAlign: 'middle' }}>
          {sort.dir > 0 ? <Icon.ChevronUp size={12} /> : <Icon.ChevronDown size={12} />}
        </span>
      )}
    </th>
  )
}

const CoMoverExplorer = memo(CoMoverExplorerInner)
export default CoMoverExplorer

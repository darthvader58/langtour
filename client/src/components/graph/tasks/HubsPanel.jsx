import { memo, useMemo, useState, useEffect } from 'react'
import PageNav from '../PageNav.jsx'
import { useSettings } from '../../../utils/settings.js'
import { theme, space, radius, fontSize, font, num } from '../../../theme.js'
import { Icon } from '../../ui/Icon.jsx'

// Hubs viewer — ranks every word by the `hubness` metric (how many other words list
// this one as a top-10 neighbor). Paginated; columns are click-to-sort.
//
// Mastery badge (fraction of the hub's 30 nearest PC-neighbors with R ≥ threshold) is
// computed only for the visible page — doing all ~7k hubs would be too slow — so
// sorting by mastery isn't supported. Clicking a row focuses the word.
const PAGE_SIZE = 20

const SORTERS = {
  word:    (a, b) => a.expression.localeCompare(b.expression),
  pinyin:  (a, b) => (a.reading || '').localeCompare(b.reading || ''),
  meaning: (a, b) => (a.meaning || '').localeCompare(b.meaning || ''),
  hubs:    (a, b) => (a.hubness || 0) - (b.hubness || 0),
}

function HubsPanelInner({ data, onPickWord, getMetric, isVisible }) {
  const metricOf = getMetric || ((n, k) => Number(n?.[k]))
  const visibleAt = isVisible || (() => true)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState({ col: 'hubs', dir: -1 })
  // Retrievability threshold for the "well-known" mastery tag. Sourced from the
  // app-wide settings store (configured on the #settings page under "Desired
  // attention") so changes persist across reloads and apply consistently.
  const { desiredAttention: masteryThreshold } = useSettings()

  useEffect(() => { setPage(0) }, [sort])

  const allHubs = useMemo(() => {
    if (!data?.nodes?.length) return []
    const cmp = SORTERS[sort.col] || SORTERS.hubs
    // Drop nodes that don't exist at the current timeline date so the Hubs list
    // reflects the deck as it was then.
    const pool = data.nodes.filter((n) => visibleAt(n))
    return pool.sort((a, b) => sort.dir * cmp(a, b))
  }, [data, sort, visibleAt])

  const totalPages = Math.max(1, Math.ceil(allHubs.length / PAGE_SIZE))
  useEffect(() => { if (page > totalPages - 1) setPage(totalPages - 1) }, [page, totalPages])

  const start = page * PAGE_SIZE
  // Memoize `visible` — previously `allHubs.slice()` ran on every render, producing
  // a new array ref each time and re-triggering the ~150 ms hubMastery distance loop
  // below.
  const visible = useMemo(
    () => allHubs.slice(start, start + PAGE_SIZE),
    [allHubs, start],
  )

  // Mastery badge: fraction of each visible hub's 30 nearest neighbors that have
  // retrievability >= threshold. Cheaper version — iterates pcScores as Float32-ish values
  // directly out of the node objects, no per-node .slice() allocation. Still 20 hubs
  // × N nodes × K, but the inner loop is tight and allocates nothing.
  const hubMastery = useMemo(() => {
    if (!data?.nodes?.length || visible.length === 0) return {}
    const K = data.nodes[0].pcScores?.length || 0
    const nodes = data.nodes
    const N = nodes.length
    const out = {}
    // Reusable index buffer for the top-30 partial selection.
    const dArr = new Float64Array(N)
    for (const hub of visible) {
      const hubPc = hub.pcScores || []
      for (let i = 0; i < N; i++) {
        const n = nodes[i]
        if (n.id === hub.id) { dArr[i] = 0; continue }
        const pc = n.pcScores || []
        let s = 0
        for (let k = 0; k < K; k++) { const dk = (hubPc[k] || 0) - (pc[k] || 0); s += dk * dk }
        dArr[i] = s
      }
      // Partial-select top-30 via a simple max-heap substitute: find the 30 smallest.
      // Simpler O(N·30) scan: keep indices, swap when better. For N=10k·30 = 300k
      // comparisons — much cheaper than a full sort.
      const TOP = 30
      const topIdx = new Int32Array(TOP)
      const topD = new Float64Array(TOP)
      for (let t = 0; t < TOP; t++) topD[t] = Infinity
      let worstAt = 0
      for (let i = 0; i < N; i++) {
        const d = dArr[i]
        if (d < topD[worstAt]) {
          topIdx[worstAt] = i
          topD[worstAt] = d
          // Recompute worst slot
          let w = 0
          for (let t = 1; t < TOP; t++) if (topD[t] > topD[w]) w = t
          worstAt = w
        }
      }
      let wellKnown = 0, considered = 0
      for (let t = 0; t < TOP; t++) {
        const neighbor = nodes[topIdx[t]]
        const r = metricOf(neighbor, 'retrievability')
        if (Number.isFinite(r)) { considered++; if (r >= masteryThreshold) wellKnown++ }
      }
      out[hub.id] = { wellKnownFraction: considered ? wellKnown / considered : 0 }
    }
    return out
  }, [visible, data, metricOf, masteryThreshold])

  const toggleSort = (col) => {
    setSort(prev => prev.col === col
      ? { col, dir: -prev.dir }
      : { col, dir: col === 'word' || col === 'pinyin' || col === 'meaning' ? 1 : -1 })
  }

  if (!allHubs.length) return null
  return (
    <div style={{
      fontSize: fontSize.md,
      background: theme.panel,
      border: `1px solid ${theme.border}`,
      borderRadius: radius.lg,
      overflow: 'hidden',
      // Fill the (height-clamped) rail and lay out as a column: pinned header,
      // a scrollable table body, pinned pagination — so a clamped rail never
      // slices a row mid-height or hides the page controls.
      height: '100%',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: space.md,
        flexWrap: 'wrap',
        padding: `${space.md}px ${space.lg}px`,
        flexShrink: 0,
      }}>
        <strong style={{ fontSize: fontSize.base, color: theme.ink, fontWeight: 600 }}>Hubs</strong>
        <div style={{ color: theme.inkSoft, fontSize: fontSize.sm }}>
          how many words list it as a top-10 neighbor · mastery = tribe R ≥ {masteryThreshold.toFixed(2)}
          <span style={{ marginLeft: space.sm }}>(<a href="#settings" style={{ color: theme.matchaDeep }}>change</a>)</span>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `0 ${space.lg}px` }}>
        <table style={{
          fontFamily: font.ui,
          fontSize: fontSize.md,
          borderCollapse: 'collapse',
          width: '100%',
          tableLayout: 'fixed',
        }}>
          <colgroup>
            <col style={{ width: 26 }} />
            <col style={{ width: 46 }} />
            <col style={{ width: 68 }} />
            <col />
            <col style={{ width: 38 }} />
            <col style={{ width: 78 }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: 'left', color: theme.inkSoft, borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ padding: `${space.sm}px ${space.xs}px`, ...labelStyle, position: 'sticky', top: 0, background: theme.panel, zIndex: 1 }}>#</th>
              <SortableHeader col="word" label="word" sort={sort} onToggle={toggleSort} sticky />
              <SortableHeader col="pinyin" label="pinyin" sort={sort} onToggle={toggleSort} sticky />
              <SortableHeader col="meaning" label="meaning" sort={sort} onToggle={toggleSort} sticky />
              <SortableHeader col="hubs" label="hubs" sort={sort} onToggle={toggleSort} align="right" sticky />
              <th style={{ padding: `${space.sm}px ${space.xs}px`, textAlign: 'right', ...labelStyle, position: 'sticky', top: 0, background: theme.panel, zIndex: 1 }}>mastery</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((h, i) => {
              const pct = hubMastery[h.id]?.wellKnownFraction ?? 0
              return (
                <tr
                  key={h.id}
                  onClick={() => onPickWord?.(h)}
                  style={{ borderBottom: `1px solid ${theme.borderSoft}`, cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = theme.matchaSoft }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ padding: `${space.sm}px ${space.xs}px`, color: theme.inkFaint, ...num }}>{start + i + 1}</td>
                  <td
                    style={{
                      padding: `${space.sm}px ${space.xs}px`,
                      fontWeight: 600,
                      color: theme.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={h.expression}
                  >{h.expression}</td>
                  <td style={{ padding: `${space.sm}px ${space.xs}px`, color: theme.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.reading}>{h.reading}</td>
                  <td style={{ padding: `${space.sm}px ${space.xs}px`, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.meaning}>{h.meaning}</td>
                  <td style={{ padding: `${space.sm}px ${space.xs}px`, color: theme.inkSoft, textAlign: 'right', ...num }}>{h.hubness}</td>
                  <td style={{ padding: `${space.sm}px ${space.xs}px` }}>
                    <MasteryMeter pct={pct} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: `${space.sm}px ${space.lg}px`, borderTop: `1px solid ${theme.borderSoft}`, flexShrink: 0 }}>
        <PageNav page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  )
}

// Right-aligned mastery value, hue-keyed by how well-known the hub's tribe is.
function MasteryMeter({ pct }) {
  const ink = pct >= 0.5 ? theme.goodInk : pct >= 0.25 ? theme.goldInk : theme.badInk
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
      <span style={{ color: ink, fontSize: fontSize.sm, minWidth: 30, textAlign: 'right', ...num }}>
        {(pct * 100).toFixed(0)}%
      </span>
    </div>
  )
}

function SortableHeader({ col, label, sort, onToggle, align = 'left', sticky = false }) {
  const active = sort.col === col
  return (
    <th
      style={{
        padding: `${space.sm}px ${space.xs}px`,
        textAlign: align,
        cursor: 'pointer',
        ...labelStyle,
        color: active ? theme.ink : theme.inkSoft,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...(sticky ? { position: 'sticky', top: 0, background: theme.panel, zIndex: 1 } : {}),
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

const labelStyle = {
  fontSize: fontSize.xs,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: theme.inkSoft,
}

const HubsPanel = memo(HubsPanelInner)
export default HubsPanel

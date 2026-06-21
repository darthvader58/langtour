import { memo, useEffect, useMemo, useState } from 'react'
import PageNav from '../PageNav.jsx'
import { runCosineSims } from '../workerBridge.js'
import { theme, space, radius, fontSize, font, num } from '../../../theme.js'
import { Icon } from '../../ui/Icon.jsx'

const panelLabelStyle = {
  fontSize: fontSize.xs,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: theme.inkSoft,
}

const WORDLIST_PAGE_SIZE = 10

// Explore task panel: word card + mnemonic anchors + nearby unknowns + why-similar PC
// decomposition. Shown when a focus node is active. Answers: "help me understand this word".
//
// Mnemonic anchors = top similar words with high retrievability + high stability. These are
// the "I already know this" neighbors you can link new vocabulary to.
//
// Nearby unknowns = top similar words with low retrievability or unreviewed. Candidates
// to study next once you've anchored this word.
function ExploreTaskInner({
  data,
  focusNode,
  onPickWord,
  getMetric,
  isVisible,
  anchorsTitle = 'Mnemonic anchors',
  anchorsSubtitle = 'similar words you already know — link new vocab to these',
  unknownsTitle = 'Nearby unknowns',
  unknownsSubtitle = "similar words you're still learning — candidates for next session",
  mode = 'developer',
}) {
  // Fallbacks so this component can be used outside GraphView without a timeline.
  const metricOf = getMetric || ((n, k) => Number(n?.[k]))
  const visibleAt = isVisible || (() => true)
  // Similarity-sorted neighborhood of the focus — computed in the graph worker so the
  // O(N·K) cosine pass + O(N log N) sort don't block the main thread on focus change.
  // neighbors is a plain array of { node, sim } sorted descending by cosine similarity.
  const [neighbors, setNeighbors] = useState([])
  useEffect(() => {
    if (!focusNode || !data?.nodes?.length) { setNeighbors([]); return }
    const focusIdx = data.nodes.findIndex(n => n.id === focusNode.id)
    if (focusIdx < 0) { setNeighbors([]); return }
    let cancelled = false
    runCosineSims(focusIdx).then(({ sortedIdx, sortedSims }) => {
      if (cancelled) return
      const out = new Array(sortedIdx.length - 1)
      let w = 0
      for (let i = 0; i < sortedIdx.length; i++) {
        const idx = sortedIdx[i]
        if (idx === focusIdx) continue
        const node = data.nodes[idx]
        // Drop neighbors that aren't visible at the current timeline date.
        if (!visibleAt(node)) continue
        out[w++] = { node, sim: sortedSims[i] }
      }
      out.length = w
      setNeighbors(out)
    })
    return () => { cancelled = true }
  }, [focusNode, data])

  const mnemonicAnchors = useMemo(() => {
    return neighbors.filter((x) => {
      const r = metricOf(x.node, 'retrievability')
      const s = metricOf(x.node, 'stability')
      return r >= 0.8 && s >= 7
    })
  }, [neighbors, metricOf])

  const nearbyUnknowns = useMemo(() => {
    return neighbors.filter((x) => {
      const r = metricOf(x.node, 'retrievability')
      // "Unreviewed at this date": at now, that's !last_review_at; under the
      // timeline override we treat a missing-but-visible historical metric the
      // same way (node exists but had no review yet by the target date).
      return r < 0.5 || !Number.isFinite(r) || !x.node.last_review_at
    })
  }, [neighbors, metricOf])

  if (!focusNode) {
    return (
      <div style={{ fontSize: fontSize.sm, color: theme.inkSoft, padding: `${space.md}px ${space.lg}px` }}>
        {mode === 'user'
          ? 'Click any word in the map to see what you can build on next.'
          : 'Click any word in the graph to explore its semantic neighborhood.'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'stretch' }}>
      <div style={{ fontSize: fontSize.sm, padding: `${space.md}px ${space.lg}px`, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: radius.lg }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: theme.ink }}>{focusNode.expression}</div>
        <div style={{ color: theme.matchaInk, fontFamily: font.ui }}>{focusNode.reading}</div>
        <div style={{ color: theme.ink, marginBottom: '0.4rem' }}>{focusNode.meaning}</div>
        {(() => {
          // Timeline-aware metric readout. Retrievability/stability/difficulty come
          // from the historical override when a past date is selected; reps/lapses/
          // state_label / last_review_at aren't in the /api/graph/history payload so
          // they stay at their live values (and `—` if the word didn't exist yet).
          const r = metricOf(focusNode, 'retrievability')
          const s = metricOf(focusNode, 'stability')
          const d = metricOf(focusNode, 'difficulty')
          const fmt = (v, suffix = '', digits = 2) => Number.isFinite(v) ? v.toFixed(digits) + suffix : '—'
          const existsNow = visibleAt(focusNode)
          return (
            <div style={{ color: theme.inkSoft, lineHeight: 1.5, ...num }}>
              <div>{mode === 'user' ? 'status' : 'state'}: <strong style={{ color: theme.ink }}>{existsNow ? focusNode.state_label : '—'}</strong></div>
              <div>{mode === 'user' ? 'memory strength' : 'retrievability'}: <strong style={{ color: theme.ink }}>{Number.isFinite(r) ? (r * 100).toFixed(0) + '%' : '—'}</strong> · stability: <strong style={{ color: theme.ink }}>{fmt(s, 'd', 1)}</strong></div>
              <div>difficulty: <strong style={{ color: theme.ink }}>{fmt(d)}</strong> · reps: <strong style={{ color: theme.ink }}>{existsNow ? focusNode.reps : '—'}</strong> · lapses: <strong style={{ color: theme.ink }}>{existsNow ? focusNode.lapses : '—'}</strong></div>
              {existsNow && focusNode.last_review_at && (
                <div>last review: <strong style={{ color: theme.ink }}>{new Date(focusNode.last_review_at).toLocaleDateString()}</strong></div>
              )}
            </div>
          )
        })()}
      </div>

      <WordList
        title={anchorsTitle}
        subtitle={anchorsSubtitle}
        entries={mnemonicAnchors}
        onPick={onPickWord}
        tagColor={theme.goodInk}
        emptyText="No well-known neighbors yet."
      />

      <WordList
        title={unknownsTitle}
        subtitle={unknownsSubtitle}
        entries={nearbyUnknowns}
        onPick={onPickWord}
        tagColor={theme.goldInk}
        emptyText="No unknown neighbors found."
      />

    </div>
  )
}

// Entries are `{node, sim}` — no per-render spread-copy of the node's fields.
const WORDLIST_SORTERS = {
  word:    (a, b) => a.node.expression.localeCompare(b.node.expression),
  pinyin:  (a, b) => (a.node.reading || '').localeCompare(b.node.reading || ''),
  meaning: (a, b) => (a.node.meaning || '').localeCompare(b.node.meaning || ''),
  sim:     (a, b) => a.sim - b.sim,
}

function WordList({ title, subtitle, entries, onPick, tagColor, emptyText }) {
  const [sort, setSort] = useState({ col: 'sim', dir: -1 })
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    const cmp = WORDLIST_SORTERS[sort.col] || WORDLIST_SORTERS.sim
    return entries.slice().sort((a, b) => sort.dir * cmp(a, b))
  }, [entries, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / WORDLIST_PAGE_SIZE))
  useEffect(() => { if (page > totalPages - 1) setPage(totalPages - 1) }, [page, totalPages])
  useEffect(() => { setPage(0) }, [sort, entries])

  const start = page * WORDLIST_PAGE_SIZE
  const visible = sorted.slice(start, start + WORDLIST_PAGE_SIZE)

  const toggleSort = (col) => {
    setSort(prev => prev.col === col
      ? { col, dir: -prev.dir }
      : { col, dir: col === 'sim' ? -1 : 1 })
  }

  return (
    <div style={{ fontSize: fontSize.sm, padding: `${space.md}px ${space.lg}px`, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
      <div style={{ fontWeight: 600, fontSize: fontSize.base, color: theme.ink, marginBottom: '0.1rem' }}>{title}</div>
      {subtitle && <div style={{ color: theme.inkSoft, fontSize: fontSize.sm, marginBottom: '0.4rem' }}>{subtitle}</div>}
      {entries.length === 0 ? (
        <div style={{ color: theme.inkSoft }}>{emptyText}</div>
      ) : (
        <table style={{ fontFamily: font.ui, fontSize: fontSize.md, borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 56 }} />
            <col style={{ width: 110 }} />
            <col />
            <col style={{ width: 56 }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: 'left', color: theme.inkSoft, borderBottom: `1px solid ${theme.border}` }}>
              <WordListHeader col="word" label="word" sort={sort} onToggle={toggleSort} />
              <WordListHeader col="pinyin" label="pinyin" sort={sort} onToggle={toggleSort} />
              <WordListHeader col="meaning" label="meaning" sort={sort} onToggle={toggleSort} />
              <WordListHeader col="sim" label="sim" sort={sort} onToggle={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ node: n, sim }) => (
              <tr
                key={n.id}
                onClick={() => onPick?.(n)}
                style={{ borderBottom: `1px solid ${theme.borderSoft}`, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = theme.matchaSoft }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ padding: `${space.sm}px ${space.sm}px`, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.expression}>{n.expression}</td>
                <td style={{ padding: `${space.sm}px ${space.sm}px`, color: theme.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.reading}>{n.reading}</td>
                <td style={{ padding: `${space.sm}px ${space.sm}px`, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.meaning}>{n.meaning}</td>
                <td style={{ padding: `${space.sm}px ${space.sm}px`, color: tagColor, textAlign: 'right', ...num }}>{sim.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <PageNav page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  )
}

function WordListHeader({ col, label, sort, onToggle, align = 'left' }) {
  const active = sort.col === col
  return (
    <th
      style={{
        padding: `${space.sm}px ${space.sm}px`, textAlign: align, cursor: 'pointer',
        ...panelLabelStyle,
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

const ExploreTask = memo(ExploreTaskInner)
export default ExploreTask

import { useMemo } from 'react'

// Overview task panel: deck-health card + mini-histograms + top-10-at-risk words.
// Answers: "how is my deck doing?"
export default function OverviewTask({ data, onPickWord }) {
  const stats = useMemo(() => {
    if (!data?.nodes?.length) return null
    const nodes = data.nodes
    const retrievabilities = nodes.map(n => n.retrievability).filter(Number.isFinite)
    const stabilities = nodes.map(n => n.stability).filter(Number.isFinite)
    const now = new Date()
    const dueToday = nodes.filter(n => {
      if (!n.due_at) return false
      const d = new Date(n.due_at)
      return d.getTime() <= now.getTime()
    }).length
    const leeches = nodes.filter(n => (n.lapses || 0) >= 3).length
    const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const byState = { new: 0, learning: 0, review: 0, relearning: 0 }
    for (const n of nodes) {
      const k = n.state_label
      if (k in byState) byState[k]++
    }
    return {
      total: nodes.length,
      dueToday,
      leeches,
      avgRetrievability: mean(retrievabilities),
      avgStability: mean(stabilities),
      byState,
    }
  }, [data])

  // Top 10 most-at-risk: lowest retrievability (only counting words that've been reviewed).
  const atRisk = useMemo(() => {
    if (!data?.nodes?.length) return []
    return data.nodes
      .filter(n => n.last_review_at && Number.isFinite(n.retrievability))
      .sort((a, b) => a.retrievability - b.retrievability)
      .slice(0, 10)
  }, [data])

  if (!stats) return null

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '0.75rem' }}>
      <div style={{ fontSize: 12, lineHeight: 1.6, padding: '10px 14px', background: '#202125', border: '1px solid #2c2d31', borderRadius: 6, minWidth: 240 }}>
        <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>Deck health</div>
        <div>total words: <strong>{stats.total}</strong></div>
        <div>due today: <strong style={{ color: stats.dueToday > 0 ? '#d97706' : '#333' }}>{stats.dueToday}</strong></div>
        <div>leeches (≥3 lapses): <strong style={{ color: stats.leeches > 0 ? '#ef4444' : '#333' }}>{stats.leeches}</strong></div>
        <div>avg retrievability: <strong style={{ color: '#10b981' }}>{(stats.avgRetrievability * 100).toFixed(1)}%</strong></div>
        <div>avg stability: <strong>{stats.avgStability.toFixed(1)}</strong> days</div>
        <div style={{ marginTop: '0.4rem' }}>
          state: {Object.entries(stats.byState).map(([k, v]) => (
            <span key={k} style={{ marginRight: '0.5rem' }}>{k}: <strong>{v}</strong></span>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, padding: '10px 14px', background: '#202125', border: '1px solid #2c2d31', borderRadius: 6, minWidth: 320 }}>
        <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>At-risk words (lowest retrievability)</div>
        {atRisk.length === 0 ? (
          <div style={{ color: '#9c9ca4' }}>No reviewed words yet.</div>
        ) : (
          <table style={{ fontFamily: 'monospace', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {atRisk.map((n, i) => (
                <tr
                  key={n.id}
                  onClick={() => onPickWord?.(n)}
                  style={{ borderBottom: '1px solid #2c2d31', cursor: 'pointer' }}
                >
                  <td style={{ padding: '2px 8px', color: '#8b8b92', width: 24 }}>{i + 1}</td>
                  <td style={{ padding: '2px 8px', fontWeight: 'bold' }}>{n.expression}</td>
                  <td style={{ padding: '2px 8px', color: '#9c9ca4' }}>{n.reading}</td>
                  <td style={{ padding: '2px 8px', color: '#dcdde0', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.meaning}</td>
                  <td style={{ padding: '2px 8px', color: '#ef4444', textAlign: 'right' }}>{(n.retrievability * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

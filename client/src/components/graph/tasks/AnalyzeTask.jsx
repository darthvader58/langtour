import HubsPanel from './HubsPanel.jsx'
import CoMoverExplorer from './CoMoverExplorer.jsx'

// Analyze task panel. Two tools:
//   1. HubsPanel       — top-10 hubs with mastery badges.
//   2. CoMoverExplorer — for the currently-focused word, which other words' learning
//                        history most closely tracks it over time.
export default function AnalyzeTask({ data, focusNode, onPickWord }) {
  if (!data?.nodes?.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <HubsPanel data={data} onPickWord={onPickWord} />
      <CoMoverExplorer data={data} focusNode={focusNode} onPickWord={onPickWord} />
    </div>
  )
}

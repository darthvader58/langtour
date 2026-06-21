// Task tabs. Top-of-page selector that sets the active task; each task re-seeds the
// projection, color, overlays, and task panel when entered.

const TASKS = [
  { id: 'overview', label: 'Overview', hint: 'how is my deck doing?' },
  { id: 'review',   label: 'Review',   hint: 'what should I study next?' },
  { id: 'explore',  label: 'Explore',  hint: 'help me understand this word' },
  { id: 'analyze',  label: 'Analyze',  hint: 'what do the metrics and PC axes mean?' },
]

export default function TaskBar({ activeTask, onTaskChange, searchValue, onSearchChange, onSearchSubmit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
      {TASKS.map((t) => (
        <button
          key={t.id}
          onClick={() => onTaskChange(t.id)}
          title={t.hint}
          style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 4,
            border: '1px solid ' + (activeTask === t.id ? '#60a5fa' : '#ddd'),
            background: activeTask === t.id ? '#23233a' : '#202125',
            fontWeight: activeTask === t.id ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          {t.label}
        </button>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); onSearchSubmit?.(searchValue) }} style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
        <input
          type="search"
          placeholder="🔍 search word / pinyin / meaning…"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 12, padding: '3px 6px', width: 260 }}
        />
      </form>
    </div>
  )
}

export { TASKS }

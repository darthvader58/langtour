// Compact page navigator: clickable numeric indices with smart ellipsis.
// Renders e.g. ◀ 1 … 5 6 7 … 24 ▶ for a large page count. All visible numbers are
// buttons that jump straight to that page.
import { theme, radius, fontSize, font, num } from '../../theme.js'
import { Icon } from '../ui/Icon.jsx'

export default function PageNav({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  const pages = pageRange(page, totalPages)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <NavBtn onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} icon>
        <Icon.ChevronLeft size={14} />
      </NavBtn>
      {pages.map((p, i) =>
        p === null
          ? <span key={`e${i}`} style={{ color: theme.inkFaint, padding: '0 2px', fontFamily: font.ui, fontSize: fontSize.xs }}>…</span>
          : <NavBtn key={p} onClick={() => onChange(p)} active={p === page}>{p + 1}</NavBtn>
      )}
      <NavBtn onClick={() => onChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} icon>
        <Icon.ChevronRight size={14} />
      </NavBtn>
    </span>
  )
}

function NavBtn({ onClick, disabled, active, icon, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: fontSize.xs,
      padding: icon ? '4px 5px' : '3px 7px',
      minWidth: 24,
      height: 26,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: disabled ? 'default' : 'pointer',
      background: active ? theme.matchaMid : 'transparent',
      color: active ? '#fff' : (disabled ? theme.inkFaint : theme.inkSoft),
      border: `1px solid ${active ? theme.matchaMid : theme.border}`,
      borderRadius: radius.sm,
      fontWeight: active ? 600 : 500,
      fontFamily: font.ui,
      ...num,
    }}>{children}</button>
  )
}

// Given the current zero-indexed `page` and `totalPages`, return the array of page
// numbers to render. Null entries mean "ellipsis". Always shows first + last + current
// + its neighbors.
function pageRange(page, totalPages) {
  const out = new Set([0, totalPages - 1, page, page - 1, page + 1])
  const sorted = [...out].filter(p => p >= 0 && p < totalPages).sort((a, b) => a - b)
  const withGaps = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) withGaps.push(null)
    withGaps.push(sorted[i])
  }
  return withGaps
}

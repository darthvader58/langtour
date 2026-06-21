import { useState, useEffect, useRef, useMemo } from 'react'
import AxisPad from './AxisPad.jsx'
import { AXIS_PAD_CARD } from './constants.js'
import { theme, radius } from '../../theme.js'
import { Icon } from '../ui/Icon.jsx'

const PAD_SIZE = AXIS_PAD_CARD
const PAD_GAP = 6
// Smallest square pad we'll shrink to in order to fit one more on the page. Below this the
// canvas + readout text get too cramped, so we'd rather paginate.
const MIN_PAD = 92

// Small icon pager button, themed to match the rest of the graph chrome. Indigo
// tint on hover (interactive cue), muted when disabled. Declared before the grid
// so React Fast Refresh sees it defined ahead of its use.
function PagerButton({ onClick, disabled, label, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 20, padding: 0,
        background: 'transparent',
        color: disabled ? theme.inkFaint : theme.inkSoft,
        border: `1px solid ${theme.border}`, borderRadius: radius.sm,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'color 120ms ease, border-color 120ms ease',
      }}
      onMouseEnter={(e) => { if (disabled) return; e.currentTarget.style.color = theme.matchaInk; e.currentTarget.style.borderColor = theme.matchaDeep }}
      onMouseLeave={(e) => { e.currentTarget.style.color = disabled ? theme.inkFaint : theme.inkSoft; e.currentTarget.style.borderColor = theme.border }}
    >
      {children}
    </button>
  )
}

// Grid of AxisPads — always shows all available PCs, paginated to fit the container height.
// Each pad edits one row of the K×3 projection matrix W: [wx[k], wy[k], wz[k]].
export default function AxisPadGrid({
  W, setW,
  axisCount, // total PCs available (drives total page count)
  eigenvalues = [],
}) {
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(6)
  const [cardSize, setCardSize] = useState(PAD_SIZE)
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const navRef = useRef(null)

  // Measure container + chrome, then pick the pad COUNT and a uniform SQUARE pad size so
  // the visible pads exactly fill the available vertical space (no dead gap below the last
  // pad). Cards stay square: side = (avail - gaps) / n, capped to PAD_SIZE so they never get
  // wider than the column. We choose the largest n whose square side stays within
  // [MIN_PAD, PAD_SIZE] — that's the count that fills the height without shrinking too far.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const total = el.getBoundingClientRect().height
      const headerH = headerRef.current?.getBoundingClientRect().height ?? 0
      const navH = navRef.current?.getBoundingClientRect().height ?? 0
      const avail = total - headerH - navH
      // Largest n that still leaves each square pad at least MIN_PAD tall.
      let n = Math.max(1, Math.floor((avail + PAD_GAP) / (MIN_PAD + PAD_GAP)))
      // Square side that fills the height with n pads, never exceeding PAD_SIZE.
      const side = Math.min(PAD_SIZE, Math.floor((avail - (n - 1) * PAD_GAP) / n))
      setPerPage(prev => prev === n ? prev : n)
      setCardSize(prev => prev === side ? prev : side)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (headerRef.current) ro.observe(headerRef.current)
    if (navRef.current) ro.observe(navRef.current)
    return () => ro.disconnect()
  }, [])

  const totalPages = Math.max(1, Math.ceil(axisCount / perPage))
  useEffect(() => { if (page > totalPages - 1) setPage(totalPages - 1) }, [page, totalPages])

  // Stable setter ref so updateHandlers below can be useMemo'd without depending on setW.
  const setWRef = useRef(setW); setWRef.current = setW

  // One stable onChange per axis index. Each handler writes a row of W.
  const updateHandlers = useMemo(() => {
    const handlers = new Array(axisCount)
    for (let i = 0; i < axisCount; i++) {
      const idx = i
      handlers[idx] = (wx, wy, wz) => {
        setWRef.current(prev => {
          const nwx = prev.wx.slice(); nwx[idx] = wx
          const nwy = prev.wy.slice(); nwy[idx] = wy
          const nwz = prev.wz.slice(); nwz[idx] = wz
          return { wx: nwx, wy: nwy, wz: nwz }
        })
      }
    }
    return handlers
  }, [axisCount])

  const start = page * perPage
  const end = Math.min(axisCount, start + perPage)

  // Canvas grows with the square card size. Reserve ~30px for the label + readout text
  // rows and padding; the width interior (cardSize - 14) is the harder horizontal cap.
  const svgSize = Math.max(60, Math.min(cardSize - 14, cardSize - 30))
  // (cardSize - 30 is always the binding constraint, but keep both caps explicit.)

  return (
    <div ref={containerRef} style={{ width: AXIS_PAD_CARD, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
      <div ref={headerRef} style={{ width: '100%' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: theme.inkSoft, marginBottom: 10, textAlign: 'center',
        }}>axis controls</div>
      </div>
      {/* Even vertical rhythm — a fixed gap between pads (not space-between, which
          stretches the gaps unpredictably as the page count changes). */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: PAD_GAP, minHeight: 0 }}>
        {Array.from({ length: end - start }).map((_, k) => {
          const i = start + k
          return (
            <AxisPad
              key={i}
              index={i}
              wx={W.wx[i] || 0}
              wy={W.wy[i] || 0}
              wz={W.wz[i] || 0}
              eigenvalue={eigenvalues[i]}
              onChange={updateHandlers[i]}
              cardSize={cardSize}
              svgSize={svgSize}
            />
          )
        })}
      </div>
      {totalPages > 1 && (
        <div ref={navRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, width: '100%', paddingTop: 10, marginTop: 2 }}>
          <PagerButton onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} label="previous PCs">
            <Icon.ChevronLeft size={12} />
          </PagerButton>
          <span style={{ color: theme.inkSoft, fontFamily: 'monospace', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
            {page + 1}/{totalPages}
          </span>
          <PagerButton onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} label="next PCs">
            <Icon.ChevronRight size={12} />
          </PagerButton>
        </div>
      )}
    </div>
  )
}

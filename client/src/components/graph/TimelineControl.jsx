import { memo, useEffect, useRef, useState } from 'react'

// Horizontal time-travel slider. `daysAgo = 0` means "now" — the app uses the live
// values straight off the graph payload. Any other value fetches a historical
// snapshot (/api/graph/history?date=…) and overrides retrievability / stability /
// difficulty for coloring + the legend. Connectivity / density / hubness don't
// have history so they stay at their current values regardless of slider position.
//
// Visual style ports the Spotify-style rainbow seek slider from the music
// TransportBar (GradientSeekSlider): a red→yellow→green track that is revealed
// from the left as you approach "now", masked by a dark overlay for the part
// that sits in the past. "More rainbow revealed" == "closer to now".

const DEFAULT_MAX_DAYS = 365
const MS_PER_DAY = 24 * 60 * 60 * 1000

function formatDateLabel(daysAgo) {
  if (daysAgo === 0) return 'now'
  const d = new Date(Date.now() - daysAgo * MS_PER_DAY)
  const today = new Date()
  const sameYear = d.getFullYear() === today.getFullYear()
  const fmt = sameYear
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  return fmt + ' (' + daysAgo + 'd ago)'
}

// The rainbow track + dark reveal mask + grow-on-hover thumb. Mirrors the music
// player's GradientSeekSlider exactly: red→yellow→green laid out left→right, the
// dark mask covers the *unrevealed* portion on the RIGHT. "Now" is the right end,
// so daysAgo === 0 reveals the whole rainbow with the thumb pinned to the right.
function RainbowTimeSlider({ daysAgo, maxDays, onChange }) {
  const containerRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)

  const safeMax = Math.max(maxDays || 0, 1)
  const safeDaysAgo = Math.max(Math.min(daysAgo || 0, safeMax), 0)
  // 100% revealed at "now" (daysAgo === 0), 0% at the far past (daysAgo === maxDays).
  const revealedPct = ((safeMax - safeDaysAgo) / safeMax) * 100
  const active = dragging || hovered
  const thumbSize = active ? 16 : 12

  const updateFromEvent = (e) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    // Left edge = oldest, right edge = now. pct (revealed-fraction) → daysAgo.
    onChange(Math.round((1 - pct) * safeMax))
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => updateFromEvent(e)
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging, safeMax, onChange])

  const handleKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.min(safeMax, safeDaysAgo + 1)) // left = further into the past
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.max(0, safeDaysAgo - 1)) // right = toward now
    }
  }

  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label="time"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeDaysAgo}
      aria-valuetext={formatDateLabel(safeDaysAgo)}
      tabIndex={0}
      onKeyDown={handleKey}
      onMouseDown={(e) => { setDragging(true); updateFromEvent(e) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={(e) => { setDragging(true); updateFromEvent(e) }}
      style={{
        position: 'relative',
        flex: 1,
        height: 6,
        borderRadius: 10,
        cursor: 'pointer',
        background: 'linear-gradient(90deg, rgba(255,0,0,1) 0%, rgba(255,234,0,1) 50%, rgba(0,255,50,1) 100%)',
        overflow: 'visible',
      }}
    >
      {/* Dark mask over the unrevealed past portion on the RIGHT (toward older dates). */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: `${100 - revealedPct}%`,
          background: 'rgba(0, 0, 0, 0.9)',
          borderRadius: '0 10px 10px 0',
          transition: dragging ? 'none' : 'width 80ms linear',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: -thumbSize / 2,
            top: '50%',
            transform: 'translateY(-50%)',
            width: thumbSize,
            height: thumbSize,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 6px rgba(0,0,0,0.5)',
            transition: 'width 120ms ease, height 120ms ease, left 120ms ease, box-shadow 120ms ease',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}

function TimelineControlInner({
  daysAgo, onChange, maxDays = DEFAULT_MAX_DAYS, label = 'time',
  // Theme overrides so dark pages can reuse this control
  labelColor = '#555', activeColor = '#2563eb', style = null,
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 12, fontFamily: 'monospace',
      padding: '6px 10px',
      borderTop: '1px solid #2c2d31',
      marginTop: 6, paddingTop: 8,
      ...style,
    }}>
      <span style={{ color: labelColor, fontWeight: 'bold', flexShrink: 0 }}>{label}</span>
      <RainbowTimeSlider daysAgo={daysAgo} maxDays={maxDays} onChange={onChange} />
      {/* Fixed-width, non-bold, tabular digits so the label never reflows the slider. */}
      <span style={{
        color: daysAgo === 0 ? labelColor : activeColor,
        width: 170, textAlign: 'right', flexShrink: 0, flexGrow: 0,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {formatDateLabel(daysAgo)}
      </span>
    </div>
  )
}

export default memo(TimelineControlInner)

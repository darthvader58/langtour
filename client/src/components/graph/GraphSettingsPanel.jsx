import { useEffect, useId, useRef, useState } from 'react'
import { theme, radius, shadow, space } from '../../theme.js'
import { IconButton } from '../ui/primitives.jsx'
import { Icon } from '../ui/Icon.jsx'

function PanelSlider({ label, hint, min, max, step, value, onChange, disabled = false }) {
  const id = useId()
  return (
    <label htmlFor={id} style={{ display: 'block', marginBottom: space.sm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 12, color: theme.ink }}>{label}</span>
        <span style={{ fontSize: 11, color: theme.inkSoft, fontVariantNumeric: 'tabular-nums' }}>
          {hint ?? (Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2))}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step ?? 'any'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: theme.matchaMid, height: 14, margin: 0 }}
      />
    </label>
  )
}

function PanelSection({ title, children }) {
  return (
    <div style={{ marginBottom: space.md }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: theme.inkSoft,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: space.sm,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

export default function GraphSettingsPanel({
  display,
  onDisplayChange,
  simCutoff,
  onSimCutoffChange,
  simStats,
  linkCount,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const safeSimCutoff = simCutoff ?? simStats.max

  return (
    <>
      <span
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ position: 'absolute', bottom: 6, left: 6, zIndex: 3 }}
      >
        <IconButton
          icon={Icon.Settings}
          label="Graph settings"
          active={open}
          onClick={() => setOpen((o) => !o)}
          data-testid="graph-settings-toggle"
        />
      </span>
      {open && (
        <div
          ref={panelRef}
          data-testid="graph-settings-popover"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 44,
            left: 6,
            width: 260,
            maxHeight: 'calc(100% - 56px)',
            overflowY: 'auto',
            padding: `${space.md}px ${space.lg}px`,
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: radius.md,
            boxShadow: shadow.lg,
            zIndex: 3,
            color: theme.ink,
          }}
        >
          {simStats.max > simStats.min && (
            <PanelSection title="Filters">
              <PanelSlider
                label="Link similarity"
                hint={`${linkCount.active.toLocaleString()} / ${linkCount.total.toLocaleString()} links`}
                min={simStats.min}
                max={simStats.max}
                step={(simStats.max - simStats.min) / 50 || 0.005}
                value={safeSimCutoff}
                onChange={onSimCutoffChange}
                disabled={disabled}
              />
            </PanelSection>
          )}
          <PanelSection title="Display">
            <PanelSlider
              label="Node size"
              min={0.3}
              max={4}
              value={display.nodeSize}
              onChange={(v) => onDisplayChange({ nodeSize: v })}
              disabled={disabled}
            />
            <PanelSlider
              label="Line thickness"
              min={0.3}
              max={4}
              value={display.lineThickness}
              onChange={(v) => onDisplayChange({ lineThickness: v })}
              disabled={disabled}
            />
            <PanelSlider
              label="Node opacity"
              min={0}
              max={1}
              step={0.01}
              value={display.nodeOpacity}
              onChange={(v) => onDisplayChange({ nodeOpacity: v })}
              disabled={disabled}
            />
            <PanelSlider
              label="Edge opacity"
              min={0}
              max={1}
              step={0.01}
              value={display.edgeOpacity}
              onChange={(v) => onDisplayChange({ edgeOpacity: v })}
              disabled={disabled}
            />
          </PanelSection>
        </div>
      )}
    </>
  )
}

import GradientLegend from './GradientLegend.jsx'
import { theme, radius } from '../../theme.js'

// Meta bar — below canvas + axis pads. Shows the currently-active color metric's legend,
// lets the user swap color mode, exposes the manual optimizer buttons, and renders
// dimInfo + sampled-banner + focus badge.
export default function MetaBar({
  colorMode, setColorMode,
  colorLegend,
  availableMetrics, // array of { value, label, disabled? }
  optimizerGroups, // array of { label, linear?: {onClick, hint}, nonlinear?: {onClick, hint} }
  optimizerBusy,
  lastLoss, // { label: string, history: number[] } from last nonlinear optimizer run
  data,
  nnColoring, onClearNnColoring,
  hideColorSelect = false, // color-by lives outside the drawer now; skip the dupe
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      {!hideColorSelect && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 12 }}>
          color by:{' '}
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          >
            {availableMetrics.map((m) => (
              <option key={m.value} value={m.value} disabled={m.disabled}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {colorLegend && (
        <span style={{ marginLeft: 'auto' }}>
          <GradientLegend legend={colorLegend} />
        </span>
      )}
      {nnColoring && (
        <span style={{
          fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '2px 8px', background: nnColoring.kind === 'residual' ? '#2e2a1c' : '#e0f2fe',
          border: '1px solid ' + (nnColoring.kind === 'residual' ? '#fcd34d' : '#7dd3fc'),
          borderRadius: 4,
        }}>
          🧠 MLP {nnColoring.kind === 'residual' ? 'residual' : 'predicted'} · <strong>{nnColoring.metric}</strong>
          <button onClick={onClearNnColoring} style={{ fontSize: 11 }}>clear</button>
        </span>
      )}
      {data?.sampled && (
        <span style={{ color: theme.warn, fontSize: 12 }}>
          sampled {data.nodes.length} of {data.totalWords} words
        </span>
      )}
      {optimizerGroups?.length > 0 && (
        <div style={{ width: '100%' }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
            marginBottom: 7,
          }}>
            <span style={{
              color: theme.inkSoft, fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.16em',
            }}>perspective</span>
            <span style={{ color: theme.inkFaint, fontSize: 10, fontFamily: 'monospace' }}>
              reproject 384&nbsp;dimensions
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {optimizerGroups.map((g, i) => (
              <PerspectiveBar key={i} group={g} busy={optimizerBusy} />
            ))}
          </div>
        </div>
      )}
      {/* Loss curve from the last optimizer run. Collapses entirely when idle so
          the console stays dense — the curve only appears while/after a run. */}
      {lastLoss && lastLoss.history.length > 0 && (
        <div style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
          <LossCurve label={lastLoss.label} history={lastLoss.history} />
        </div>
      )}
      {data?.dimInfo && (
        <span style={{ color: theme.inkFaint, fontSize: 11, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
          effective-dim {data.dimInfo.effective_dim.toFixed(2)}
          {data.dimInfo.var90_k != null && ` · 90%@k=${data.dimInfo.var90_k}`}
        </span>
      )}
    </div>
  )
}

function LossCurve({ label, history }) {
  const W = 200, H = 40, pad = 4
  const n = history.length
  const lo = Math.min(...history)
  const hi = Math.max(...history)
  const span = Math.max(hi - lo, 1e-9)
  const x = (i) => pad + (i / Math.max(n - 1, 1)) * (W - pad * 2)
  const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2)
  const points = history.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const reduction = history[0] > 0 ? (1 - history[n - 1] / history[0]) * 100 : 0
  return (
    <div style={{ width: '100%', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 10, color: theme.inkSoft }}>
        <div style={{ fontFamily: 'monospace', color: theme.inkSoft }}>{label}</div>
        <div style={{ color: theme.inkFaint, fontVariantNumeric: 'tabular-nums' }}>
          {n} iter · {history[n - 1].toFixed(4)} final · {reduction > 0 ? '−' : '+'}{Math.abs(reduction).toFixed(1)}%
        </div>
      </div>
      <svg width={W} height={H} style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: radius.sm }}>
        <polyline points={points} fill="none" stroke={theme.good} strokeWidth={1.4} />
      </svg>
    </div>
  )
}

// Each "perspective" is a different projection of the 384-D embedding onto the
// screen. The bar is deliberately expressive — it stands for the idea that those
// 384 dimensions carry real, optimizable structure. Its hue is the semantic color
// of the axis it reorganizes the space around; the faint scanlines read as the
// underlying dimensional axes being re-weighted.
const PERSPECTIVE_HUE = {
  'best 3D': theme.slate,
  connectivity: theme.matchaMid,
  retrievability: theme.good,
  stability: theme.slate,
  difficulty: theme.gold,
}
function hueFor(label) {
  if (PERSPECTIVE_HUE[label]) return PERSPECTIVE_HUE[label]
  if (label.startsWith('isolate')) return theme.plum
  return theme.matchaMid
}

function PerspectiveBar({ group, busy }) {
  const hue = hueFor(group.label)
  const fill = `linear-gradient(90deg, ${hue}40 0%, ${hue}24 55%, ${hue}12 100%)`
  // Vertical scanlines = the 384 dimensional axes being re-weighted. Tinted with
  // the bar's own hue (brighter than plain white) so the texture actually reads.
  const scan = `repeating-linear-gradient(90deg, ${hue}33 0 1px, transparent 1px 6px)`
  return (
    <button
      onClick={group.onClick}
      title={group.hint}
      disabled={busy}
      style={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 11px',
        textAlign: 'left',
        fontFamily: 'monospace',
        fontSize: 11.5,
        color: theme.ink,
        background: fill,
        border: `1px solid ${hue}40`,
        borderRadius: radius.sm,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.55 : 1,
        overflow: 'hidden',
        transition: 'border-color 130ms ease, transform 80ms ease, filter 130ms ease',
      }}
      onMouseEnter={(e) => {
        if (busy) return
        e.currentTarget.style.borderColor = hue
        e.currentTarget.style.filter = 'brightness(1.18)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = `${hue}40`
        e.currentTarget.style.filter = 'none'
      }}
    >
      {/* scanline texture overlay — the dimensional axes */}
      <span style={{ position: 'absolute', inset: 0, background: scan, pointerEvents: 'none', opacity: 0.8 }} />
      {/* leading hue tick */}
      <span style={{
        width: 3, alignSelf: 'stretch', borderRadius: 2, background: hue,
        boxShadow: `0 0 6px ${hue}`, flexShrink: 0, position: 'relative',
      }} />
      <span style={{ position: 'relative', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {group.label}
      </span>
      <span style={{
        position: 'relative', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: theme.inkFaint, flexShrink: 0,
      }}>
        {busy ? '···' : 'apply'}
      </span>
    </button>
  )
}

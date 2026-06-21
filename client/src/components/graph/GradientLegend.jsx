import { VIRIDIS_STOPS } from '../../utils/colormap.js'

// Gradient preview bar + min/max tick labels. Shown in the meta bar when a continuous
// color metric is selected.
export default function GradientLegend({ legend }) {
  const W = 110, H = 10
  const stops = VIRIDIS_STOPS
    .map(([t, rgb]) => `rgb(${rgb.join(',')}) ${Math.round(t * 100)}%`)
    .join(', ')
  const fmt = (v) => {
    if (!Number.isFinite(v)) return '-'
    const abs = Math.abs(v)
    if (abs >= 100) return v.toFixed(0)
    if (abs >= 1) return v.toFixed(2)
    return v.toFixed(3)
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 11, color: '#b8b9bd' }}>
      <span style={{ fontFamily: 'monospace' }}>{fmt(legend.lo)}</span>
      <span style={{
        width: W, height: H, borderRadius: 2,
        background: `linear-gradient(to right, ${stops})`,
        border: '1px solid #34353a',
      }} />
      <span style={{ fontFamily: 'monospace' }}>{fmt(legend.hi)}</span>
    </span>
  )
}

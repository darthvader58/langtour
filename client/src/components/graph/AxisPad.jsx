import { memo, useRef, useState, useCallback } from 'react'
import { AXIS_PAD_SIZE, AXIS_PAD_CARD } from './constants.js'
import { theme, radius } from '../../theme.js'

// Axis pad: wireframe sphere + draggable dot. The dot's 3D position IS (wx, wy, wz).
//
//   Regular drag  = move the dot in the current view plane
//   Ctrl-drag     = rotate the sphere (orbit the view around the dot)
//
// So you orient the sphere to face the axis you want, then drag cleanly in that plane.

// ── view math ───────────────────────────────────────────────────────────────
function buildViewMatrix(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  return [
    [ cy,      0,     sy    ],
    [ sy*sp,   cp,   -cy*sp ],
    [-sy*cp,   sp,    cy*cp ],
  ]
}

function project(V, x, y, z) {
  return {
    sx: V[0][0]*x + V[0][1]*y + V[0][2]*z,
    sy: V[1][0]*x + V[1][1]*y + V[1][2]*z,
    vz: V[2][0]*x + V[2][1]*y + V[2][2]*z,
  }
}

function transpose(V) {
  return [
    [V[0][0], V[1][0], V[2][0]],
    [V[0][1], V[1][1], V[2][1]],
    [V[0][2], V[1][2], V[2][2]],
  ]
}

// ── disc → 3D vector (through the rotated view) ────────────────────────────
function clampToSphere(V, targetW, curViewZ) {
  // Project the candidate world point to view space.
  const vx = V[0][0]*targetW.x + V[0][1]*targetW.y + V[0][2]*targetW.z
  const vy = V[1][0]*targetW.x + V[1][1]*targetW.y + V[1][2]*targetW.z
  // Clamp XY to unit disc — this IS the cursor position so the dot tracks 1:1.
  const r2 = vx*vx + vy*vy
  let sx = vx, sy = vy
  if (r2 > 1) { const s = 1 / Math.sqrt(r2); sx *= s; sy *= s }
  // Depth: clamp so the point stays inside the unit sphere. When the cursor is
  // at the rim, depth goes to 0 — the dot touches the boundary exactly.
  const maxZ = Math.sqrt(Math.max(0, 1 - sx*sx - sy*sy))
  const vz = Math.max(-maxZ, Math.min(maxZ, curViewZ))
  // Convert back to world space.
  const Vi = transpose(V)
  return {
    x: Vi[0][0]*sx + Vi[0][1]*sy + Vi[0][2]*vz,
    y: Vi[1][0]*sx + Vi[1][1]*sy + Vi[1][2]*vz,
    z: Vi[2][0]*sx + Vi[2][1]*sy + Vi[2][2]*vz,
  }
}

// ── disc position → 3D vector (volume mapping, not surface) ────────────────
// Maps a disc point (dx, dy) ∈ [-1,1]² to a point inside the unit sphere.
// The disc's xy plane maps to the view plane, with depth from z=√(1−x²−y²).
function discToVector(V, dx, dy) {
  const r2 = Math.min(dx*dx + dy*dy, 1)
  const z = Math.sqrt(1 - r2)
  const Vi = transpose(V)
  return {
    x: Vi[0][0]*dx + Vi[0][1]*dy + Vi[0][2]*z,
    y: Vi[1][0]*dx + Vi[1][1]*dy + Vi[1][2]*z,
    z: Vi[2][0]*dx + Vi[2][1]*dy + Vi[2][2]*z,
  }
}

const DEFAULT_YAW = -Math.PI/9, DEFAULT_PITCH = Math.PI/6

// World-axis colors — shared by the in-sphere axis cues AND the x/y/z readout
// chips below, so the number you read is tinted the same hue as the line it moves
// the dot along. x → pink, y → green, z → blue.
const AXIS_COLORS = ['#f472b6', '#4ade80', '#60a5fa']

function AxisPadInner({ index, wx, wy, wz, eigenvalue, onChange, cardSize = AXIS_PAD_CARD, svgSize = AXIS_PAD_SIZE }) {
  const C = svgSize / 2
  const RAD = C - 3
  const svgRef = useRef(null)

  // Per-pad view orientation. Resets on unmount.
  const [viewYaw, setViewYaw] = useState(DEFAULT_YAW)
  const [viewPitch, setViewPitch] = useState(DEFAULT_PITCH)

  const modeRef = useRef(null)     // 'dot' | 'orbit'
  const lastOrbitRef = useRef(null) // { lastX, lastY } for orbit delta
  // For dot-drag: anchor is the 3D world position at mousedown. We apply screen
  // deltas from the initial cursor position so the dot tracks 1:1.
  const dragAnchorRef = useRef(null) // { wx, wy, wz, diskX, diskY, viewZ } at mousedown

  // ── current projection ───────────────────────────────────────────────────
  const V = buildViewMatrix(viewYaw, viewPitch)
  const p = project(V, wx, wy, wz)
  const sx = C + p.sx * RAD
  const sy = C - p.sy * RAD
  const frontFacing = p.vz >= 0

  // ── apply drag (move dot OR orbit view) ──────────────────────────────────
  const handleMove = useCallback((ev) => {
    if (modeRef.current === 'orbit') {
      const prev = lastOrbitRef.current
      if (prev) {
        const ddx = (ev.clientX - prev.lastX) * 0.04
        const ddy = (ev.clientY - prev.lastY) * 0.04
        setViewYaw(y => y + ddx)
        setViewPitch(p => Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, p + ddy)))
      }
      lastOrbitRef.current = { lastX: ev.clientX, lastY: ev.clientY }
    } else {
      const rect = svgRef.current.getBoundingClientRect()
      const a = dragAnchorRef.current
      if (!a) return
      // Cursor disc position relative to pad center, clamped to unit disc
      let cx = (ev.clientX - rect.left - C) / RAD
      let cy = (C - (ev.clientY - rect.top)) / RAD
      const r = Math.sqrt(cx*cx + cy*cy)
      if (r > 1) { cx /= r; cy /= r }
      // Delta in view-plane units from the anchor click
      const ddx = cx - a.diskX
      const ddy = cy - a.diskY
      // Map view-plane delta back to world space
      const Vi = transpose(V)
      const dwx = Vi[0][0]*ddx + Vi[0][1]*ddy
      const dwy = Vi[1][0]*ddx + Vi[1][1]*ddy
      const dwz = Vi[2][0]*ddx + Vi[2][1]*ddy
      const target = { x: a.wx + dwx, y: a.wy + dwy, z: a.wz + dwz }
      const c = clampToSphere(V, target, a.viewZ)
      onChange(c.x, c.y, c.z)
    }
  }, [C, RAD, V, onChange])

  const onDown = useCallback((e) => {
    e.preventDefault()
    const rect = svgRef.current.getBoundingClientRect()
    const dx = e.clientX - rect.left
    const dy = e.clientY - rect.top
    const distToDot = Math.hypot(dx - sx, dy - sy)
    if (distToDot < 7) {
      modeRef.current = 'dot'
      dragAnchorRef.current = {
        wx, wy, wz,
        diskX: (e.clientX - rect.left - C) / RAD,
        diskY: (C - (e.clientY - rect.top)) / RAD,
        viewZ: p.vz,
      }
      handleMove(e)
    } else {
      modeRef.current = 'orbit'
      lastOrbitRef.current = { lastX: e.clientX, lastY: e.clientY }
    }
    const move = (ev) => { handleMove(ev) }
    const up = () => {
      modeRef.current = null
      dragAnchorRef.current = null
      lastOrbitRef.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [handleMove, sx, sy, wx, wy, wz])

  // ── wireframe (uses current view) ────────────────────────────────────────
  function ringPath(yLvl) {
    const N = 28, r = Math.sqrt(Math.max(0, 1-yLvl*yLvl))
    let d = ''
    for (let i = 0; i <= N; i++) {
      const a = (2*Math.PI*i)/N
      const { sx: sp, sy: syp } = project(V, r*Math.cos(a), yLvl, r*Math.sin(a))
      d += (i===0?'M':'L') + (C+sp*RAD).toFixed(1)+','+(C-syp*RAD).toFixed(1)
    }
    return d
  }
  function longPath(angle) {
    const N = 28; const ca=Math.cos(angle), sa=Math.sin(angle)
    let d = ''
    for (let i = 0; i <= N; i++) {
      const phi = (Math.PI*i)/N-Math.PI/2
      const { sx: sp, sy: syp } = project(V, ca*Math.cos(phi), Math.sin(phi), sa*Math.cos(phi))
      d += (i===0?'M':'L') + (C+sp*RAD).toFixed(1)+','+(C-syp*RAD).toFixed(1)
    }
    return d
  }

  return (
    <div style={{
      border: `1px solid ${theme.border}`, borderRadius: radius.sm, padding: '5px 7px', background: theme.paper,
      width: cardSize, height: cardSize,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', gap: 4,
      position: 'relative',
      boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%', whiteSpace: 'nowrap', lineHeight: 1, position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
        <span style={{ fontWeight: 700, color: theme.ink, letterSpacing: '0.04em' }}>{index + 1}.</span>
        {eigenvalue != null && <span style={{ fontSize: 8, color: theme.inkSoft, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>λ {eigenvalue.toFixed(2)}</span>}
      </div>
      <svg
        ref={svgRef}
        width={svgSize} height={svgSize}
        style={{ cursor: 'crosshair', touchAction: 'none', display: 'block', background: 'transparent', borderRadius: 2,
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        onMouseDown={onDown}
      >
        {/* UV sphere wireframe: lats from -1 to +1, longs every 60° */}
        {(() => {
           const lines = []
          lines.push(<circle key="outline" cx={C} cy={C} r={RAD} fill="none" stroke="#ddd" strokeWidth={0.5} />)
          for (let i = 0; i < 5; i++) {
            const lat = -0.8 + i*0.4
            lines.push(<path key={`la${lat}`} d={ringPath(lat)} fill="none" stroke={i%2===0?'#c8c8c8':'#e8e8e8'} strokeWidth={0.35} opacity={0.5} />)
          }
          for (let i = 0; i < 16; i++) {
            const lon = i * Math.PI/8
            lines.push(<path key={`lo${lon}`} d={longPath(lon)} fill="none" stroke={i%2===0?'#c8c8c8':'#e8e8e8'} strokeWidth={0.35} opacity={0.5} />)
          }
          return lines
        })()}
        {/* axis hints with lines from origin */}
        {AXIS_COLORS.map((col, idx) => {
          const axis = idx===0?[1,0,0]:idx===1?[0,1,0]:[0,0,1]
          const a = project(V, ...axis)
          const ax = C+a.sx*RAD, ay = C-a.sy*RAD
          return [
            <line key={`l${idx}`} x1={C} y1={C} x2={ax} y2={ay} stroke={col} strokeWidth={0.8} opacity={0.55} />,
            <circle key={`d${idx}`} cx={ax} cy={ay} r={1.8} fill={col} opacity={0.85} />,
          ]
        })}
        <line x1={C} y1={C} x2={sx} y2={sy} stroke="#60a5fa" strokeWidth={1.2} opacity={0.6} />
        {frontFacing ? (
          <circle cx={sx} cy={sy} r={4.5} fill="#60a5fa" stroke="#0b0d14" strokeWidth={1} />
        ) : (
          <circle cx={sx} cy={sy} r={3.5} fill="none" stroke="#60a5fa" strokeWidth={1.2} strokeDasharray="2 2" />
        )}
      </svg>
      {/* x/y/z readout — each value tinted the hue of the axis it controls, so the
          number reinforces the colored line in the sphere above. Evenly spaced, no
          run-on / ellipsis. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%', lineHeight: 1, position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
        {[['x', wx], ['y', wy], ['z', wz]].map(([axis, val], idx) => (
          <span key={axis} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: AXIS_COLORS[idx] }}>{axis}</span>
            <span style={{ fontSize: 8, color: Math.abs(val) < 0.005 ? theme.inkFaint : theme.inkSoft }}>{val.toFixed(2)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const AxisPad = memo(AxisPadInner)
export default AxisPad

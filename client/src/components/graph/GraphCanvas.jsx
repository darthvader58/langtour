import { useEffect, useMemo, useRef, useState } from 'react'
import { WIDTH, HEIGHT, CX, CY } from './constants.js'
import { DEFAULT_POINT_COLOR } from '../../utils/colormap.js'
import { createPointsRenderer } from './webglPoints.js'

// Galaxy canvas. Takes 3D world points (p.x/p.y/p.z in a ~unit-radius cloud) + a color
// function and renders them as glowing stars with an orbit camera. Drag orbits
// (yaw/pitch), wheel dollies (zoom). Edges are faint filaments between related
// stars. Children render on top of the canvas inside the same positioned container
// (tooltip overlays).
//
// The camera is { yaw, pitch, dist }. Each frame we build a 3×3 world→view rotation from
// yaw/pitch and hand it (plus dist + focal length) to the WebGL renderer, which does the
// perspective projection on the GPU. For hit-testing and the 2D overlay (focus/hover
// rings) we mirror the same rotation on the CPU to get screen coords + camera-space depth.

// Perspective focal length in CSS px. Lower = wider field of view = stronger perspective
// parallax (near stars dwarf far ones), which is what makes flying through the cloud feel
// three-dimensional. ~340 ≈ a ~70° vertical FOV on the 500px canvas.
const FOV = 340
// Camera distance from the orbit centre. The floor is tiny so you can dolly right INTO
// and through the galaxy — at small dist the cloud surrounds the camera and near stars
// streak past. Points that fall behind the eye are clipped in the shader.
const DIST_MIN = 0.08
const DIST_MAX = 12
const DIST_DEFAULT = 3.6 // far enough that the whole galaxy frames without the core clipping
const DEFAULT_CAM = { yaw: 0.6, pitch: 0.35, dist: DIST_DEFAULT, tx: 0, ty: 0, tz: 0 }

// Build a column-major mat3 (for uniformMatrix3fv) that rotates world→view: first yaw
// about the world Y axis, then pitch about the view X axis.
function buildRot(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cx = Math.cos(pitch), sx = Math.sin(pitch)
  // R = Rx(pitch) · Ry(yaw). Row-major:
  //   [ cy,        0,    sy      ]
  //   [ sx*sy,     cx,  -sx*cy   ]
  //   [-cx*sy,     sx,   cx*cy   ]
  const r = [
    cy,        0,    sy,
    sx * sy,   cx,  -sx * cy,
    -cx * sy,  sx,   cx * cy,
  ]
  // Transpose to column-major for WebGL.
  return new Float32Array([
    r[0], r[3], r[6],
    r[1], r[4], r[7],
    r[2], r[5], r[8],
  ])
}

// Apply the same world→view rotation as buildRot, recentred on the orbit target
// (tx,ty,tz). Mirrors the GPU exactly so hit-testing + overlay rings line up.
function rotatePoint(yaw, pitch, x, y, z, tx, ty, tz) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cx = Math.cos(pitch), sx = Math.sin(pitch)
  const dx = x - tx, dy = y - ty, dz = z - tz
  const vx = cy * dx + sy * dz
  const vy = sx * sy * dx + cx * dy - sx * cy * dz
  const vz = -cx * sy * dx + sx * dy + cx * cy * dz
  return [vx, vy, vz]
}

export default function GraphCanvas({
  projected,        // { points: [{id,x,y,z,ref,...}], scale, focusIdx }
  edgeIndexPairs,   // { pairs: Uint32Array(2*E), sims: Float32Array(E), count } | null
  projectionKey,    // W object — new identity on projection change (linear mode)
  colorBuffer,      // Float32Array(N*3) RGB — built by the worker
  visibilityMask,   // optional Uint8Array(N); 0 = hide. Null → all visible.
  onPick,
  renderOverlays,   // (ctx, view) => void
  viewResetKey = 0,
  renderHoverTooltip,
  display = {},     // { nodeSize, lineThickness, nodeOpacity, edgeOpacity }
  simCutoff = null, // edge similarity cutoff; edges with sim > cutoff are hidden
  children,
}) {
  const [hover, setHover] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const overlayCanvasRef = useRef(null)
  const webglCanvasRef = useRef(null)
  const webglRendererRef = useRef(null)
  const containerRef = useRef(null)

  // Interaction animation: smooth fade between hover/focus highlight levels.
  const hlRef = useRef(null)      // Float32Array N — current animated highlight
  const layerOpacityRef = useRef(1)  // FBO composite opacity, animated on hover
  const accentAlphaRef = useRef(0) // current animated accent alpha
  const animRafRef = useRef(null)
  const [animTick, setAnimTick] = useState(0)

  // Orbit/fly camera: yaw/pitch around target (tx,ty,tz) at distance dist. pitch is
  // clamped near the poles to avoid gimbal flip. The target can be flown into the cloud
  // (double-click a star) or panned (shift/right drag), and dist can shrink to ~0 so you
  // fly THROUGH the galaxy.
  const [cam, setCam] = useState({ ...DEFAULT_CAM })
  const camRef = useRef(cam)
  useEffect(() => { camRef.current = cam }, [cam])
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef(null)
  const rafRef = useRef(null)
  const pendingMouseRef = useRef(null)
  const wheelRafRef = useRef(null)
  const pendingWheelRef = useRef(null)

  // Reset camera when the parent bumps viewResetKey (e.g. after an optimizer run).
  useEffect(() => {
    if (viewResetKey > 0) setCam({ ...DEFAULT_CAM })
  }, [viewResetKey])

  // Create the GL renderer once per mount; release on unmount.
  useEffect(() => {
    const c = webglCanvasRef.current
    if (!c) return
    if (!webglRendererRef.current) {
      try {
        webglRendererRef.current = createPointsRenderer(c)
      } catch (e) {
        console.error('WebGL init failed:', e)
        return
      }
    }
    const dpr = window.devicePixelRatio || 1
    webglRendererRef.current.resize(WIDTH, HEIGHT, dpr)
    return () => {
      if (webglRendererRef.current) {
        webglRendererRef.current.destroy()
        webglRendererRef.current = null
      }
    }
  }, [])

  // Position upload — world (x,y,z) per point. Fires when the projection changes (knob
  // drag / optimizer / zElevation). Points are mutated in place, so deps include the
  // projection inputs.
  useEffect(() => {
    const rd = webglRendererRef.current
    if (!rd || !projected.points.length) return
    const pts = projected.points
    const buf = new Float32Array(pts.length * 3)
    for (let i = 0; i < pts.length; i++) {
      buf[i * 3] = pts[i].x
      buf[i * 3 + 1] = pts[i].y
      buf[i * 3 + 2] = pts[i].z
    }
    rd.uploadPositions(buf, pts.length)
  }, [projected.points, projectionKey])

  // Edge upload — rebuilt on graph data or interaction changes. Accent edges
  // connected to either the hovered or parent-owned focused node are placed at
  // the end so they can be drawn directly on top of the dimmed scene.
  useEffect(() => {
    const rd = webglRendererRef.current
    if (!rd) return
    if (!edgeIndexPairs || !projected.points.length) {
      rd.uploadLines(new Float32Array(0), new Float32Array(0), new Float32Array(0), new Float32Array(0), 0)
      return
    }
    const pts = projected.points
    const { pairs, sims, count } = edgeIndexPairs
    const hHi = hover ? pts.findIndex(p => p.id === hover.id) : -1
    const fHi = projected.focusIdx
    const isAccent = (a, b) => (hHi >= 0 && (a === hHi || b === hHi)) || (fHi >= 0 && (a === fHi || b === fHi))

    const pos = new Float32Array(count * 6)
    const col = new Float32Array(count * 8)
    const sim = new Float32Array(count * 2)
    const accent = new Float32Array(count * 2)
    let oi = 0
    // Pass 1 — regular edges (isAccent=0)
    for (let e = 0; e < count; e++) {
      const a = pairs[e * 2], b = pairs[e * 2 + 1]
      if (isAccent(a, b)) continue
      const pa = pts[a], pb = pts[b]
      const baseAlpha = (0.15 + Math.max(0, sims[e] - 0.8) * 2.0) * (display.edgeOpacity ?? 1)
      let cr, cg, cb
      if (colorBuffer) {
        cr = (colorBuffer[a * 3] + colorBuffer[b * 3]) * 0.5
        cg = (colorBuffer[a * 3 + 1] + colorBuffer[b * 3 + 1]) * 0.5
        cb = (colorBuffer[a * 3 + 2] + colorBuffer[b * 3 + 2]) * 0.5
      } else {
        cr = 0.5; cg = 0.6; cb = 0.95
      }
      if (visibilityMask && (!visibilityMask[a] || !visibilityMask[b])) { cr = 0; cg = 0; cb = 0 }
      const o = oi * 6
      pos[o] = pa.x; pos[o + 1] = pa.y; pos[o + 2] = pa.z
      pos[o + 3] = pb.x; pos[o + 4] = pb.y; pos[o + 5] = pb.z
      const ci = oi * 8
      col[ci] = cr; col[ci + 1] = cg; col[ci + 2] = cb; col[ci + 3] = baseAlpha
      col[ci + 4] = cr; col[ci + 5] = cg; col[ci + 6] = cb; col[ci + 7] = baseAlpha
      sim[oi * 2] = sims[e]; sim[oi * 2 + 1] = sims[e]
      accent[oi * 2] = 0; accent[oi * 2 + 1] = 0
      oi++
    }
    const regularVerts = oi * 2
    // Pass 2 — accent edges (isAccent=1, drawn on top)
    for (let e = 0; e < count; e++) {
      const a = pairs[e * 2], b = pairs[e * 2 + 1]
      if (!isAccent(a, b)) continue
      const pa = pts[a], pb = pts[b]
      if (visibilityMask && (!visibilityMask[a] || !visibilityMask[b])) continue
      let cr, cg, cb
      if (colorBuffer) {
        cr = (colorBuffer[a * 3] + colorBuffer[b * 3]) * 0.5
        cg = (colorBuffer[a * 3 + 1] + colorBuffer[b * 3 + 1]) * 0.5
        cb = (colorBuffer[a * 3 + 2] + colorBuffer[b * 3 + 2]) * 0.5
      } else {
        cr = 0.5; cg = 0.6; cb = 0.95
      }
      const o = oi * 6
      pos[o] = pa.x; pos[o + 1] = pa.y; pos[o + 2] = pa.z
      pos[o + 3] = pb.x; pos[o + 4] = pb.y; pos[o + 5] = pb.z
      const ci = oi * 8
      col[ci] = cr; col[ci + 1] = cg; col[ci + 2] = cb; col[ci + 3] = 1
      col[ci + 4] = cr; col[ci + 5] = cg; col[ci + 6] = cb; col[ci + 7] = 1
      sim[oi * 2] = sims[e]; sim[oi * 2 + 1] = sims[e]
      accent[oi * 2] = 1; accent[oi * 2 + 1] = 1
      oi++
    }
    const accentVerts = (oi * 2) - regularVerts
    rd.uploadLines(pos, col, sim, accent, oi * 2, accentVerts)
  }, [edgeIndexPairs, projected.points, projected.focusIdx, projectionKey, colorBuffer, display, visibilityMask, hover])

  const DIM_ALPHA = 0.35
  const NEIGHBOR_ALPHA = 1
  const FADE_LERP = 0.18
  useEffect(() => {
    const pts = projected.points
    if (!pts?.length || !colorBuffer) return
    const N = pts.length

    let hl = hlRef.current
    if (!hl || hl.length !== N) {
      hl = new Float32Array(N)
      hl.fill(1)
      hlRef.current = hl
    }

    const hHi = hover ? pts.findIndex(p => p.id === hover.id) : -1
    const fHi = projected.focusIdx
    const hasActiveNode = hHi >= 0 || fHi >= 0

    const neighborSet = new Set()
    if (hasActiveNode && edgeIndexPairs) {
      const { pairs, sims, count } = edgeIndexPairs
      for (let e = 0; e < count; e++) {
        if (simCutoff != null && sims[e] > simCutoff) continue
        const a = pairs[e * 2], b = pairs[e * 2 + 1]
        if ((hHi >= 0 && (a === hHi || b === hHi)) || (fHi >= 0 && (a === fHi || b === fHi))) {
          neighborSet.add(a); neighborSet.add(b)
        }
      }
    }

    const targets = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      let t = 1
      if (hasActiveNode) {
        const isHighlight = i === hHi || i === fHi
        if (isHighlight) t = 1
        else if (neighborSet.has(i)) t = NEIGHBOR_ALPHA
        else t = DIM_ALPHA
      }
      if (visibilityMask && !visibilityMask[i]) t = 0
      targets[i] = t
    }

    const targetEdgeDim = hasActiveNode ? DIM_ALPHA : 1
    const targetAccentAlpha = hasActiveNode ? 1 : 0

    const rgba = new Float32Array(N * 4)
    const tick = () => {
      let changed = false
      for (let i = 0; i < N; i++) {
        const prev = hl[i]
        const next = prev + (targets[i] - prev) * FADE_LERP
        hl[i] = next
        if (Math.abs(next - targets[i]) > 0.002) changed = true
        rgba[i * 4] = colorBuffer[i * 3]
        rgba[i * 4 + 1] = colorBuffer[i * 3 + 1]
        rgba[i * 4 + 2] = colorBuffer[i * 3 + 2]
        rgba[i * 4 + 3] = next
      }
      // Animate edge dim and accent alpha
      const prevDim = layerOpacityRef.current
      const nextDim = prevDim + (targetEdgeDim - prevDim) * FADE_LERP
      layerOpacityRef.current = nextDim
      if (Math.abs(nextDim - targetEdgeDim) > 0.002) changed = true
      const prevAcc = accentAlphaRef.current
      const nextAcc = prevAcc + (targetAccentAlpha - prevAcc) * FADE_LERP
      accentAlphaRef.current = nextAcc
      if (Math.abs(nextAcc - targetAccentAlpha) > 0.002) changed = true

      const rd = webglRendererRef.current
      if (rd) {
        rd.uploadColors(rgba)
        setAnimTick(t => t + 1)
      }
      if (changed) {
        animRafRef.current = requestAnimationFrame(tick)
      } else {
        animRafRef.current = null
      }
    }
    if (animRafRef.current) cancelAnimationFrame(animRafRef.current)
    animRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current)
    }
  }, [colorBuffer, hover, edgeIndexPairs, projected.points, projected.focusIdx, simCutoff, visibilityMask])

  // Depth-sort index buffer — far points draw first, but highlighted nodes
  // (hovered + neighbors) are moved to the end so they draw on top.
  useEffect(() => {
    const rd = webglRendererRef.current
    if (!rd || !projected.points.length) return
    const pts = projected.points
    const N = pts.length
    const { yaw, pitch, tx, ty, tz } = cam
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw)
    const cpit = Math.cos(pitch), spit = Math.sin(pitch)
    const idx = new Uint32Array(N)
    const depth = new Float32Array(N)
    let count = 0
    for (let i = 0; i < N; i++) {
      if (visibilityMask && !visibilityMask[i]) continue
      const p = pts[i]
      const dx = p.x - tx, dy = p.y - ty, dz = p.z - tz
      const vz = -cpit * syaw * dx + spit * dy + cpit * cyaw * dz
      idx[count] = i
      depth[count] = vz
      count++
    }
    const trimmed = idx.subarray(0, count)
    trimmed.sort((a, b) => depth[b] - depth[a])  // descending: nearest first in array, draws last

    // Build highlighted set from both transient hover and persistent parent focus.
    const hHi = hover ? pts.findIndex(p => p.id === hover.id) : -1
    const fHi = projected.focusIdx
    const highlight = new Set()
    if (hHi >= 0) highlight.add(hHi)
    if (fHi >= 0) highlight.add(fHi)
    if (highlight.size > 0) {
      if (edgeIndexPairs) {
        const { pairs, count: ec } = edgeIndexPairs
        for (let e = 0; e < ec; e++) {
          const a = pairs[e * 2], b = pairs[e * 2 + 1]
          if (a === hHi || a === fHi) highlight.add(b)
          if (b === hHi || b === fHi) highlight.add(a)
        }
      }
    }

    // Count highlighted nodes at the end
    let numHighlighted = 0
    if (highlight.size > 0) {
      let writeIdx = count - 1
      for (let i = count - 1; i >= 0; i--) {
        if (highlight.has(trimmed[i])) {
          while (writeIdx > i && highlight.has(trimmed[writeIdx])) writeIdx--
          if (writeIdx <= i) break
          const tmp = trimmed[i]; trimmed[i] = trimmed[writeIdx]; trimmed[writeIdx] = tmp
          writeIdx--
        }
      }
      // Count how many at the end are highlighted
      for (let i = count - 1; i >= 0 && highlight.has(trimmed[i]); i--) numHighlighted++
    }

    rd.uploadIndices(trimmed.slice(), numHighlighted)
  }, [projected.points, projected.focusIdx, projectionKey, cam, visibilityMask, hover, edgeIndexPairs])

  // Render — fires on camera / projection / color / edge changes.
  useEffect(() => {
    const rd = webglRendererRef.current
    if (!rd) return
    const dpr = window.devicePixelRatio || 1
    const rot = buildRot(cam.yaw, cam.pitch)
    // Fog: only the far half of the cloud dims. Near plane stays bright even when the
    // camera is inside, so stars whipping past don't black out. Scales with dist so a
    // distant overview and an inside-the-cloud flythrough both read well.
    const fogNear = cam.dist
    const fogFar = cam.dist + 2.2
    rd.render({
      rot,
      target: [cam.tx, cam.ty, cam.tz],
      dist: cam.dist,
      fov: FOV,
      pointSizeWorld: 0.04,
      dpr,
      fogNear,
      fogFar,
      pointSizeMul: display.nodeSize ?? 1,
      pointOpacity: display.nodeOpacity ?? 1,
      lineWidth: display.lineThickness ?? 1,
      simCutoff: simCutoff ?? -1,
      layerOpacity: layerOpacityRef.current,
      accentAlpha: accentAlphaRef.current,
    })
  }, [projected.points, projected.focusIdx, projectionKey, colorBuffer, cam, visibilityMask, edgeIndexPairs, display, hover, simCutoff, animTick])

  // CPU project all points to screen for the given camera. Returns a Float32Array(N*2)
  // of (sx, sy) plus a depth array. Used by hit-test and the overlay. Memoized per
  // camera + projection.
  const screenProj = useMemo(() => {
    const pts = projected.points
    const N = pts.length
    const sx = new Float32Array(N)
    const sy = new Float32Array(N)
    const dep = new Float32Array(N)
    const { yaw, pitch, dist, tx, ty, tz } = cam
    for (let i = 0; i < N; i++) {
      const p = pts[i]
      const [vx, vy, vz] = rotatePoint(yaw, pitch, p.x, p.y, p.z, tx, ty, tz)
      const depth = vz + dist
      if (depth <= 0.02) {
        // Behind the eye — park off-screen with negative depth so hit-test skips it.
        sx[i] = -9999; sy[i] = -9999; dep[i] = -1
        continue
      }
      sx[i] = CX + vx * (FOV / depth)
      sy[i] = CY - vy * (FOV / depth)
      dep[i] = depth
    }
    return { sx, sy, dep, N }
  }, [projected.points, projectionKey, cam])

  // Overlay: focus ring + hover halo, drawn at CPU-projected screen coords.
  useEffect(() => {
    const c = overlayCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    if (c.width !== WIDTH * dpr || c.height !== HEIGHT * dpr) {
      c.width = WIDTH * dpr; c.height = HEIGHT * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)

    if (renderOverlays) renderOverlays(ctx, { screenProj, points: projected.points })

    const { sx, sy } = screenProj
    // Focus node: pink ring.
    if (projected.focusIdx >= 0 && projected.focusIdx < sx.length) {
      const fi = projected.focusIdx
      ctx.strokeStyle = '#f472b6'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(sx[fi], sy[fi], 9, 0, 2 * Math.PI)
      ctx.stroke()
    }
    // Hover halo: white ring.
    if (hover) {
      const hi = projected.points.findIndex(p => p.id === hover.id)
      if (hi >= 0) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(sx[hi], sy[hi], 8, 0, 2 * Math.PI)
        ctx.stroke()
      }
    }
  }, [hover, projected.focusIdx, projected.points, screenProj, renderOverlays])

  // Hit-test: nearest screen point within threshold, tie-broken by nearest depth (front
  // star wins). Respects the visibility mask.
  const PICK_RADIUS = 12
  function pickAt(mx, my) {
    const { sx, sy, dep, N } = screenProj
    let best = -1, bestScore = PICK_RADIUS * PICK_RADIUS, bestDepth = Infinity
    for (let i = 0; i < N; i++) {
      if (visibilityMask && !visibilityMask[i]) continue
      if (dep[i] < 0) continue // behind the eye
      const dx = sx[i] - mx, dy = sy[i] - my
      const d2 = dx * dx + dy * dy
      if (d2 > PICK_RADIUS * PICK_RADIUS) continue
      // Prefer the closer screen hit; on a near-tie prefer the front-most (smaller depth).
      if (d2 < bestScore - 4 || (Math.abs(d2 - bestScore) <= 4 && dep[i] < bestDepth)) {
        bestScore = d2; best = i; bestDepth = dep[i]
      }
    }
    return best >= 0 ? projected.points[best].ref : null
  }

  const PAN_THRESHOLD = 4
  const justDraggedRef = useRef(false)

  const processMouse = () => {
    rafRef.current = null
    const p = pendingMouseRef.current
    if (!p) return
    const { mx, my, cx, cy } = p
    pendingMouseRef.current = null

    if (dragRef.current) {
      const d = dragRef.current
      const dx = mx - d.startX, dy = my - d.startY
      if (!d.dragging && Math.hypot(dx, dy) > PAN_THRESHOLD) d.dragging = true
      if (d.dragging) {
        justDraggedRef.current = true
        const c = camRef.current
        if (d.pan) {
          // Pan: slide the orbit target across the view plane (screen-right = view +X,
          // screen-up = view +Y), so you can move laterally through the cloud. Convert
          // pixel deltas to world units via the perspective scale at the target depth.
          const worldPerPx = d.dist / FOV
          const vdx = -dx * worldPerPx, vdy = dy * worldPerPx
          // Map the view-space pan back into world space (inverse rotation = transpose).
          const cy = Math.cos(d.camYaw), sy = Math.sin(d.camYaw)
          const cx = Math.cos(d.camPitch), sx = Math.sin(d.camPitch)
          const wx = cy * vdx + sx * sy * vdy
          const wy = cx * vdy
          const wz = sy * vdx - sx * cy * vdy
          setCam({ ...c, tx: d.tx + wx, ty: d.ty + wy, tz: d.tz + wz })
        } else {
          // Orbit: drag right → orbit right; drag down → orbit down.
          const yaw = d.camYaw - dx * 0.008
          let pitch = d.camPitch - dy * 0.008
          const LIM = Math.PI / 2 - 0.05
          if (pitch > LIM) pitch = LIM
          if (pitch < -LIM) pitch = -LIM
          setCam({ ...c, yaw, pitch })
        }
        setMousePos({ x: cx, y: cy })
        return
      }
    }

    setMousePos({ x: cx, y: cy })
    setHover(pickAt(mx, my))
  }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    pendingMouseRef.current = {
      mx: (cx / rect.width) * WIDTH,
      my: (cy / rect.height) * HEIGHT,
      cx,
      cy,
    }
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(processMouse)
  }

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
  }, [])

  const onMouseDown = (e) => {
    // Left = orbit; right OR shift+left = pan the target through the cloud.
    if (e.button !== 0 && e.button !== 2) return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      startX: ((e.clientX - rect.left) / rect.width) * WIDTH,
      startY: ((e.clientY - rect.top) / rect.height) * HEIGHT,
      camYaw: cam.yaw,
      camPitch: cam.pitch,
      dist: cam.dist,
      tx: cam.tx, ty: cam.ty, tz: cam.tz,
      pan: e.button === 2 || e.shiftKey,
      dragging: false,
    }
    setIsDragging(true)
    justDraggedRef.current = false
  }

  const onMouseUp = () => {
    dragRef.current = null
    setIsDragging(false)
  }

  // Double-click a star to fly the orbit target to it and pull in close — this is how
  // you "zoom into the structure": the camera re-centres on the clicked region so
  // subsequent orbit/dolly explores around it.
  const onDoubleClick = () => {
    if (!hover) return
    const hp = projected.points.find(p => p.id === hover.id)
    if (!hp) return
    const c = camRef.current
    setCam({ ...c, tx: hp.x, ty: hp.y, tz: hp.z, dist: Math.min(c.dist, 0.9) })
  }

  // Wheel = dolly (zoom). rAF-coalesced; reads latest cam via ref.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const apply = () => {
      wheelRafRef.current = null
      const p = pendingWheelRef.current
      pendingWheelRef.current = null
      if (!p) return
      const v = camRef.current
      const steps = p.deltaY / 100
      const factor = Math.pow(1.12, steps) // positive deltaY → zoom out (larger dist)
      const dist = Math.max(DIST_MIN, Math.min(DIST_MAX, v.dist * factor))
      setCam({ ...v, dist })
    }
    const handler = (e) => {
      e.preventDefault()
      const prev = pendingWheelRef.current
      pendingWheelRef.current = { deltaY: (prev?.deltaY || 0) + e.deltaY }
      if (wheelRafRef.current == null) wheelRafRef.current = requestAnimationFrame(apply)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => {
      el.removeEventListener('wheel', handler)
      if (wheelRafRef.current != null) cancelAnimationFrame(wheelRafRef.current)
      pendingWheelRef.current = null
    }
  }, [])

  const onClick = () => {
    if (justDraggedRef.current) { justDraggedRef.current = false; return }
    if (!onPick) return
    if (hover) {
      onPick(hover)
    }
  }

  const resetView = () => setCam({ ...DEFAULT_CAM })
  const moved = cam.yaw !== DEFAULT_CAM.yaw || cam.pitch !== DEFAULT_CAM.pitch ||
    cam.dist !== DEFAULT_CAM.dist || cam.tx !== 0 || cam.ty !== 0 || cam.tz !== 0

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', border: '1px solid #1a1f2e', borderRadius: 6,
        background: 'radial-gradient(ellipse at center, #0a0c16 0%, #05060c 70%, #000 100%)',
        width: `min(100%, ${WIDTH}px)`, aspectRatio: `${WIDTH} / ${HEIGHT}`, overflow: 'hidden', flexShrink: 1, userSelect: 'none',
        cursor: isDragging ? 'grabbing' : hover ? 'pointer' : 'grab',
      }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        setHover(null)
        dragRef.current = null
        setIsDragging(false)
      }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={webglCanvasRef}
        style={{
          width: '100%', height: '100%',
          position: 'absolute', top: 0, left: 0, zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={overlayCanvasRef}
        style={{
          width: '100%', height: '100%',
          position: 'absolute', top: 0, left: 0, zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {hover && renderHoverTooltip?.(hover, mousePos)}
      {moved && (
        <button
          onClick={(e) => { e.stopPropagation(); resetView() }}
          style={{
            position: 'absolute', top: 6, left: 6, fontSize: 11, padding: '2px 6px',
            background: 'rgba(20,20,30,0.8)', color: '#fff', border: '1px solid #445',
            borderRadius: 3, cursor: 'pointer',
          }}
          title="Reset camera"
        >reset view</button>
      )}
      {children}
    </div>
  )
}

// Canvas overlay: render expression text next to the top-N nodes by a chosen metric.
// Returns a function compatible with GraphCanvas's `renderOverlays` prop.
//
// The signature is (projected, nodes, options) → (ctx, view) => void so callers can
// memoize the outer call and pass the resulting painter into the canvas.

import { CX, CY, R } from '../constants.js'

export function makeLabelsOverlay(projected, nodes, {
  topN = 10,
  metric = 'hubness',
  maxLengthChars = 8,
  textColor = '#fff',
  shadowColor = '#0b0d14',
} = {}) {
  if (!projected?.points?.length || !nodes?.length) return null
  const indexed = nodes.map((n, i) => ({ n, i }))
  // Sort descending by metric; skip non-finite.
  indexed.sort((a, b) => (b.n[metric] || 0) - (a.n[metric] || 0))
  const picks = new Set(indexed.slice(0, topN).map(x => x.n.id))
  const pointById = new Map(projected.points.map(p => [p.id, p]))
  return (ctx, { scale }) => {
    ctx.save()
    ctx.font = `${13 / scale}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3 / scale
    ctx.strokeStyle = shadowColor
    ctx.fillStyle = textColor
    for (const id of picks) {
      const p = pointById.get(id)
      if (!p) continue
      const node = p.ref
      const text = (node.expression || '').slice(0, maxLengthChars)
      if (!text) continue
      const offsetY = 10 / scale
      ctx.strokeText(text, p.sx, p.sy - offsetY)
      ctx.fillText(text, p.sx, p.sy - offsetY)
    }
    ctx.restore()
  }
}

// Ring-highlight overlay: draws a ring around a set of node IDs. Used by Search to mark
// matches. In the galaxy view the canvas passes { screenProj, points } where screenProj
// holds CPU-projected (sx, sy) indexed the same as points — so we map id → index → screen.
export function makeRingsOverlay(projected, ids, { color = '#facc15', lineWidth = 2 } = {}) {
  if (!projected?.points?.length || !ids?.size) return null
  return (ctx, { screenProj }) => {
    if (!screenProj) return
    const { sx, sy } = screenProj
    const pts = projected.points
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    for (let i = 0; i < pts.length; i++) {
      if (!ids.has(pts[i].id)) continue
      ctx.beginPath()
      ctx.arc(sx[i], sy[i], 11, 0, 2 * Math.PI)
      ctx.stroke()
    }
    ctx.restore()
  }
}

// Composes multiple overlays into one render call, invoked in order so later ones draw
// on top of earlier ones.
export function composeOverlays(...fns) {
  const live = fns.filter(Boolean)
  if (!live.length) return null
  return (ctx, view) => { for (const f of live) f(ctx, view) }
}

// Export constants for any overlay that wants to draw relative to the disc boundary.
export const DISC_GEOM = { CX, CY, R }

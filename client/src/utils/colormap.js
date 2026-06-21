// Viridis-inspired sequential colormap for continuous per-node metrics. t ∈ [0, 1], maps to
// an `rgb(r,g,b)` string. Extracted from the original monolithic GraphView.jsx so both the
// task panels and the canvas overlay code can use the same mapping.

// Per-metric colour ramps.
const CUSTOM_RAMPS = {
  retrievability: [[0, [139,32,32]], [0.5, [232,156,26]], [1, [76,224,122]]], // red → amber → green
  difficulty:     [[0, [40,180,90]], [0.5, [232,208,32]], [1, [224,64,48]]], // green → yellow → red
}

function flatRamp(stops) {
  const out = new Float32Array(stops.length * 4)
  for (let i = 0; i < stops.length; i++) {
    const [t, [r, g, b]] = stops[i]
    out[i * 4]     = t
    out[i * 4 + 1] = r / 255
    out[i * 4 + 2] = g / 255
    out[i * 4 + 3] = b / 255
  }
  return out
}
const CUSTOM_RAMPS_FLAT = {}
for (const [key, stops] of Object.entries(CUSTOM_RAMPS)) {
  CUSTOM_RAMPS_FLAT[key] = flatRamp(stops)
}

// Viridis sequential colormap. Keep in sync with the VIRIDIS table in
// optimizers.worker.js (the GPU color path re-implements it there to avoid a
// worker import).
export const VIRIDIS_STOPS = [
  [0.0,  [ 68,   1,  84]],
  [0.25, [ 59,  82, 139]],
  [0.5,  [ 33, 144, 141]],
  [0.75, [ 94, 201,  98]],
  [1.0,  [253, 231,  37]],
]

export function gradientColor(t, rampKey) {
  const stops = CUSTOM_RAMPS[rampKey] || VIRIDIS_STOPS
  const u = Math.max(0, Math.min(1, t))
  for (let i = 0; i < VIRIDIS_STOPS.length - 1; i++) {
    const [t0, c0] = VIRIDIS_STOPS[i]
    const [t1, c1] = VIRIDIS_STOPS[i + 1]
    if (u <= t1) {
      const a = (u - t0) / Math.max(t1 - t0, 1e-9)
      const r = Math.round(c0[0] + a * (c1[0] - c0[0]))
      const g = Math.round(c0[1] + a * (c1[1] - c0[1]))
      const b = Math.round(c0[2] + a * (c1[2] - c0[2]))
      return `rgb(${r},${g},${b})`
    }
  }
  const last = VIRIDIS_STOPS[VIRIDIS_STOPS.length - 1][1]
  return `rgb(${last.join(',')})`
}

// Neutral default color when no metric or similarity is set. Used by the canvas when
// colorForNode returns a fallback.
export const DEFAULT_POINT_COLOR = '#60a5fa'

// Flat Float32 VIRIDIS table: [t0, r0, g0, b0, t1, r1, g1, b1, ...] with r/g/b in
// [0, 1]. Used by colorizeSync for a tight per-node loop with no string allocation.
const VIRIDIS_FLAT = (() => {
  const out = new Float32Array(VIRIDIS_STOPS.length * 4)
  for (let i = 0; i < VIRIDIS_STOPS.length; i++) {
    const [t, [r, g, b]] = VIRIDIS_STOPS[i]
    out[i * 4]     = t
    out[i * 4 + 1] = r / 255
    out[i * 4 + 2] = g / 255
    out[i * 4 + 3] = b / 255
  }
  return out
})()
const DEFAULT_RGB_NORM = [0x60 / 255, 0xa5 / 255, 0xfa / 255]

// Main-thread equivalent of the worker's colorize handler. Takes a Float32Array of
// values + range/diverging flag, returns Float32Array(N*3) of RGB in [0, 1] ready
// to upload to a WebGL vertex attribute. Runs synchronously (~2 ms for N=10k), so
// it can't stall behind a long SGD job the way the worker colorize path did.
export function colorizeSync(values, { lo = 0, hi = 1, diverging = false, ramp = null } = {}) {
  const N = values.length
  const out = new Float32Array(N * 3)
  const span = Math.max(hi - lo, 1e-9)
  const flat = CUSTOM_RAMPS_FLAT[ramp] || VIRIDIS_FLAT
  const stops = flat.length / 4
  for (let i = 0; i < N; i++) {
    const v = values[i]
    const o = i * 3
    if (!Number.isFinite(v)) {
      out[o] = DEFAULT_RGB_NORM[0]; out[o + 1] = DEFAULT_RGB_NORM[1]; out[o + 2] = DEFAULT_RGB_NORM[2]
      continue
    }
    if (diverging) {
      const u = Math.max(-1, Math.min(1, v))
      if (u >= 0) {
        out[o]     = (220 + u * 35) / 255
        out[o + 1] = (220 - u * 160) / 255
        out[o + 2] = (220 - u * 160) / 255
      } else {
        const a = -u
        out[o]     = (220 - a * 160) / 255
        out[o + 1] = (220 - a * 160) / 255
        out[o + 2] = (220 + a * 35) / 255
      }
      continue
    }
    const u = Math.max(0, Math.min(1, (v - lo) / span))
    let r = flat[(stops - 1) * 4 + 1]
    let g = flat[(stops - 1) * 4 + 2]
    let b = flat[(stops - 1) * 4 + 3]
    for (let s = 0; s < stops - 1; s++) {
      const t1 = flat[(s + 1) * 4]
      if (u <= t1) {
        const t0 = flat[s * 4]
        const a = (u - t0) / Math.max(t1 - t0, 1e-9)
        const r0 = flat[s * 4 + 1], r1 = flat[(s + 1) * 4 + 1]
        const g0 = flat[s * 4 + 2], g1 = flat[(s + 1) * 4 + 2]
        const b0 = flat[s * 4 + 3], b1 = flat[(s + 1) * 4 + 3]
        r = r0 + a * (r1 - r0)
        g = g0 + a * (g1 - g0)
        b = b0 + a * (b1 - b0)
        break
      }
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b
  }
  return out
}

// Diverging red/grey/blue colormap for signed values (residuals). t ∈ [-1, 1]:
//   t = -1 → deep blue, t = 0 → light grey, t = +1 → deep red.
// Residuals use this so the sign is visually distinguishable — viridis would hide it.
export function divergingColor(t) {
  const u = Math.max(-1, Math.min(1, t))
  if (u >= 0) {
    // grey → red
    const r = Math.round(220 + u * 35)
    const g = Math.round(220 - u * 160)
    const b = Math.round(220 - u * 160)
    return `rgb(${r},${g},${b})`
  }
  // grey → blue
  const a = -u
  const r = Math.round(220 - a * 160)
  const g = Math.round(220 - a * 160)
  const b = Math.round(220 + a * 35)
  return `rgb(${r},${g},${b})`
}

// Shared constants for the graph viz. Extracted from the original monolithic GraphView so
// every sub-component (canvas, axis pads, tasks, overlays) reads the same numbers.

// Canvas dimensions in CSS pixels. The canvas element is scaled by devicePixelRatio
// internally for crisp rendering on high-DPI displays; these are the logical sizes the
// rest of the layout assumes.
export const WIDTH = 500
export const HEIGHT = 500
export const CX = WIDTH / 2
export const CY = HEIGHT / 2

// Unit-disk radius in pixels. Anything projected to 2D with `|pos| = 1` lands exactly on
// this circle. The dashed boundary in the canvas renders at this radius.
export const R = 215

// Max PC axes the backend ships via /api/graph?topK=. 384 = full embedding dimension;
// past ~100 eigenvalues are tiny but every PC is exposed in the paginated grid.
// Payload on a 7k-node deck at this cap is ~60 MB uncompressed.
export const TOP_K = 384

// Each AxisPad SVG canvas is SIZE × SIZE px. Absolutely centered in the outer card
// (AXIS_PAD_CARD); the label/readout rows overlay it so the canvas can fill the card
// width without displacing text. Capped to the card interior minus side padding.
export const AXIS_PAD_SIZE = 81
// Outer card dimensions — must match AxisPadGrid's column width.
export const AXIS_PAD_CARD = 108

// Stride-sampling threshold — if the deck is larger than this, the server samples it down
// before running PCA + metrics. The client respects the sampled response (sampled=true +
// totalWords in the reply) to display a banner.
export const MAX_NODES = 10000

// The projection is a K×3 matrix W: row k is PC k's 3D world axis [wx, wy, wz], i.e. how
// much PC k pushes a word along the world X, Y and Z axes. A word at PC-score vector v
// lands at position v·W. Stored column-wise as three length-K arrays for tight inner
// loops. This single matrix replaces the old (mags, angles, zElevations) spherical
// parameterization — there is nothing the angles could express that a row of W cannot.
//
// Default: PC0→X, PC1→Y, PC2→Z (each at unit weight), all other PCs silent. Gives the
// galaxy immediate 3D depth on load.
export const defaultW = () => {
  const wx = new Array(TOP_K).fill(0)
  const wy = new Array(TOP_K).fill(0)
  const wz = new Array(TOP_K).fill(0)
  wx[0] = 1
  wy[1] = 1
  wz[2] = 1
  return { wx, wy, wz }
}

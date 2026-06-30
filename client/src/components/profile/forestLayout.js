// Pure forest hierarchy layout — no Three.js, no DOM, no React.
// These functions can be imported and unit-tested with Vitest.
//
// Forest edge `kind` labels the PARENT's role in the hierarchy:
//   root      → parent is a root node, child is a topic superset
//   superset  → parent is a superset, child is a situation (scenario context)
//   situation → parent is a situation, child is a word leaf
//
// Radii are tuned so the layers read clearly at the camera's default distance
// of 12 units (minDistance 4, maxDistance 22 in the Three.js scene).

export const LAYER_RADII = Object.freeze({
  root:      0,    // root at the origin
  superset:  2.5,  // topic clusters on an inner sphere
  situation: 4.8,  // scenario contexts on a mid sphere
  word:      6.8,  // vocabulary leaves on the outer sphere
})

// ── Hierarchy builder ───────────────────────────────────────────────────────

/**
 * Build a hierarchy descriptor from a flat list of forest edges.
 *
 * Returns:
 *   children  — Map<parentId: string → childId: string[]>
 *   nodeKind  — Map<nodeId: string → 'root'|'superset'|'situation'|'word'>
 */
export function buildForestHierarchy(forestEdges) {
  const children = new Map()
  const nodeKind = new Map()

  for (const edge of (forestEdges ?? [])) {
    const parent = String(edge.parentId ?? '')
    const child = String(edge.childId ?? '')
    const kind = String(edge.kind ?? '')
    if (!parent || !child || !kind) continue

    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push(child)

    if (kind === 'root') {
      if (!nodeKind.has(parent)) nodeKind.set(parent, 'root')
      if (!nodeKind.has(child)) nodeKind.set(child, 'superset')
    } else if (kind === 'superset') {
      if (!nodeKind.has(parent)) nodeKind.set(parent, 'superset')
      if (!nodeKind.has(child)) nodeKind.set(child, 'situation')
    } else if (kind === 'situation') {
      if (!nodeKind.has(parent)) nodeKind.set(parent, 'situation')
      if (!nodeKind.has(child)) nodeKind.set(child, 'word')
    }
  }

  return { children, nodeKind }
}

// ── 3D math helpers ─────────────────────────────────────────────────────────

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2])
  return len > 1e-9 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0]
}

function scale3(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s]
}

// Distributes n points evenly on a unit sphere via the golden-angle spiral.
// Stable for n >= 1.
function sphericalFibonacci(n) {
  if (n <= 0) return []
  if (n === 1) return [[0, 1, 0]]
  const phi = (1 + Math.sqrt(5)) / 2
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = 2 * Math.PI * i / phi
    return [r * Math.cos(theta), y, r * Math.sin(theta)]
  })
}

// Builds a local orthonormal frame with `axis` as the forward direction.
function localFrame(axis) {
  const ax = normalize3(axis)
  // Pick a reference vector that is not parallel to ax.
  const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const right = normalize3([
    ref[1] * ax[2] - ref[2] * ax[1],
    ref[2] * ax[0] - ref[0] * ax[2],
    ref[0] * ax[1] - ref[1] * ax[0],
  ])
  const up = [
    ax[1] * right[2] - ax[2] * right[1],
    ax[2] * right[0] - ax[0] * right[2],
    ax[0] * right[1] - ax[1] * right[0],
  ]
  return { ax, right, up }
}

// Places n points in a cone of `halfAngleDeg` around `axis` at distance `r`.
// Uses the golden angle for a non-repeating azimuthal distribution.
function coneDistribute(n, axis, r, halfAngleDeg = 52) {
  if (n === 0) return []
  const dir = normalize3(axis)
  if (n === 1) return [scale3(dir, r)]

  const { ax, right, up } = localFrame(dir)
  const halfAngle = (halfAngleDeg * Math.PI) / 180
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)) // ≈ 137.5°

  return Array.from({ length: n }, (_, i) => {
    // Linear interpolation in cosine-space gives uniform area density.
    const t = i / (n - 1)
    const cosTheta = 1 - t * (1 - Math.cos(halfAngle))
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
    const alpha = goldenAngle * i
    const lx = sinTheta * Math.cos(alpha)
    const ly = sinTheta * Math.sin(alpha)
    const lz = cosTheta
    // Transform from local frame to world space.
    return scale3(
      normalize3([
        lx * right[0] + ly * up[0] + lz * ax[0],
        lx * right[1] + ly * up[1] + lz * ax[1],
        lx * right[2] + ly * up[2] + lz * ax[2],
      ]),
      r,
    )
  })
}

// ── Position computation ────────────────────────────────────────────────────

/**
 * Compute 3D positions for every node in the hierarchy.
 *
 * Layout contract:
 *   root(s)     → at / near the origin
 *   supersets   → on a sphere of radius LAYER_RADII.superset
 *   situations  → in a 52° cone around their parent superset, radius .situation
 *   word leaves → in a 40° cone around their parent situation, radius .word
 *
 * Returns Map<nodeId: string → [x, y, z]>.
 */
export function computeForestPositions(hierarchy) {
  const { children, nodeKind } = hierarchy
  const positions = new Map()

  // Root nodes: have kind='root' and are not themselves a child of anything.
  const allChildIds = new Set()
  for (const kids of children.values()) {
    for (const kid of kids) allChildIds.add(kid)
  }
  const rootIds = [...nodeKind.entries()]
    .filter(([id, kind]) => kind === 'root' && !allChildIds.has(id))
    .map(([id]) => id)

  if (rootIds.length === 0) return positions

  // Multiple roots share a tiny sphere so each subtree gets its own sector.
  const rootPositions =
    rootIds.length === 1
      ? [[0, 0, 0]]
      : sphericalFibonacci(rootIds.length).map(dir => scale3(dir, 0.8))

  rootIds.forEach((rootId, ri) => {
    positions.set(rootId, rootPositions[ri])

    const supersetIds = children.get(rootId) ?? []
    const supersetDirs = sphericalFibonacci(supersetIds.length)

    supersetIds.forEach((ssId, si) => {
      const ssPos = scale3(supersetDirs[si] ?? [0, 1, 0], LAYER_RADII.superset)
      positions.set(ssId, ssPos)

      const situationIds = children.get(ssId) ?? []
      const sitPositions = coneDistribute(situationIds.length, ssPos, LAYER_RADII.situation)

      situationIds.forEach((sitId, wi) => {
        const sitPos = sitPositions[wi] ?? scale3(normalize3(ssPos), LAYER_RADII.situation)
        positions.set(sitId, sitPos)

        const wordIds = children.get(sitId) ?? []
        const wordPositions = coneDistribute(wordIds.length, sitPos, LAYER_RADII.word, 40)
        wordIds.forEach((wordId, k) => {
          positions.set(
            wordId,
            wordPositions[k] ?? scale3(normalize3(sitPos), LAYER_RADII.word),
          )
        })
      })
    })
  })

  return positions
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Applies the forest hierarchy layout to an existing flat graph.
 *
 * Returns null when the forest data is insufficient to build a layout (empty
 * edges, no valid root, etc.) — callers should fall back to the flat
 * constellation when this returns null.
 *
 * When non-null, returns:
 *   wordNodes       — the original graph nodes with x/y/z overridden by the
 *                     forest layout (nodes not found in the forest keep their
 *                     original PCA positions)
 *   structuralNodes — synthetic nodes for root / superset / situation
 *                     hierarchy levels, each with nodeType + label
 *   forestEdgeLines — [{source, target}] for rendering parent→child lines
 */
export function applyForestLayout(nodes, forest) {
  if (!forest?.edges?.length) return null

  const hierarchy = buildForestHierarchy(forest.edges)
  if (hierarchy.nodeKind.size === 0) return null

  const posMap = computeForestPositions(hierarchy)
  if (posMap.size === 0) return null

  const labels = forest.labels ?? {}

  // Override positions for word leaf nodes; nodes absent from the forest keep
  // their server-computed PCA positions so nothing disappears.
  const wordNodes = nodes.map(node => {
    const pos = posMap.get(node.id)
    return pos ? { ...node, x: pos[0], y: pos[1], z: pos[2] } : node
  })

  // Synthetic hierarchy nodes (root / superset / situation).  Word leaves are
  // already in `wordNodes` via `nodes`, so we only emit non-word entries here.
  const structuralNodes = []
  for (const [nodeId, kind] of hierarchy.nodeKind) {
    if (kind === 'word') continue
    const pos = posMap.get(nodeId)
    if (!pos) continue
    structuralNodes.push({
      id: nodeId,
      nodeType: kind,
      label: labels[nodeId] ?? nodeId,
      x: pos[0],
      y: pos[1],
      z: pos[2],
    })
  }

  const forestEdgeLines = forest.edges.map(e => ({
    source: String(e.parentId),
    target: String(e.childId),
  }))

  return { wordNodes, structuralNodes, forestEdgeLines }
}

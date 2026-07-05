// Pure data shaping for the 3D word forest: root -> superset trees -> word
// nodes (docs/contracts/word-graph-payload.md). Kept free of Three.js so it's
// covered by plain Vitest; WordConstellation3D.jsx does the actual rendering.

// Mastery tiers per the contract: 0 encountered, 1 used once, 2 recurring,
// 3 mastered. Same palette family as the legend in userProfile.css.
const TIER_COLORS = ['#6b7684', '#ff8da1', '#79c7ff', '#63e6be']
const STALE_COLOR = '#f2a33a'

export function masteryTierColor(tier) {
  const index = Math.max(0, Math.min(TIER_COLORS.length - 1, Math.round(Number(tier) || 0)))
  return TIER_COLORS[index]
}

export function staleColor() {
  return STALE_COLOR
}

// A word counts as stale once it's gone unused past the threshold. No
// lastUsedAt (never mirrored, or a word with no review yet) is never stale —
// there's nothing to have gone quiet on.
export function isStale(lastUsedAt, { now = Date.now(), thresholdDays = 14 } = {}) {
  if (!lastUsedAt) return false
  const then = new Date(lastUsedAt).getTime()
  if (!Number.isFinite(then)) return false
  return (now - then) / 86_400_000 > thresholdDays
}

// Synthesizes root + superset-tree nodes (the payload only carries grouping
// metadata, not their own coordinates) by centroiding each tree's word
// positions, then wires root -> tree -> word edges for the forest view.
export function buildForestLayout(nodes, trees) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const treeNodes = (trees ?? [])
    .map((tree) => {
      const members = tree.wordIds.map((id) => nodeById.get(id)).filter(Boolean)
      if (members.length === 0) return null
      const centroid = members.reduce(
        (acc, node) => ({ x: acc.x + node.x / members.length, y: acc.y + node.y / members.length, z: acc.z + node.z / members.length }),
        { x: 0, y: 0, z: 0 },
      )
      return { id: `tree:${tree.superset}`, superset: tree.superset, ...centroid, wordIds: members.map((m) => m.id) }
    })
    .filter(Boolean)

  const root = { id: 'root', x: 0, y: 0, z: 0 }
  const treeEdges = treeNodes.map((tree) => ({ source: root.id, target: tree.id }))
  const wordEdges = treeNodes.flatMap((tree) => tree.wordIds.map((wordId) => ({ source: tree.id, target: wordId })))

  return { root, treeNodes, treeEdges, wordEdges }
}

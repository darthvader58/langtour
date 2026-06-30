import { describe, expect, it } from 'vitest'
import {
  LAYER_RADII,
  applyForestLayout,
  buildForestHierarchy,
  computeForestPositions,
} from './forestLayout'

// ── buildForestHierarchy ────────────────────────────────────────────────────

describe('buildForestHierarchy', () => {
  it('returns empty maps for empty edges', () => {
    const { children, nodeKind } = buildForestHierarchy([])
    expect(children.size).toBe(0)
    expect(nodeKind.size).toBe(0)
  })

  it('returns empty maps for null / undefined input', () => {
    const { children, nodeKind } = buildForestHierarchy(null)
    expect(children.size).toBe(0)
    expect(nodeKind.size).toBe(0)
  })

  it('builds correct child lists and node kinds from a minimal forest', () => {
    const edges = [
      { parentId: 'root', childId: 'food', kind: 'root' },
      { parentId: 'food', childId: 'restaurant', kind: 'superset' },
      { parentId: 'restaurant', childId: '42', kind: 'situation' },
    ]
    const { children, nodeKind } = buildForestHierarchy(edges)

    expect(children.get('root')).toEqual(['food'])
    expect(children.get('food')).toEqual(['restaurant'])
    expect(children.get('restaurant')).toEqual(['42'])
    expect(nodeKind.get('root')).toBe('root')
    expect(nodeKind.get('food')).toBe('superset')
    expect(nodeKind.get('restaurant')).toBe('situation')
    expect(nodeKind.get('42')).toBe('word')
  })

  it('accumulates multiple children under one parent', () => {
    const edges = [
      { parentId: 'root', childId: 'food', kind: 'root' },
      { parentId: 'root', childId: 'transport', kind: 'root' },
    ]
    const { children } = buildForestHierarchy(edges)
    expect(children.get('root')).toEqual(['food', 'transport'])
  })

  it('ignores edges with an empty parentId, childId, or kind', () => {
    const edges = [
      { parentId: '', childId: 'food', kind: 'root' },
      { parentId: 'root', childId: '', kind: 'root' },
      { parentId: 'root', childId: 'food', kind: '' },
    ]
    const { children, nodeKind } = buildForestHierarchy(edges)
    expect(children.size).toBe(0)
    expect(nodeKind.size).toBe(0)
  })

  it('does not overwrite an established nodeKind when the same node appears again', () => {
    // 'food' first appears as a superset child, then also as a superset parent
    // — the first established kind should hold.
    const edges = [
      { parentId: 'root', childId: 'food', kind: 'root' },      // food → superset
      { parentId: 'food', childId: 'restaurant', kind: 'superset' }, // food → already superset
    ]
    const { nodeKind } = buildForestHierarchy(edges)
    expect(nodeKind.get('food')).toBe('superset')
  })
})

// ── computeForestPositions ──────────────────────────────────────────────────

const MINIMAL_HIERARCHY = buildForestHierarchy([
  { parentId: 'root', childId: 'food', kind: 'root' },
  { parentId: 'food', childId: 'restaurant', kind: 'superset' },
  { parentId: 'restaurant', childId: '1', kind: 'situation' },
  { parentId: 'restaurant', childId: '2', kind: 'situation' },
])

describe('computeForestPositions', () => {
  it('returns an empty map for an empty hierarchy', () => {
    const pos = computeForestPositions(buildForestHierarchy([]))
    expect(pos.size).toBe(0)
  })

  it('places the root node at the origin', () => {
    const pos = computeForestPositions(MINIMAL_HIERARCHY)
    expect(pos.get('root')).toEqual([0, 0, 0])
  })

  it('places the superset at the superset layer radius', () => {
    const pos = computeForestPositions(MINIMAL_HIERARCHY)
    const [x, y, z] = pos.get('food')
    expect(Math.hypot(x, y, z)).toBeCloseTo(LAYER_RADII.superset, 5)
  })

  it('places the situation roughly at the situation layer radius', () => {
    const pos = computeForestPositions(MINIMAL_HIERARCHY)
    const [rx, ry, rz] = pos.get('restaurant')
    // A single situation is placed exactly on the parent direction → exact radius.
    expect(Math.hypot(rx, ry, rz)).toBeCloseTo(LAYER_RADII.situation, 5)
  })

  it('places word leaves at the word layer radius', () => {
    const pos = computeForestPositions(MINIMAL_HIERARCHY)
    for (const id of ['1', '2']) {
      const [x, y, z] = pos.get(id)
      expect(Math.hypot(x, y, z)).toBeCloseTo(LAYER_RADII.word, 5)
    }
  })

  it('positions word leaves farther from origin than situations', () => {
    const pos = computeForestPositions(MINIMAL_HIERARCHY)
    const sitDist = Math.hypot(...pos.get('restaurant'))
    const w1Dist = Math.hypot(...pos.get('1'))
    const w2Dist = Math.hypot(...pos.get('2'))
    expect(w1Dist).toBeGreaterThan(sitDist)
    expect(w2Dist).toBeGreaterThan(sitDist)
  })

  it('handles multiple supersets without overlapping them', () => {
    const hierarchy = buildForestHierarchy([
      { parentId: 'root', childId: 'food', kind: 'root' },
      { parentId: 'root', childId: 'transport', kind: 'root' },
    ])
    const pos = computeForestPositions(hierarchy)
    const [fx, fy, fz] = pos.get('food')
    const [tx, ty, tz] = pos.get('transport')
    // Two supersets should not land in the exact same spot.
    const dist = Math.hypot(fx - tx, fy - ty, fz - tz)
    expect(dist).toBeGreaterThan(0.1)
  })
})

// ── applyForestLayout ───────────────────────────────────────────────────────

const WORD_NODES = [
  { id: '1', expression: 'bonjour', translation: 'hello', retrievability: 0.95, stability: 9, mastered: true, x: 1, y: 0, z: 0 },
  { id: '2', expression: 'merci', translation: 'thank you', retrievability: 0.5, stability: 2, mastered: false, x: -1, y: 0, z: 0 },
]

const FULL_FOREST = {
  edges: [
    { parentId: 'root', childId: 'language', kind: 'root' },
    { parentId: 'language', childId: 'greetings', kind: 'superset' },
    { parentId: 'greetings', childId: '1', kind: 'situation' },
    { parentId: 'greetings', childId: '2', kind: 'situation' },
  ],
  labels: { language: 'Language Basics', greetings: 'Greetings & Pleasantries' },
}

describe('applyForestLayout', () => {
  it('returns null when forest is null', () => {
    expect(applyForestLayout(WORD_NODES, null)).toBeNull()
  })

  it('returns null when forest has no edges', () => {
    expect(applyForestLayout(WORD_NODES, { edges: [] })).toBeNull()
    expect(applyForestLayout(WORD_NODES, {})).toBeNull()
  })

  it('returns word nodes with forest positions applied', () => {
    const result = applyForestLayout(WORD_NODES, FULL_FOREST)
    expect(result).not.toBeNull()
    expect(result.wordNodes).toHaveLength(2)
    const n1 = result.wordNodes.find(n => n.id === '1')
    const n2 = result.wordNodes.find(n => n.id === '2')
    // Positions must differ from the original PCA values (1,0,0) and (-1,0,0).
    expect(n1.x).not.toBe(1)
    expect(n2.x).not.toBe(-1)
    // Original expression field must be preserved.
    expect(n1.expression).toBe('bonjour')
    expect(n2.expression).toBe('merci')
  })

  it('creates structural nodes for root / superset / situation kinds', () => {
    const result = applyForestLayout(WORD_NODES, FULL_FOREST)
    const kinds = result.structuralNodes.map(n => n.nodeType).sort()
    expect(kinds).toContain('root')
    expect(kinds).toContain('superset')
    expect(kinds).toContain('situation')
    // Word leaves must NOT appear in structuralNodes.
    expect(result.structuralNodes.some(n => n.nodeType === 'word')).toBe(false)
  })

  it('resolves labels from the forest labels map', () => {
    const result = applyForestLayout(WORD_NODES, FULL_FOREST)
    const lang = result.structuralNodes.find(n => n.id === 'language')
    const greet = result.structuralNodes.find(n => n.id === 'greetings')
    expect(lang?.label).toBe('Language Basics')
    expect(greet?.label).toBe('Greetings & Pleasantries')
  })

  it('falls back to the node id as label when no label entry exists', () => {
    const forest = { edges: FULL_FOREST.edges }  // no labels map
    const result = applyForestLayout(WORD_NODES, forest)
    const lang = result.structuralNodes.find(n => n.id === 'language')
    expect(lang?.label).toBe('language')
  })

  it('generates forest edge lines for every edge', () => {
    const result = applyForestLayout(WORD_NODES, FULL_FOREST)
    expect(result.forestEdgeLines).toHaveLength(FULL_FOREST.edges.length)
    expect(result.forestEdgeLines).toContainEqual({ source: 'root', target: 'language' })
    expect(result.forestEdgeLines).toContainEqual({ source: 'greetings', target: '1' })
  })

  it('preserves PCA positions for word nodes absent from the forest', () => {
    // A node with id '99' is not referenced in the forest edges.
    const nodesWithOrphan = [
      ...WORD_NODES,
      { id: '99', expression: 'orphan', x: 3.5, y: 1.2, z: -0.7, retrievability: 0, stability: 0, mastered: false },
    ]
    const result = applyForestLayout(nodesWithOrphan, FULL_FOREST)
    const orphan = result.wordNodes.find(n => n.id === '99')
    expect(orphan).toBeDefined()
    expect(orphan.x).toBe(3.5)
    expect(orphan.y).toBe(1.2)
    expect(orphan.z).toBe(-0.7)
  })
})

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MASTERY_COLORS } from '../../countryTheme'
import { applyForestLayout } from './forestLayout'

// Word-leaf mastery coloring — driven by MASTERY_COLORS in countryTheme.js,
// never hardcoded in this component.
function wordNodeColor(node) {
  if (node.mastered || (node.stability >= 7 && node.retrievability >= 0.9))
    return new THREE.Color(MASTERY_COLORS.mastered)
  if (node.retrievability >= 0.75)
    return new THREE.Color(MASTERY_COLORS.learning)
  if (node.retrievability > 0)
    return new THREE.Color(MASTERY_COLORS.due)
  return new THREE.Color(MASTERY_COLORS.unseen)
}

// Structural hierarchy node coloring (root / superset / situation).
function structuralNodeColor(nodeType) {
  switch (nodeType) {
    case 'root':      return new THREE.Color(MASTERY_COLORS.root)
    case 'superset':  return new THREE.Color(MASTERY_COLORS.superset)
    case 'situation': return new THREE.Color(MASTERY_COLORS.situation)
    default:          return new THREE.Color(MASTERY_COLORS.unseen)
  }
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose()
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose())
    else child.material?.dispose()
  })
}

export default function WordConstellation3D({ graph, loading, error, title }) {
  const mountRef = useRef(null)
  const [hovered, setHovered] = useState(null)
  const [webglError, setWebglError] = useState('')

  const nodeSignature = useMemo(
    () => graph.nodes.map((n) => `${n.id}:${n.x}:${n.y}:${n.z}`).join('|'),
    [graph.nodes],
  )
  const edgeSignature = useMemo(
    () => graph.edges.map((e) => `${e.source}:${e.target}`).join('|'),
    [graph.edges],
  )
  const forestSignature = useMemo(
    () => (graph.forest?.edges ?? []).map((e) => `${e.parentId}:${e.childId}:${e.kind}`).join('|'),
    [graph.forest],
  )

  // Whether the graph has a usable forest hierarchy.
  const hasForest = Boolean(graph.forest?.edges?.length)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !graph.nodes.length) return undefined

    // Compute forest layout inside the effect so it is consistent with the
    // Three.js scene build — no need for a separate memo.
    const forestLayout = hasForest ? applyForestLayout(graph.nodes, graph.forest) : null

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      queueMicrotask(() => setWebglError('3D view is unavailable on this device.'))
      return undefined
    }

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0xe7f2f8, 0.045)
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100)
    camera.position.set(0, 1, 12)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0xe7f2f8, 0)
    renderer.domElement.setAttribute('aria-hidden', 'true')
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.minDistance = 4
    controls.maxDistance = 22
    controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.autoRotateSpeed = 0.28

    const raycaster = new THREE.Raycaster()
    raycaster.params.Points.threshold = 0.22
    const pointer = new THREE.Vector2()

    // Ambient dust — same in both modes.
    const dustGeometry = new THREE.BufferGeometry()
    const dust = new Float32Array(240 * 3)
    for (let i = 0; i < dust.length; i += 3) {
      dust[i] = (Math.random() - 0.5) * 22
      dust[i + 1] = (Math.random() - 0.5) * 14
      dust[i + 2] = (Math.random() - 0.5) * 14
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3))
    scene.add(
      new THREE.Points(
        dustGeometry,
        new THREE.PointsMaterial({ color: 0x7b9db7, size: 0.022, transparent: true, opacity: 0.3 }),
      ),
    )

    let handlePointer

    if (forestLayout) {
      // ── Forest hierarchy mode ──────────────────────────────────────────────
      const { wordNodes, structuralNodes, forestEdgeLines } = forestLayout

      // Word leaf points — colored by mastery state.
      const wordPositions = new Float32Array(wordNodes.length * 3)
      const wordColors = new Float32Array(wordNodes.length * 3)
      wordNodes.forEach((node, i) => {
        wordPositions.set([node.x, node.y, node.z], i * 3)
        const color = wordNodeColor(node)
        wordColors.set([color.r, color.g, color.b], i * 3)
      })
      const wordGeometry = new THREE.BufferGeometry()
      wordGeometry.setAttribute('position', new THREE.BufferAttribute(wordPositions, 3))
      wordGeometry.setAttribute('color', new THREE.BufferAttribute(wordColors, 3))
      const wordPoints = new THREE.Points(
        wordGeometry,
        new THREE.PointsMaterial({ size: 0.22, vertexColors: true, sizeAttenuation: true }),
      )
      scene.add(wordPoints)

      // Structural hierarchy nodes — larger points with type-specific color.
      let structPoints = null
      if (structuralNodes.length) {
        const structPositions = new Float32Array(structuralNodes.length * 3)
        const structColors = new Float32Array(structuralNodes.length * 3)
        structuralNodes.forEach((node, i) => {
          structPositions.set([node.x, node.y, node.z], i * 3)
          const color = structuralNodeColor(node.nodeType)
          structColors.set([color.r, color.g, color.b], i * 3)
        })
        const structGeometry = new THREE.BufferGeometry()
        structGeometry.setAttribute('position', new THREE.BufferAttribute(structPositions, 3))
        structGeometry.setAttribute('color', new THREE.BufferAttribute(structColors, 3))
        structPoints = new THREE.Points(
          structGeometry,
          new THREE.PointsMaterial({ size: 0.52, vertexColors: true, sizeAttenuation: true }),
        )
        scene.add(structPoints)
      }

      // Forest hierarchy edges (parent → child connecting lines).
      const allNodes = new Map()
      for (const n of wordNodes) allNodes.set(n.id, n)
      for (const n of structuralNodes) allNodes.set(n.id, n)

      const forestLinePositions = []
      for (const { source, target } of forestEdgeLines) {
        const s = allNodes.get(source)
        const t = allNodes.get(target)
        if (s && t) forestLinePositions.push(s.x, s.y, s.z, t.x, t.y, t.z)
      }
      if (forestLinePositions.length) {
        const forestLinesGeom = new THREE.BufferGeometry()
        forestLinesGeom.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(forestLinePositions, 3),
        )
        scene.add(
          new THREE.LineSegments(
            forestLinesGeom,
            new THREE.LineBasicMaterial({ color: 0x446688, transparent: true, opacity: 0.38 }),
          ),
        )
      }

      // Raycaster: check word leaves first, then structural nodes.
      handlePointer = (event) => {
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)

        const wordHit = raycaster.intersectObject(wordPoints)[0]
        if (wordHit) {
          setHovered(wordNodes[wordHit.index])
          renderer.domElement.style.cursor = 'crosshair'
          return
        }
        if (structPoints) {
          const structHit = raycaster.intersectObject(structPoints)[0]
          if (structHit) {
            setHovered(structuralNodes[structHit.index])
            renderer.domElement.style.cursor = 'crosshair'
            return
          }
        }
        setHovered(null)
        renderer.domElement.style.cursor = 'grab'
      }
    } else {
      // ── Flat constellation mode (no forest data) — original behaviour ──────
      const positions = new Float32Array(graph.nodes.length * 3)
      const colors = new Float32Array(graph.nodes.length * 3)
      const idToIndex = new Map()
      let maxRadius = 1
      graph.nodes.forEach((node, index) => {
        const x = Number(node.x) || 0
        const y = Number(node.y) || 0
        const z = Number(node.z) || 0
        maxRadius = Math.max(maxRadius, Math.hypot(x, y, z))
        positions.set([x, y, z], index * 3)
        const color = wordNodeColor(node)
        colors.set([color.r, color.g, color.b], index * 3)
        idToIndex.set(node.id, index)
      })
      const scale = Math.min(2.8, 5.2 / maxRadius)
      for (let index = 0; index < positions.length; index += 1) positions[index] *= scale

      const pointsGeometry = new THREE.BufferGeometry()
      pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const flatPoints = new THREE.Points(
        pointsGeometry,
        new THREE.PointsMaterial({ size: 0.23, vertexColors: true, transparent: true, opacity: 1, sizeAttenuation: true }),
      )
      scene.add(flatPoints)

      const linePositions = []
      graph.edges.forEach((edge) => {
        const from = idToIndex.get(edge.source)
        const to = idToIndex.get(edge.target)
        if (from == null || to == null) return
        linePositions.push(...positions.slice(from * 3, from * 3 + 3), ...positions.slice(to * 3, to * 3 + 3))
      })
      if (linePositions.length) {
        const linesGeometry = new THREE.BufferGeometry()
        linesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
        scene.add(
          new THREE.LineSegments(
            linesGeometry,
            new THREE.LineBasicMaterial({ color: 0x557a98, transparent: true, opacity: 0.25 }),
          ),
        )
      }

      handlePointer = (event) => {
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObject(flatPoints)[0]
        setHovered(hit ? graph.nodes[hit.index] : null)
        renderer.domElement.style.cursor = hit ? 'crosshair' : 'grab'
      }
    }

    renderer.domElement.addEventListener('pointermove', handlePointer)
    renderer.domElement.addEventListener('pointerleave', () => setHovered(null))

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let frameId
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointermove', handlePointer)
      disposeObject(scene)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
    // forestSignature ensures the effect re-runs when the forest topology changes
    // even if the word node list hasn't changed.
  }, [graph, nodeSignature, edgeSignature, forestSignature, hasForest])

  const status = webglError || error

  // Legend is extended with structural node types when a forest is present.
  const legend = hasForest
    ? [
        { cls: 'is-cluster', label: 'Cluster' },
        { cls: 'is-scenario-context', label: 'Context' },
        { cls: 'is-mastered', label: 'Mastered' },
        { cls: 'is-learning', label: 'Recallable' },
        { cls: 'is-due', label: 'Due' },
      ]
    : [
        { cls: 'is-mastered', label: 'Mastered' },
        { cls: 'is-learning', label: 'Recallable' },
        { cls: 'is-due', label: 'Due' },
      ]

  return (
    <section className="agent-profile__panel agent-profile__constellation" aria-labelledby="constellation-title">
      <div className="agent-profile__section-heading agent-profile__graph-heading">
        <div>
          <span className="agent-profile__eyebrow">
            {hasForest ? 'Vocab forest' : 'Encountered words only'}
          </span>
          <h2 id="constellation-title">{title || 'Memory constellation'}</h2>
        </div>
        <div className="agent-profile__legend" aria-label="Graph legend">
          {legend.map(({ cls, label }) => (
            <span key={cls} className={cls}>{label}</span>
          ))}
        </div>
      </div>
      <div
        className="agent-profile__graph"
        ref={mountRef}
        role="img"
        aria-label={`Interactive three-dimensional map of ${graph.nodes.length} encountered words`}
      >
        {loading && (
          <div className="agent-profile__graph-state">
            <span className="agent-profile__spinner" />
            Charting your language memory…
          </div>
        )}
        {!loading && status && <div className="agent-profile__graph-state">{status}</div>}
        {!loading && !status && !graph.nodes.length && (
          <div className="agent-profile__graph-state">
            <strong>No words in this sector yet.</strong>
            <span>Encounter vocabulary during a mission to light up this constellation.</span>
          </div>
        )}
        {hovered && (
          <div className="agent-profile__word-card">
            <strong>{hovered.expression ?? hovered.label ?? hovered.id}</strong>
            {hovered.translation
              ? <span>{hovered.translation}</span>
              : hovered.nodeType && hovered.nodeType !== 'root'
                ? <span className="agent-profile__word-card-kind">
                    {hovered.nodeType === 'superset' ? 'Topic cluster' : 'Scenario context'}
                  </span>
                : null
            }
            {hovered.retrievability != null && (
              <small>
                {Math.round(hovered.retrievability * 100)}% recall
                {' · '}
                {Number(hovered.stability ?? 0).toFixed(1)}d stability
              </small>
            )}
          </div>
        )}
        {!!graph.nodes.length && (
          <div className="agent-profile__graph-help">Drag to orbit · Scroll to zoom</div>
        )}
      </div>
    </section>
  )
}

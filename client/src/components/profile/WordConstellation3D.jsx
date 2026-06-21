import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

function nodeColor(node) {
  if (node.mastered || node.stability >= 7 && node.retrievability >= 0.9) return new THREE.Color('#078765')
  if (node.retrievability >= 0.75) return new THREE.Color('#2478b8')
  if (node.retrievability > 0) return new THREE.Color('#d98418')
  return new THREE.Color('#d43e5d')
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose()
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose())
    else child.material?.dispose()
  })
}

export default function WordConstellation3D({ graph, loading, error, title }) {
  const mountRef = useRef(null)
  const [hovered, setHovered] = useState(null)
  const [webglError, setWebglError] = useState('')
  const nodeSignature = useMemo(() => graph.nodes.map((node) => `${node.id}:${node.x}:${node.y}:${node.z}`).join('|'), [graph.nodes])
  const edgeSignature = useMemo(() => graph.edges.map((edge) => `${edge.source}:${edge.target}`).join('|'), [graph.edges])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !graph.nodes.length) return undefined
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
      const color = nodeColor(node)
      colors.set([color.r, color.g, color.b], index * 3)
      idToIndex.set(node.id, index)
    })
    const scale = Math.min(2.8, 5.2 / maxRadius)
    for (let index = 0; index < positions.length; index += 1) positions[index] *= scale

    const pointsGeometry = new THREE.BufferGeometry()
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const pointsMaterial = new THREE.PointsMaterial({ size: 0.23, vertexColors: true, transparent: true, opacity: 1, sizeAttenuation: true })
    const points = new THREE.Points(pointsGeometry, pointsMaterial)
    scene.add(points)

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
      const lines = new THREE.LineSegments(linesGeometry, new THREE.LineBasicMaterial({ color: 0x557a98, transparent: true, opacity: 0.25 }))
      scene.add(lines)
    }

    const dustGeometry = new THREE.BufferGeometry()
    const dust = new Float32Array(240 * 3)
    for (let i = 0; i < dust.length; i += 3) {
      dust[i] = (Math.random() - 0.5) * 22
      dust[i + 1] = (Math.random() - 0.5) * 14
      dust[i + 2] = (Math.random() - 0.5) * 14
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3))
    scene.add(new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0x7b9db7, size: 0.022, transparent: true, opacity: 0.3 })))

    const raycaster = new THREE.Raycaster()
    raycaster.params.Points.threshold = 0.22
    const pointer = new THREE.Vector2()
    const handlePointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(points)[0]
      setHovered(hit ? graph.nodes[hit.index] : null)
      renderer.domElement.style.cursor = hit ? 'crosshair' : 'grab'
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
  }, [graph, nodeSignature, edgeSignature])

  const status = webglError || error
  return (
    <section className="agent-profile__panel agent-profile__constellation" aria-labelledby="constellation-title">
      <div className="agent-profile__section-heading agent-profile__graph-heading">
        <div><span className="agent-profile__eyebrow">Encountered words only</span><h2 id="constellation-title">{title || 'Memory constellation'}</h2></div>
        <div className="agent-profile__legend" aria-label="Graph legend"><span className="is-mastered">Mastered</span><span className="is-learning">Recallable</span><span className="is-due">Due</span></div>
      </div>
      <div className="agent-profile__graph" ref={mountRef} role="img" aria-label={`Interactive three-dimensional map of ${graph.nodes.length} encountered words`}>
        {loading && <div className="agent-profile__graph-state"><span className="agent-profile__spinner" />Charting your language memory…</div>}
        {!loading && status && <div className="agent-profile__graph-state">{status}</div>}
        {!loading && !status && !graph.nodes.length && <div className="agent-profile__graph-state"><strong>No words in this sector yet.</strong><span>Encounter vocabulary during a mission to light up this constellation.</span></div>}
        {hovered && <div className="agent-profile__word-card"><strong>{hovered.expression}</strong>{hovered.translation && <span>{hovered.translation}</span>}<small>{Math.round(hovered.retrievability * 100)}% recall · {hovered.stability.toFixed(1)}d stability</small></div>}
        {!!graph.nodes.length && <div className="agent-profile__graph-help">Drag to orbit · Scroll to zoom</div>}
      </div>
    </section>
  )
}

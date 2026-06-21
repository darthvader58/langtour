import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CHINA, COUNTRIES, UNLOCK_COST } from './gameData'
import SackboyCharacter from './components/SackboyCharacter'

const EARTH_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
const CLOUDS_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'
const SPECULAR_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg'
const TRAVEL_DURATION_MS = 2200
const DIVE_DURATION_MS = 750
const GLOBE_RADIUS = 2
const EARTH_SPIN_SPEED = 0.0009
const CLOUD_SPIN_SPEED = 0.0015

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeInCubic(t) {
  return t * t * t
}

function latLngToDirection(lat, lng) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  )
}

function createRadialTexture(innerColor, outerColor = 'rgba(0,0,0,0)') {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, innerColor)
  gradient.addColorStop(1, outerColor)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function createStarField() {
  const starCount = 2600
  const positions = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const radius = 60 + Math.random() * 140
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.6,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  })
  return new THREE.Points(geometry, material)
}

function createChinaMarker() {
  const group = new THREE.Group()
  const direction = latLngToDirection(CHINA.lat, CHINA.lng).normalize()
  group.position.copy(direction.multiplyScalar(GLOBE_RADIUS * 1.01))

  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  )
  group.add(hitMesh)

  const dot = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createRadialTexture('rgba(110,231,183,0.95)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  dot.scale.set(0.4, 0.4, 1)
  group.add(dot)

  const ringTexture = createRadialTexture('rgba(74,222,128,0.7)')
  const rings = [0, 1].map(() => {
    const ring = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ringTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    ring.scale.set(0.4, 0.4, 1)
    group.add(ring)
    return ring
  })

  return { group, hitMesh, dot, rings }
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function AstrolabeFrame() {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const angle = (i * 5 * Math.PI) / 180
    const major = i % 9 === 0
    const r1 = 272, r2 = major ? 257 : 265
    const cos = Math.cos(angle - Math.PI / 2)
    const sin = Math.sin(angle - Math.PI / 2)
    return { x1: cos * r1, y1: sin * r1, x2: cos * r2, y2: sin * r2, major }
  })

  const dotRing = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180
    return { cx: Math.cos(a - Math.PI / 2) * 218, cy: Math.sin(a - Math.PI / 2) * 218 }
  })

  const compassPoints = [
    { x: 0, y: -258, label: 'N' }, { x: 258, y: 0, label: 'E' },
    { x: 0, y: 258, label: 'S' }, { x: -258, y: 0, label: 'W' },
  ]

  return (
    <svg width="580" height="580" viewBox="-290 -290 580 580" className="pointer-events-none select-none">
      {/* Outer ring */}
      <circle r="276" fill="none" stroke="#C9A84C" strokeWidth="1" opacity="0.45" />
      <circle r="268" fill="none" stroke="#C9A84C" strokeWidth="0.4" opacity="0.15" />

      {/* Degree ticks */}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="#C9A84C" strokeWidth={t.major ? '1.5' : '0.6'}
          opacity={t.major ? '0.55' : '0.2'}
        />
      ))}

      {/* Compass NESW */}
      {compassPoints.map(({ x, y, label }) => (
        <text key={label} x={x} y={y}
          textAnchor="middle" dominantBaseline="middle"
          fill="#C9A84C" fontSize="10" fontFamily="Cinzel" fontWeight="700" opacity="0.65"
        >{label}</text>
      ))}

      {/* North arrow */}
      <polygon points="0,-280 -3,-265 3,-265" fill="#C9A84C" opacity="0.6" />

      {/* Slowly rotating middle ring */}
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="120s" repeatCount="indefinite" />
        <circle r="240" fill="none" stroke="#C9A84C" strokeWidth="0.5" strokeDasharray="5 9" opacity="0.25" />
        <line x1="-240" y1="0" x2="240" y2="0" stroke="#C9A84C" strokeWidth="0.3" opacity="0.12" />
        <line x1="0" y1="-240" x2="0" y2="240" stroke="#C9A84C" strokeWidth="0.3" opacity="0.12" />
        {[45, 135, 225, 315].map((deg, i) => {
          const a = (deg * Math.PI) / 180
          return <circle key={i} cx={Math.cos(a) * 240} cy={Math.sin(a) * 240} r="2.5" fill="none" stroke="#C9A84C" strokeWidth="1" opacity="0.35" />
        })}
      </g>

      {/* Counter-rotating inner ring */}
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="-360 0 0" dur="80s" repeatCount="indefinite" />
        <circle r="218" fill="none" stroke="#C9A84C" strokeWidth="0.5" opacity="0.18" />
        {dotRing.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="1.5" fill="#C9A84C" opacity="0.3" />
        ))}
      </g>

      {/* Innermost static ring */}
      <circle r="194" fill="none" stroke="#C9A84C" strokeWidth="0.3" opacity="0.12" />
    </svg>
  )
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <defs>
        <radialGradient id="coinGradient" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff6c8" />
          <stop offset="55%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9.5" fill="url(#coinGradient)" stroke="#92400e" strokeWidth="1" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#92400e" strokeWidth="0.75" opacity="0.5" />
      <text x="12" y="16" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#78350f">
        L
      </text>
    </svg>
  )
}

const HEAT_ZONE_COLORS = {
  China:  [239,  68,  68],
  Japan:  [139,  92, 246],
  France: [ 59, 130, 246],
  Mexico: [249, 115,  22],
  Egypt:  [250, 204,  21],
  Brazil: [ 34, 197,  94],
}

export default function LandingPage({
  tokens,
  unlockedCountries,
  glowCountry,
  progressByCountry = {},
  onUnlockCountry,
  onCountrySelect,
}) {
  const mountRef = useRef(null)
  const triggerTravelRef = useRef(() => {})
  const onCountrySelectRef = useRef(onCountrySelect)
  const onChinaMarkerClickRef = useRef(() => {})
  const heatZoneSpritesRef = useRef({})
  const heatZonePropsRef   = useRef({})
  const overlayRefs        = useRef({})

  const triggerDiveRef = useRef(() => {})

  const [pendingCountry, setPendingCountry] = useState(null)
  const [isTraveling, setIsTraveling] = useState(false)
  const [travelLabel, setTravelLabel] = useState('')
  const [showFlash, setShowFlash] = useState(false)
  const [celebrating, setCelebrating] = useState(null)

  const countries = COUNTRIES.map((country) => ({
    ...country,
    unlocked: unlockedCountries.includes(country.name),
  }))

  useEffect(() => {
    onCountrySelectRef.current = onCountrySelect
  }, [onCountrySelect])

  function runTravelSequence(country) {
    setIsTraveling(true)
    setTravelLabel(`Flying to ${country.name}…`)
    triggerTravelRef.current(country.lat, country.lng, () => {
      setTravelLabel('Arriving…')
      triggerDiveRef.current(() => {
        setShowFlash(true)
        window.setTimeout(() => {
          onCountrySelectRef.current?.(country.name)
        }, 500)
      })
    })
  }

  function handleSelectCountry(country) {
    if (isTraveling) return
    if (country.unlocked) {
      runTravelSequence(country)
      return
    }
    if (tokens < UNLOCK_COST) return
    setPendingCountry(country)
  }

  // Globe mascot click — the little agent waves goodbye before we fly out
  function handleGlobeClick(country) {
    if (isTraveling || celebrating) return
    if (country.unlocked) {
      setCelebrating(country.name)
      window.setTimeout(() => {
        setCelebrating(null)
        runTravelSequence(country)
      }, 700)
      return
    }
    handleSelectCountry(country)
  }

  useEffect(() => {
    onChinaMarkerClickRef.current = () =>
      handleSelectCountry({ ...CHINA, unlocked: unlockedCountries.includes(CHINA.name) })
  })

  // Keep heat zone proficiency data current without recreating the Three.js scene
  useEffect(() => {
    const props = {}
    COUNTRIES.forEach((country) => {
      const prog = progressByCountry[country.name]
      const proficiency = prog?.length
        ? prog.reduce((s, p) => s + p, 0) / (prog.length * 100)
        : 0
      props[country.name] = { proficiency }
    })
    heatZonePropsRef.current = props
  }, [progressByCountry])

  useEffect(() => {
    const mount = mountRef.current
    const width = mount.clientWidth
    const height = mount.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05060a)

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 0, 6)
    const baseFov = camera.fov

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.minDistance = 3.4
    controls.maxDistance = 9

    const deepSpace = new THREE.Group()
    deepSpace.add(createStarField())
    scene.add(deepSpace)

    const ambientLight = new THREE.AmbientLight(0x3b4a6b, 1.4)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6)
    sunLight.position.set(5, 3, 5)
    scene.add(ambientLight, sunLight)

    const planetGroup = new THREE.Group()
    scene.add(planetGroup)

    const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64)
    const globeMaterial = new THREE.MeshPhongMaterial({
      color: 0x1c3a6b,
      shininess: 14,
      specular: 0x335577,
    })
    const globe = new THREE.Mesh(globeGeometry, globeMaterial)
    planetGroup.add(globe)

    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        globeMaterial.map = texture
        globeMaterial.color.set(0xffffff)
        globeMaterial.needsUpdate = true
      },
      undefined,
      () => console.warn('Earth texture failed to load, using fallback color material.'),
    )
    textureLoader.load(SPECULAR_TEXTURE_URL, (texture) => {
      globeMaterial.specularMap = texture
      globeMaterial.needsUpdate = true
    })

    const cloudGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.015, 64, 64)
    const cloudMaterial = new THREE.MeshPhongMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial)
    scene.add(clouds)
    textureLoader.load(CLOUDS_TEXTURE_URL, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      cloudMaterial.map = texture
      cloudMaterial.alphaMap = texture
      cloudMaterial.opacity = 0.6
      cloudMaterial.needsUpdate = true
    })

    const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.22, 64, 64)
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(0x4fc3ff) } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        uniform vec3 glowColor;
        void main() {
          float intensity = pow(0.58 - dot(vNormal, vViewDir), 4.0);
          gl_FragColor = vec4(glowColor, clamp(intensity, 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    scene.add(atmosphere)

    const { group: chinaMarkerGroup, hitMesh, dot, rings } = createChinaMarker()
    planetGroup.add(chinaMarkerGroup)

    // Heat zone glow sprites for all countries
    COUNTRIES.forEach((country) => {
      const [r, g, b] = HEAT_ZONE_COLORS[country.name] ?? [255, 100, 0]
      const tex = createRadialTexture(`rgba(${r},${g},${b},0.9)`)
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
      const sprite = new THREE.Sprite(mat)
      const dir = latLngToDirection(country.lat, country.lng).normalize()
      sprite.position.copy(dir.clone().multiplyScalar(GLOBE_RADIUS * 1.01))
      sprite.scale.set(0.9, 0.9, 1)
      planetGroup.add(sprite)
      heatZoneSpritesRef.current[country.name] = sprite
    })

    const raycaster = new THREE.Raycaster()
    const pointerNdc = new THREE.Vector2()
    let hovered = false

    function updatePointer(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    function handlePointerMove(event) {
      if (travel || dive) return
      updatePointer(event)
      raycaster.setFromCamera(pointerNdc, camera)
      hovered = raycaster.intersectObject(hitMesh).length > 0
      renderer.domElement.style.cursor = hovered ? 'pointer' : 'auto'
    }

    function handleClick(event) {
      if (travel || dive) return
      updatePointer(event)
      raycaster.setFromCamera(pointerNdc, camera)
      if (raycaster.intersectObject(hitMesh).length > 0) {
        onChinaMarkerClickRef.current()
      }
    }

    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('click', handleClick)

    let travel = null
    let spinPaused = false

    let dive = null

    function travelTo(lat, lng, onArrive) {
      spinPaused = true
      controls.enabled = false
      const startDir = camera.position.clone().normalize()
      const localDir = latLngToDirection(lat, lng).normalize()
      const endDir = localDir.applyQuaternion(planetGroup.quaternion).normalize()
      const rotation = new THREE.Quaternion().setFromUnitVectors(startDir, endDir)
      travel = {
        startTime: performance.now(),
        startDir,
        rotation,
        startDistance: camera.position.length(),
        endDistance: Math.max(controls.minDistance, camera.position.length() * 0.78),
        onArrive,
      }
    }
    triggerTravelRef.current = travelTo

    function diveIn(onDone) {
      dive = {
        startTime: performance.now(),
        startDistance: camera.position.length(),
        endDistance: GLOBE_RADIUS * 1.3,
        direction: camera.position.clone().normalize(),
        startFov: camera.fov,
        endFov: baseFov + 10,
        onDone,
      }
    }
    triggerDiveRef.current = diveIn

    function stepTravel(now) {
      const elapsed = now - travel.startTime
      const t = Math.min(elapsed / TRAVEL_DURATION_MS, 1)
      const eased = easeInOutCubic(t)

      const step = new THREE.Quaternion().slerp(travel.rotation, eased)
      const direction = travel.startDir.clone().applyQuaternion(step)
      const distance = travel.startDistance + (travel.endDistance - travel.startDistance) * eased
      camera.position.copy(direction.multiplyScalar(distance))
      camera.lookAt(0, 0, 0)

      if (t >= 1) {
        const finishedCallback = travel.onArrive
        travel = null
        controls.target.set(0, 0, 0)
        controls.update()
        finishedCallback?.()
      }
    }

    function stepDive(now) {
      const elapsed = now - dive.startTime
      const t = Math.min(elapsed / DIVE_DURATION_MS, 1)
      const eased = easeInCubic(t)
      const distance = dive.startDistance + (dive.endDistance - dive.startDistance) * eased
      camera.position.copy(dive.direction.clone().multiplyScalar(distance))
      camera.lookAt(0, 0, 0)
      camera.fov = dive.startFov + (dive.endFov - dive.startFov) * eased
      camera.updateProjectionMatrix()

      if (t >= 1) {
        const finishedCallback = dive.onDone
        dive = null
        controls.enabled = true
        finishedCallback?.()
      }
    }

    function handleResize() {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    let frameId
    function animate() {
      frameId = requestAnimationFrame(animate)
      if (!spinPaused) {
        planetGroup.rotation.y += EARTH_SPIN_SPEED
      }
      clouds.rotation.y += CLOUD_SPIN_SPEED
      deepSpace.rotation.y += 0.00012
      deepSpace.rotation.x += 0.00004

      const t = performance.now() * 0.001
      dot.scale.setScalar(hovered ? 0.52 : 0.4 + Math.sin(t * 3) * 0.05)
      dot.material.opacity = hovered ? 1 : 0.7 + Math.sin(t * 3) * 0.2
      rings.forEach((ring, i) => {
        const phase = (t * 0.5 + i * 0.5) % 1
        ring.scale.setScalar(0.4 + phase * (hovered ? 2.6 : 1.8))
        ring.material.opacity = (1 - phase) * (hovered ? 0.85 : 0.45)
      })

      // Animate heat zone glows
      Object.entries(heatZoneSpritesRef.current).forEach(([name, sprite], i) => {
        const props = heatZonePropsRef.current[name]
        if (!props) return
        const p = props.proficiency
        const targetOpacity = p <= 0 ? 0 : 0.18 + p * 0.55
        const pulse = Math.sin(t * 1.6 + i * 1.05) * 0.06 * p
        sprite.material.opacity += (targetOpacity - sprite.material.opacity) * 0.04
        const targetScale = 0.7 + p * 0.8 + pulse
        sprite.scale.setScalar(targetScale)
      })

      // Project the little sackboy mascots onto their country locations
      const rect = renderer.domElement.getBoundingClientRect()
      const camDir = camera.position.clone().normalize()
      COUNTRIES.forEach((c) => {
        const el = overlayRefs.current[c.name]
        if (!el) return
        const dir = latLngToDirection(c.lat, c.lng).applyQuaternion(planetGroup.quaternion).normalize()
        const worldPos = dir.clone().multiplyScalar(GLOBE_RADIUS * 1.04)
        const ndc = worldPos.clone().project(camera)
        const sx = (ndc.x * 0.5 + 0.5) * rect.width
        const sy = (-ndc.y * 0.5 + 0.5) * rect.height
        const facing = dir.dot(camDir)
        const visible = facing > 0.12 && ndc.z < 1
        el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`
        el.style.opacity = visible ? String(Math.min(1, (facing - 0.12) * 4.5)) : '0'
        el.style.pointerEvents = visible ? 'auto' : 'none'
        el.style.zIndex = String(100 + Math.round(facing * 60))
      })

      if (travel) stepTravel(performance.now())
      if (dive) stepDive(performance.now())
      if (!travel && !dive) controls.update()

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      renderer.dispose()
      globeGeometry.dispose()
      globeMaterial.dispose()
      cloudGeometry.dispose()
      cloudMaterial.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  function handleConfirmUnlock() {
    const country = pendingCountry
    if (!country) return
    setPendingCountry(null)
    onUnlockCountry?.(country)
    runTravelSequence(country)
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0A0A0A] text-[#F5F0E8] font-mono">
      {/* Three.js canvas */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_38%,_rgba(0,0,0,0.65)_100%)]" />

      {/* Astrolabe frame centered on globe */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]" style={{ opacity: 0.5 }}>
        <AstrolabeFrame />
      </div>

      {/* Tiny sackboy agents sitting on their countries on the globe */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[6]">
        {countries.map((country) => (
          <button
            key={country.name}
            type="button"
            ref={(el) => { overlayRefs.current[country.name] = el }}
            onClick={() => handleGlobeClick(country)}
            className="globe-sackboy group"
            style={{ opacity: 0 }}
            title={country.unlocked ? `Fly to ${country.name}` : `Recruit ${country.name}`}
          >
            <SackboyCharacter
              country={country.name}
              size={42}
              state={
                celebrating === country.name
                  ? 'dance'
                  : country.unlocked
                    ? 'wave'
                    : 'locked'
              }
              hoverDance={country.unlocked}
            />
            <span
              className="globe-sackboy__label block text-center -mt-1 font-mono text-[8px] font-bold uppercase tracking-widest text-[#C9A84C] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
            >
              {country.name}
            </span>
          </button>
        ))}
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-5 pointer-events-none z-10">
        <div className="pointer-events-auto">
          <h1 className="font-display text-3xl font-bold tracking-wider text-[#C9A84C] animate-gold-shimmer drop-shadow-[0_0_12px_rgba(201,168,76,0.3)]">
            LANGTOUR
          </h1>
          <p className="font-mono text-[9px] text-[#C9A84C]/40 tracking-[0.45em] uppercase mt-0.5">
            A Very Serious Spy Academy™
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
          {/* Field rank */}
          <div className="flex items-center gap-2 bg-[#0D0B08] rounded-2xl border-[2.5px] border-[#C9A84C]/30 px-4 py-2 shadow-[inset_0_0_8px_rgba(0,0,0,0.5)]">
            <span className="font-mono text-[9px] text-[#C9A84C]/35 tracking-widest uppercase">Agents</span>
            <span className="font-display text-sm font-bold text-[#C9A84C] ml-1">
              {unlockedCountries.length}
            </span>
          </div>

          {/* Token / ducat counter */}
          <div className="flex items-center gap-2.5 bg-[#0D0B08] rounded-2xl border-[2.5px] border-[#C9A84C]/30 px-5 py-2 shadow-[inset_0_0_8px_rgba(0,0,0,0.5)]">
            <CoinIcon />
            <span className="font-display text-xl font-bold tabular-nums text-[#C9A84C]">
              {tokens}
            </span>
            <span className="font-mono text-[9px] text-[#C9A84C]/35 uppercase tracking-widest">
              ducats
            </span>
          </div>
        </div>
      </header>

      {/* Country selection — agent roster panel */}
      <aside className="absolute top-1/2 left-6 -translate-y-1/2 w-64 max-h-[88vh] overflow-y-auto pointer-events-auto z-10 rounded-[28px] shadow-[5px_6px_0_rgba(0,0,0,0.8),_0_0_28px_rgba(0,0,0,0.6)]"
        style={{ background: 'linear-gradient(160deg, #1A1208 0%, #0D0A05 100%)', border: '3px solid rgba(201,168,76,0.3)' }}
      >
        <div className="p-3.5">
          <div className="flex items-center gap-2 mb-3 mt-1">
            <div className="flex-1 h-px bg-[#C9A84C]/15" />
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-[#C9A84C]/55 px-1">
              Agent Roster
            </span>
            <div className="flex-1 h-px bg-[#C9A84C]/15" />
          </div>

          <ul className="flex flex-col gap-2.5">
            {countries.map((country) => (
              <li key={country.name}>
                <button
                  type="button"
                  disabled={isTraveling || (!country.unlocked && tokens < UNLOCK_COST)}
                  onClick={() => handleSelectCountry(country)}
                  title={
                    country.unlocked
                      ? `Deploy to ${country.name}`
                      : tokens >= UNLOCK_COST
                        ? `Recruit ${country.name}`
                        : 'Not enough ducats'
                  }
                  className={
                    'group btn-chunky w-full flex flex-col items-center gap-1 px-3 pt-2.5 pb-3 rounded-2xl text-center disabled:cursor-not-allowed border-[2.5px] ' +
                    (country.unlocked
                      ? 'bg-[radial-gradient(circle_at_50%_0%,_rgba(201,168,76,0.16),_transparent_70%)] border-[#C9A84C]/45 hover:border-[#C9A84C]/80 text-[#F5F0E8] cursor-pointer '
                        + (glowCountry === country.name ? 'animate-country-glow' : '')
                      : 'bg-[#0D0A05]/60 border-[#3D2E0D]/55 text-[#5A4A2A]')
                  }
                >
                  <SackboyCharacter
                    country={country.name}
                    size={54}
                    state={country.unlocked ? 'wave' : 'locked'}
                    hoverDance={country.unlocked}
                  />
                  <span className="font-display text-sm font-bold tracking-wide leading-none">
                    {country.name}
                  </span>
                  {country.unlocked ? (
                    <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest text-[#6EE7B7]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] shadow-[0_0_6px_#6EE7B7]" />
                      On Duty
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest text-[#8B6914]">
                      <LockIcon />
                      {UNLOCK_COST} ducats
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Travel status */}
      {isTraveling && !showFlash && (
        <div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-2.5 bg-[#0D0B08] rounded-full border-[2.5px] border-[#C9A84C]/35 font-display font-bold text-sm text-[#C9A84C] tracking-widest uppercase animate-pulse pointer-events-none shadow-[0_0_16px_rgba(201,168,76,0.18)]"
        >
          {travelLabel}
        </div>
      )}

      {/* Unlock confirm modal */}
      {pendingCountry && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 pointer-events-auto animate-overlay-fade z-20">
          <div
            className="animate-modal-pop w-80 p-7 text-center rounded-[28px] shadow-[0_0_60px_rgba(0,0,0,0.9)]"
            style={{ background: '#0D0B08', border: '3px solid rgba(201,168,76,0.32)' }}
          >
            <div className="flex justify-center mb-2">
              <SackboyCharacter country={pendingCountry.name} size={92} state="locked" />
            </div>
            <h3 className="font-display text-lg font-bold mb-2 text-[#F5F0E8] tracking-wider">
              Recruit the {pendingCountry.name} agent?
            </h3>
            <p className="font-mono text-sm text-[#8B7355] mb-6">
              Springs them from the bench for{' '}
              <span className="font-bold text-[#C9A84C]">{UNLOCK_COST} ducats</span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingCountry(null)}
                className="btn-chunky flex-1 py-2.5 rounded-2xl bg-transparent border-[2.5px] border-[#3D2E0D] hover:border-[#C9A84C]/30 font-display font-bold text-sm text-[#5A4A2A] hover:text-[#C9A84C]/60 uppercase tracking-wider"
              >
                Not Yet
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
                className="btn-chunky flex-1 py-2.5 rounded-2xl bg-[#C9A84C]/12 border-[2.5px] border-[#C9A84C]/55 hover:bg-[#C9A84C]/20 font-display font-bold text-sm text-[#C9A84C] uppercase tracking-wider"
              >
                Recruit!
              </button>
            </div>
          </div>
        </div>
      )}

      {showFlash && (
        <div className="absolute inset-0 bg-white animate-cinematic-flash pointer-events-none" />
      )}
    </div>
  )
}

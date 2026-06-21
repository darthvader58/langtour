import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CHINA, COUNTRIES, UNLOCK_COST, AGENT_AVATARS } from './gameData'
import { useProfile } from './hooks/useProfile'
import AuthModal from './components/AuthModal'

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

// Per-country glow used for the roster card hover effect.
const CARD_GLOW = {
  China:  '#C81E1E', // red
  Japan:  '#F5F0E8', // white
  France: '#2A6BD6', // blue
  Mexico: '#2BA45A', // green
  Egypt:  '#E8C547', // gold
  Brazil: '#16A34A', // green
}

// Countries shown as linked on the globe even before they are unlocked, so the
// China <-> Japan agent data-link is always visible for the demo.
const DEMO_LINKED = ['China', 'Japan']

const TICKER_MESSAGES = [
  '🌏 3 explorers are out adventuring around the world right now',
  '🎉 New mission just unlocked in Tokyo!',
  '🥢 Someone ordered street food in Shanghai',
  '🇫🇷 A French phrase was practiced near Paris',
  '⭐ Vocabulary mastery level increased!',
  '🏆 Restaurant mission completed in China',
  '🗺️ A new scenario opened in the Beijing market',
  '🔥 Daily streak extended — keep it going!',
]

export default function LandingPage({
  tokens,
  level = 1,
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
  const unlockedRef        = useRef(unlockedCountries)

  const triggerDiveRef = useRef(() => {})

  const [pendingCountry, setPendingCountry] = useState(null)
  const [isTraveling, setIsTraveling] = useState(false)
  const [travelLabel, setTravelLabel] = useState('')
  const [showFlash, setShowFlash] = useState(false)
  const [celebrating, setCelebrating] = useState(null)

  // Supabase auth (Google OAuth + email). Token/progress state stays in App;
  // this only layers the agent's identity on top of the field ops HUD.
  const {
    user,
    authLoading,
    authError,
    authMessage,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  } = useProfile()
  const [showAuth, setShowAuth] = useState(false)

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

  // Keep the active-country list available to the (run-once) Three.js loop
  useEffect(() => {
    unlockedRef.current = unlockedCountries
  }, [unlockedCountries])

  useEffect(() => {
    const mount = mountRef.current
    const width = mount.clientWidth
    const height = mount.clientHeight

    const scene = new THREE.Scene()
    // Left transparent so the CSS deep-background (hex mesh, matrix rain, nebula)
    // shows through the empty space around the globe.

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 0, 6)
    const baseFov = camera.fov

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
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
      uniforms: { glowColor: { value: new THREE.Color(0x8fb8ff) } },
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

    // ── Agent data-link arcs between active countries (hub from China) ──
    const linkDotTexture = createRadialTexture('rgba(201,168,76,0.95)')
    const connections = COUNTRIES
      .filter((c) => c.name !== CHINA.name)
      .map((target, i) => {
        const start = latLngToDirection(CHINA.lat, CHINA.lng).multiplyScalar(GLOBE_RADIUS * 1.01)
        const end   = latLngToDirection(target.lat, target.lng).multiplyScalar(GLOBE_RADIUS * 1.01)
        const mid   = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS * 1.34)
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48))
        const material = new THREE.LineBasicMaterial({
          color: 0xE8C547, transparent: true, opacity: 0.6,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })
        const line = new THREE.Line(geometry, material)
        line.visible = false
        planetGroup.add(line)

        const dotMaterial = new THREE.SpriteMaterial({
          map: linkDotTexture, transparent: true,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })
        const dot = new THREE.Sprite(dotMaterial)
        dot.scale.set(0.16, 0.16, 1)
        dot.visible = false
        planetGroup.add(dot)

        return { name: target.name, curve, line, material, dot, dotMaterial, geometry, offset: i * 0.27 }
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

      // Animate the agent data-link arcs and their travelling dots
      connections.forEach((conn, i) => {
        const active = DEMO_LINKED.includes(conn.name) || unlockedRef.current.includes(conn.name)
        conn.line.visible = active
        conn.dot.visible = active
        if (!active) return
        const flow = (t * 0.32 + conn.offset) % 1
        conn.dot.position.copy(conn.curve.getPointAt(flow))
        conn.material.opacity = 0.35 + Math.abs(Math.sin(t * 2 + i)) * 0.4
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
      linkDotTexture.dispose()
      connections.forEach((conn) => {
        conn.geometry.dispose()
        conn.material.dispose()
        conn.dotMaterial.dispose()
      })
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
    <div className="relative w-screen h-screen overflow-hidden text-white font-sans"
      style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 30%, #1E2C5A 0%, #131D3B 55%, #0D1530 100%)' }}
    >
      {/* Soft friendly star sparkles glow, top-right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 40% 35% at 85% 10%, rgba(140,184,255,0.18), transparent 70%)' }}
      />

      {/* Three.js canvas */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Country avatars floating over their locations on the globe */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[6]">
        {countries.map((country) => (
          <button
            key={country.name}
            type="button"
            ref={(el) => { overlayRefs.current[country.name] = el }}
            onClick={() => handleGlobeClick(country)}
            className="globe-sackboy group flex flex-col items-center"
            style={{ opacity: 0 }}
            title={country.unlocked ? `Fly to ${country.name}` : `Recruit ${country.name}`}
          >
            {/* soft toy shadow base */}
            <span
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
              style={{ top: '42px', width: '34px', height: '9px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', filter: 'blur(3px)' }}
            />
            <img
              src={AGENT_AVATARS[country.name]}
              alt={`${country.name} agent`}
              draggable="false"
              className={
                'w-12 h-12 drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out ' +
                (country.unlocked
                  ? 'sackboy-bob group-hover:-translate-y-2 group-hover:scale-110'
                  : 'grayscale opacity-50')
              }
            />
            <span className="block text-center mt-0.5 font-display text-[9px] font-extrabold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {country.name}
            </span>
          </button>
        ))}
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-5 pointer-events-none z-10">
        <div className="pointer-events-auto">
          <h1 className="font-display text-4xl font-black tracking-tight text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
            Lang<span className="text-[#FFC93C]">tour</span>
          </h1>
          <p className="font-display text-xs font-bold text-sky-200/80 tracking-wide mt-0.5">
            Your passport to the world 🌍
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
          {/* Level chip */}
          <div className="flex items-center gap-2 bg-[#22305C] rounded-2xl border-4 border-[#34457C] px-4 py-2 shadow-[0_5px_0_0_rgba(0,0,0,0.35)]">
            <span className="text-lg leading-none">⭐</span>
            <span className="font-display text-[10px] font-extrabold uppercase tracking-wide text-sky-200/70">Level</span>
            <span className="font-display text-lg font-black tabular-nums text-white">
              {level}
            </span>
          </div>

          {/* Token counter chip (gold reward) */}
          <div className="flex items-center gap-2 bg-[#22305C] rounded-2xl border-4 border-[#FFC93C]/70 px-4 py-2 shadow-[0_5px_0_0_rgba(0,0,0,0.35)] animate-token-pulse">
            <CoinIcon />
            <span className="font-display text-2xl font-black tabular-nums text-[#FFC93C]">
              {tokens}
            </span>
            <span className="font-display text-[10px] font-bold uppercase tracking-wide text-[#FFC93C]/70">tokens</span>
          </div>

          {/* Agent identity / sign-in */}
          {user ? (
            <button
              type="button"
              onClick={() => { setShowAuth(false); signOut() }}
              disabled={authLoading}
              title={`Signed in as ${user.email}. Click to sign out.`}
              className="flex items-center gap-2 bg-[#22305C] rounded-2xl border-4 border-[#34457C] pl-2 pr-3 py-1.5 shadow-[0_5px_0_0_rgba(0,0,0,0.35)] hover:-translate-y-0.5 active:translate-y-0.5 transition-transform disabled:opacity-50"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full font-display font-black text-[#3A2E0A]"
                style={{ background: 'radial-gradient(circle at 35% 30%, #FFE08A, #FFC93C)' }}
              >
                {(user.user_metadata?.full_name || user.email || '?').charAt(0).toUpperCase()}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="max-w-32 truncate font-display text-xs font-bold text-white">
                  {user.user_metadata?.full_name || user.email}
                </span>
                <span className="font-display text-[9px] font-bold uppercase tracking-wide text-sky-200/60">Sign out</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              disabled={authLoading}
              className="bg-[#FFC93C] text-[#3A2E0A] rounded-2xl border-4 border-[#E0A91E] px-6 py-2.5 font-display font-black text-sm uppercase tracking-wide shadow-[0_5px_0_0_#B8860B] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_#B8860B] transition-all disabled:opacity-60"
            >
              {authLoading ? 'Connecting…' : 'Sign In'}
            </button>
          )}
        </div>
      </header>

      {/* Country selection — agent roster panel */}
      <aside className="absolute top-1/2 left-6 -translate-y-1/2 w-64 max-h-[88vh] pointer-events-auto z-10 rounded-3xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #243154 0%, #1A2647 100%)', border: '4px solid #34457C', boxShadow: '0 10px 0 0 rgba(0,0,0,0.3)' }}
      >
        <div className="p-3.5 max-h-[88vh] overflow-y-auto">
          <div className="flex items-center justify-center gap-2 mb-4 mt-1">
            <span className="text-lg">🌐</span>
            <span className="font-display text-sm font-extrabold uppercase tracking-wide text-white">
              Agent Roster
            </span>
          </div>

          <ul className="flex flex-col gap-3.5">
            {countries.map((country) => {
              const accent = CARD_GLOW[country.name] ?? '#FFC93C'
              return (
                <li key={country.name}>
                  <button
                    type="button"
                    disabled={isTraveling || (!country.unlocked && tokens < UNLOCK_COST)}
                    onClick={() => handleSelectCountry(country)}
                    style={{
                      borderColor: country.unlocked ? accent : '#2A3760',
                      boxShadow: country.unlocked ? '0 6px 0 0 rgba(0,0,0,0.35)' : 'none',
                    }}
                    title={
                      country.unlocked
                        ? `Deploy to ${country.name}`
                        : tokens >= UNLOCK_COST
                          ? `Recruit ${country.name}`
                          : 'Not enough ducats'
                    }
                    className={
                      'group w-full flex flex-col items-center gap-1.5 px-3 pt-3 pb-4 rounded-2xl border-4 text-center transition-all duration-200 ease-out disabled:cursor-not-allowed ' +
                      (country.unlocked
                        ? 'bg-[#2C3A63] hover:-translate-y-2 active:translate-y-0 cursor-pointer '
                          + (glowCountry === country.name ? 'ring-4 ring-[#FFC93C]/60' : '')
                        : 'bg-[#1B2645] opacity-70')
                    }
                  >
                    <img
                      src={AGENT_AVATARS[country.name]}
                      alt={`${country.name} agent`}
                      draggable="false"
                      className={
                        'w-20 h-20 drop-shadow-2xl transition-transform duration-300 ease-out '
                        + (country.unlocked ? 'group-hover:-translate-y-3 group-hover:scale-110 cursor-pointer' : 'grayscale opacity-60')
                      }
                    />
                    <span className={'font-display text-base font-extrabold leading-none ' + (country.unlocked ? 'text-white' : 'text-sky-200/55')}>
                      {country.name}
                    </span>
                    {country.unlocked ? (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#58CC02]/20 font-display text-[10px] font-extrabold uppercase tracking-wide text-[#7CE04F]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7CE04F] animate-heartbeat" />
                        On Duty
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wide text-sky-200/55">
                        🔒 {UNLOCK_COST} 🪙
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>

      {/* Travel status */}
      {isTraveling && !showFlash && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 px-6 py-3 bg-[#22305C] rounded-2xl border-4 border-[#FFC93C]/70 font-display font-extrabold text-sm text-white tracking-wide pointer-events-none shadow-[0_5px_0_0_rgba(0,0,0,0.35)] flex items-center gap-2">
          <span className="animate-pulse">✈️</span>
          {travelLabel}
        </div>
      )}

      {/* Unlock confirm modal */}
      {pendingCountry && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0D1530]/80 backdrop-blur-sm pointer-events-auto animate-overlay-fade z-20">
          <div
            className="animate-modal-pop relative w-80 p-7 text-center rounded-3xl"
            style={{ background: 'linear-gradient(180deg, #2A3A66, #1C294B)', border: '4px solid #FFC93C', boxShadow: '0 10px 0 0 rgba(0,0,0,0.35)' }}
          >
            <div className="flex justify-center mb-3">
              <img src={AGENT_AVATARS[pendingCountry.name]} alt={`${pendingCountry.name} agent`} className="w-24 h-24 drop-shadow-2xl" />
            </div>
            <h3 className="font-display text-xl font-black mb-2 text-white">
              Recruit the {pendingCountry.name} agent?
            </h3>
            <p className="font-display text-sm font-semibold text-sky-200/70 mb-6">
              Bring them onto your team for{' '}
              <span className="font-black text-[#FFC93C]">{UNLOCK_COST} 🪙</span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingCountry(null)}
                className="flex-1 py-3 rounded-2xl bg-[#22305C] border-4 border-[#34457C] font-display font-extrabold text-sm text-sky-100 shadow-[0_4px_0_0_rgba(0,0,0,0.35)] hover:-translate-y-0.5 active:translate-y-0.5 transition-transform"
              >
                Not Yet
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
                className="flex-1 py-3 rounded-2xl bg-[#FFC93C] text-[#3A2E0A] border-4 border-[#E0A91E] font-display font-black text-sm uppercase shadow-[0_4px_0_0_#B8860B] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0.5 active:shadow-[0_1px_0_0_#B8860B] transition-all"
              >
                Recruit!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth error toast */}
      {authError && !showAuth && (
        <div className="absolute right-6 top-24 max-w-sm rounded-2xl border-[2.5px] border-[#8B0000]/45 bg-[#1a0606]/85 px-4 py-3 font-mono text-sm text-red-100 z-20 shadow-[0_0_24px_rgba(0,0,0,0.6)]">
          {authError}
        </div>
      )}

      {/* Sign-in dialog */}
      {showAuth && !user && (
        <AuthModal
          loading={authLoading}
          error={authError}
          message={authMessage}
          onClose={() => setShowAuth(false)}
          onGoogle={signInWithGoogle}
          onEmailSignIn={signInWithEmail}
          onEmailSignUp={signUpWithEmail}
        />
      )}

      {/* Global Activity ticker — friendly notification banner at the bottom */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 h-9 flex items-center overflow-hidden border-t-4 border-[#FFC93C]"
        style={{ background: 'linear-gradient(90deg, #2A3A66, #22305C)' }}
      >
        <span className="relative z-10 shrink-0 h-full flex items-center gap-1.5 px-3.5 bg-[#FFC93C] text-[#3A2E0A] font-display text-[11px] font-black uppercase tracking-wide">
          <span className="w-2 h-2 rounded-full bg-[#3A2E0A] animate-pulse" />
          Global Activity
        </span>
        <div className="intel-ticker__track relative z-0">
          {[0, 1].map((half) => (
            <div key={half} className="flex items-center shrink-0" aria-hidden={half === 1 ? 'true' : undefined}>
              {TICKER_MESSAGES.map((msg, i) => (
                <span key={i} className="flex items-center shrink-0">
                  <span className="mx-5 text-[#FFC93C] text-lg leading-none">•</span>
                  <span className="font-display text-[13px] font-bold text-sky-100">{msg}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {showFlash && (
        <div className="absolute inset-0 bg-white animate-cinematic-flash pointer-events-none" />
      )}
    </div>
  )
}

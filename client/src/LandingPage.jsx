import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const EARTH_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
const CLOUDS_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'
const SPECULAR_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg'

const COUNTRIES = [
  { name: 'China', flag: '\u{1F1E8}\u{1F1F3}', lat: 35.8617, lng: 104.1954, unlocked: true },
  { name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', lat: 36.2048, lng: 138.2529, unlocked: false },
  { name: 'France', flag: '\u{1F1EB}\u{1F1F7}', lat: 46.2276, lng: 2.2137, unlocked: false },
  { name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}', lat: 23.6345, lng: -102.5528, unlocked: false },
  { name: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}', lat: 26.8206, lng: 30.8025, unlocked: false },
  { name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}', lat: -14.235, lng: -51.9253, unlocked: false },
]

const UNLOCK_COST = 100
const TRAVEL_DURATION_MS = 2200
const GLOBE_RADIUS = 2
const EARTH_SPIN_SPEED = 0.0009
const CLOUD_SPIN_SPEED = 0.0015

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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

function createNebulaField() {
  const group = new THREE.Group()
  const blobs = [
    { color: 'rgba(99,102,241,0.55)', pos: [-55, 22, -95], scale: 120 },
    { color: 'rgba(34,211,238,0.4)', pos: [62, -28, -115], scale: 140 },
    { color: 'rgba(244,114,182,0.35)', pos: [-32, -48, -75], scale: 95 },
  ]
  blobs.forEach(({ color, pos, scale }) => {
    const material = new THREE.SpriteMaterial({
      map: createRadialTexture(color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(...pos)
    sprite.scale.set(scale, scale, 1)
    group.add(sprite)
  })
  return group
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
      <circle cx="12" cy="12" r="9" fill="#facc15" stroke="#a16207" strokeWidth="1.5" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#a16207">
        $
      </text>
    </svg>
  )
}

export default function LandingPage({ onCountrySelect }) {
  const mountRef = useRef(null)
  const triggerTravelRef = useRef(() => {})
  const onCountrySelectRef = useRef(onCountrySelect)

  const [tokens, setTokens] = useState(100)
  const [pendingCountry, setPendingCountry] = useState(null)
  const [isTraveling, setIsTraveling] = useState(false)

  useEffect(() => {
    onCountrySelectRef.current = onCountrySelect
  }, [onCountrySelect])

  useEffect(() => {
    const mount = mountRef.current
    const width = mount.clientWidth
    const height = mount.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05060a)

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 0, 6)

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
    deepSpace.add(createNebulaField())
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

    const glowGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.18, 64, 64)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x4ea8ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
    })
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    scene.add(glow)

    let travel = null
    let spinPaused = false

    function travelTo(lat, lng, onArrive) {
      spinPaused = true
      controls.enabled = false
      const startDir = camera.position.clone().normalize()
      const endDir = latLngToDirection(lat, lng).normalize()
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

    function stepTravel(now) {
      if (!travel) return
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
      if (travel) {
        stepTravel(performance.now())
      } else {
        controls.update()
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      controls.dispose()
      renderer.dispose()
      globeGeometry.dispose()
      globeMaterial.dispose()
      cloudGeometry.dispose()
      cloudMaterial.dispose()
      glowGeometry.dispose()
      glowMaterial.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  function handleSelectCountry(country) {
    if (!country.unlocked || isTraveling || tokens < UNLOCK_COST) return
    setPendingCountry(country)
  }

  function handleConfirmUnlock() {
    const country = pendingCountry
    if (!country) return
    setTokens((t) => t - UNLOCK_COST)
    setPendingCountry(null)
    setIsTraveling(true)
    triggerTravelRef.current(country.lat, country.lng, () => {
      setIsTraveling(false)
      onCountrySelectRef.current?.(country.name)
    })
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#05060a] text-white font-sans">
      <div ref={mountRef} className="absolute inset-0" />

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.55)_100%)]" />

      <header className="absolute top-0 left-0 right-0 flex items-center justify-between p-6 pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-2xl font-semibold tracking-wide drop-shadow-lg">
            LangTour
          </h1>
          <p className="text-xs text-white/50 tracking-widest uppercase">
            Speak the world
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md px-4 py-2 shadow-lg">
          <CoinIcon />
          <span className="font-mono text-lg font-semibold tabular-nums">{tokens}</span>
          <span className="text-xs text-white/50 uppercase tracking-wide">tokens</span>
        </div>
      </header>

      <aside className="absolute top-1/2 left-6 -translate-y-1/2 w-64 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl p-4 pointer-events-auto">
        <h2 className="text-sm uppercase tracking-widest text-white/50 mb-3 px-1">
          Choose a Country
        </h2>
        <ul className="flex flex-col gap-1.5">
          {COUNTRIES.map((country) => (
            <li key={country.name}>
              <button
                type="button"
                disabled={!country.unlocked || isTraveling}
                onClick={() => handleSelectCountry(country)}
                title={country.unlocked ? `Unlock ${country.name}` : 'Coming soon'}
                className={
                  'w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all ' +
                  (country.unlocked
                    ? 'bg-white/5 hover:bg-white/15 hover:scale-[1.02] cursor-pointer text-white border border-transparent hover:border-cyan-300/30'
                    : 'bg-white/[0.02] text-white/30 cursor-not-allowed border border-transparent')
                }
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-xl">{country.flag}</span>
                  <span className="font-medium">{country.name}</span>
                </span>
                {country.unlocked ? (
                  <span className="text-[10px] uppercase tracking-wide text-cyan-300/80">
                    Demo
                  </span>
                ) : (
                  <LockIcon />
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {isTraveling && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full bg-white/10 border border-white/15 backdrop-blur-md text-sm tracking-wide animate-pulse pointer-events-none">
          Traveling to {pendingCountry?.name ?? 'destination'}...
        </div>
      )}

      {pendingCountry && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className="w-80 rounded-2xl bg-[#0d0f17] border border-white/10 shadow-2xl p-6 text-center">
            <div className="text-3xl mb-2">{pendingCountry.flag}</div>
            <h3 className="text-lg font-semibold mb-1">
              Unlock {pendingCountry.name}?
            </h3>
            <p className="text-sm text-white/60 mb-5">
              This will cost{' '}
              <span className="text-yellow-400 font-semibold">{UNLOCK_COST} tokens</span>.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingCountry(null)}
                className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
                className="flex-1 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

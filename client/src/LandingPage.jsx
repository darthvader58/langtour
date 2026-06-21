import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { API } from './api'

const EARTH_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
const CLOUDS_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'
const SPECULAR_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg'

const CHINA = { name: 'China', flag: '\u{1F1E8}\u{1F1F3}', lat: 35.8617, lng: 104.1954, unlocked: true }

const COUNTRIES = [
  CHINA,
  { name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', lat: 36.2048, lng: 138.2529, unlocked: false },
  { name: 'France', flag: '\u{1F1EB}\u{1F1F7}', lat: 46.2276, lng: 2.2137, unlocked: false },
  { name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}', lat: 23.6345, lng: -102.5528, unlocked: false },
  { name: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}', lat: 26.8206, lng: 30.8025, unlocked: false },
  { name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}', lat: -14.235, lng: -51.9253, unlocked: false },
]

const UNLOCK_COST = 100
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
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
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

export default function LandingPage({ tokens, unlockedCountries = ["China"], glowCountry, onUnlockCountry, onCountrySelect }) {
  const mountRef = useRef(null)
  const triggerTravelRef = useRef(() => {})
  const onCountrySelectRef = useRef(onCountrySelect)
  const onChinaMarkerClickRef = useRef(() => {})

  const triggerDiveRef = useRef(() => {})

  const [pendingCountry, setPendingCountry] = useState(null)
  const [isTraveling, setIsTraveling] = useState(false)
  const [travelLabel, setTravelLabel] = useState('')
  const [showFlash, setShowFlash] = useState(false)

  useEffect(() => {
    onCountrySelectRef.current = onCountrySelect
  }, [onCountrySelect])

  function handleSelectCountry(country) {
    if (isTraveling) return;
    const isUnlocked = unlockedCountries.includes(country.name);
    if (isUnlocked) {
      setIsTraveling(true);
      setTravelLabel(`Flying to ${country.name}…`);
      triggerTravelRef.current(country.lat, country.lng, () => {
        setTravelLabel('Arriving…');
        triggerDiveRef.current(() => {
          setShowFlash(true);
          window.setTimeout(() => {
            onCountrySelectRef.current?.(country.name);
          }, 500);
        });
      });
    } else {
      if (tokens < UNLOCK_COST) return;
      setPendingCountry(country);
    }
  }

  useEffect(() => {
    onChinaMarkerClickRef.current = () => handleSelectCountry(CHINA)
  })

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

  async function handleConfirmUnlock() {
    const country = pendingCountry
    if (!country) return
    const success = await onUnlockCountry(country.name, UNLOCK_COST)
    if (!success) return
    setPendingCountry(null)
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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#05060a] text-white font-sans">
      <div ref={mountRef} className="absolute inset-0" />

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.55)_100%)]" />

      <header className="absolute top-0 left-0 right-0 flex items-center justify-between p-6 pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="font-display text-3xl font-extrabold tracking-wide drop-shadow-md">
            <span className="text-white">Lang</span>
            <span className="text-[#58CC02]">tour</span>
          </h1>
          <p className="text-xs text-white/60 font-bold tracking-[0.2em] uppercase">
            Speak the world
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-full bg-[#1F2937] border-2 border-[#37464F] px-4 py-2.5 shadow-md">
            <span className="text-lg">{'\u{1F30D}'}</span>
            <span className="font-display text-sm font-extrabold text-white">
              Level {unlockedCountries.length}
            </span>
          </div>
          
          <div className="flex items-center gap-2.5 rounded-full bg-[#1F2937] border-2 border-[#37464F] px-5 py-2.5 shadow-md">
            <CoinIcon />
            <span className="font-display text-xl font-extrabold tabular-nums text-white">
              {tokens}
            </span>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              tokens
            </span>
          </div>
        </div>
      </header>

      <aside className="absolute top-1/2 left-6 -translate-y-1/2 w-64 rounded-3xl bg-[#1F2937] border-2 border-[#37464F] p-4 pointer-events-auto shadow-xl">
        <h2 className="font-display text-sm font-extrabold uppercase tracking-widest text-gray-400 mb-3 px-1">
          Choose a Country
        </h2>
        <ul className="flex flex-col gap-2">
          {COUNTRIES.map((country) => {
            const isUnlocked = unlockedCountries.includes(country.name);
            return (
            <li key={country.name}>
              <button
                type="button"
                disabled={isTraveling}
                onClick={() => handleSelectCountry(country)}
                title={isUnlocked ? `Travel to ${country.name}` : `Unlock ${country.name} (100 tokens)`}
                className={
                  'w-full flex items-center justify-between rounded-2xl px-3 py-2.5 text-left transition-all duration-150 border-2 ' +
                  (isUnlocked
                    ? 'bg-[#58CC02] hover:bg-[#61D908] active:translate-y-0.5 cursor-pointer text-white font-extrabold border-[#46A302] border-b-4 active:border-b-2' +
                      (glowCountry === country.name ? ' animate-country-glow' : '')
                    : 'bg-[#1F2937] hover:bg-[#28323c] active:translate-y-0.5 text-gray-300 cursor-pointer border-[#37464F] border-b-4 active:border-b-2')
                }
              >
                <span className="flex items-center gap-2.5">
                  <span className={'text-xl transition-opacity' + (isUnlocked ? '' : ' opacity-50 grayscale')}>
                    {country.flag}
                  </span>
                  <span className="font-display font-extrabold">{country.name}</span>
                </span>
                {isUnlocked ? (
                  <span className="text-[10px] uppercase tracking-wide text-white/80 font-extrabold">
                    Unlocked
                  </span>
                ) : (
                  <span className="text-gray-400">
                    <LockIcon />
                  </span>
                )}
              </button>
            </li>
          )})}
        </ul>
      </aside>

      {isTraveling && !showFlash && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full bg-[#1F2937] border-2 border-[#37464F] shadow-md text-sm font-extrabold tracking-wide font-display text-white animate-pulse pointer-events-none">
          {travelLabel}
        </div>
      )}

      {pendingCountry && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-auto animate-overlay-fade">
          <div className="animate-modal-pop w-80 rounded-3xl bg-[#1F2937] border-2 border-[#37464F] p-7 text-center shadow-2xl">
            <div className="text-4xl mb-3">{pendingCountry.flag}</div>
            <h3 className="font-display text-xl font-extrabold mb-2 text-white">
              Unlock {pendingCountry.name}?
            </h3>
            <p className="text-sm text-gray-400 font-medium mb-6">
              This will cost <span className="text-white font-extrabold">{UNLOCK_COST} tokens</span>.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingCountry(null)}
                className="flex-1 py-2.5 rounded-2xl bg-[#1F2937] hover:bg-[#28323c] border-2 border-[#37464F] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all font-display font-extrabold uppercase tracking-wide text-gray-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
                className="flex-1 py-2.5 rounded-2xl bg-[#58CC02] hover:bg-[#61D908] border-2 border-[#46A302] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all text-white font-display font-extrabold uppercase tracking-wide"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showFlash && (
        <div className="absolute inset-0 bg-white animate-cinematic-flash pointer-events-none" />
      )}

      <button 
        onClick={async () => {
          if (window.confirm("Are you sure you want to completely reset your progress and the database?")) {
            await fetch(`${API}/api/admin/reset`, { method: 'POST' });
            window.location.reload();
          }
        }}
        className="absolute bottom-6 right-6 pointer-events-auto flex items-center justify-center rounded-2xl bg-[#FF4B4B] hover:bg-[#FF5555] active:translate-y-0.5 border-2 border-[#EA1B1B] border-b-4 active:border-b-2 px-4 py-2 font-display text-sm font-extrabold uppercase tracking-widest text-white transition-all shadow-md z-50"
      >
        Reset
      </button>
    </div>
  )
}

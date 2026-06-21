import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import AuthModal from './components/AuthModal'
import { LAND } from './assets/landPolygons'

const TRAVEL_DURATION_MS = 2200
const DIVE_DURATION_MS = 750
const GLOBE_RADIUS = 2
const EARTH_SPIN_SPEED = 0.0009
const CLOUD_SPIN_SPEED = 0.0015
const FLAG_CODE_BY_COUNTRY = {
  China: 'cn',
  India: 'in',
  France: 'fr',
  Mexico: 'mx',
  Egypt: 'eg',
  Brazil: 'br',
}

function createToyboxGlobeTexture() {
  const width = 1536
  const height = 768
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const ocean = ctx.createLinearGradient(0, 0, 0, height)
  ocean.addColorStop(0, '#1c5277')
  ocean.addColorStop(0.52, '#153f63')
  ocean.addColorStop(1, '#0d2947')
  ctx.fillStyle = ocean
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(171, 222, 232, 0.15)'
  ctx.lineWidth = 1
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * height
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  for (let lng = -150; lng <= 150; lng += 30) {
    const x = ((lng + 180) / 360) * width
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  for (const polygon of LAND) {
    ctx.beginPath()
    polygon.forEach(([lng, lat], index) => {
      const x = ((lng + 180) / 360) * width
      const y = ((90 - lat) / 180) * height
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = '#57986b'
    ctx.fill()
    ctx.strokeStyle = 'rgba(205, 239, 207, 0.62)'
    ctx.lineWidth = 1.7
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function createToyCloud() {
  const cloud = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({
    color: 0xdcecf1,
    roughness: 1,
    transparent: true,
    opacity: 0.72,
  })
  const parts = [
    [-0.15, 0, 0, 0.13],
    [0, 0.05, 0, 0.18],
    [0.17, 0, 0, 0.12],
    [0.05, -0.035, 0.02, 0.15],
  ]
  for (const [x, y, z, radius] of parts) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material)
    puff.position.set(x, y, z)
    cloud.add(puff)
  }
  return cloud
}

function createOrbitPlane() {
  const plane = new THREE.Group()
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffa45f, roughness: 0.55 })
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xffe6ce, roughness: 0.7 })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.28, 8), bodyMaterial)
  body.rotation.z = Math.PI / 2
  plane.add(body)
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.28), trimMaterial)
  plane.add(wing)
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.1, 0.025), trimMaterial)
  tail.position.x = -0.12
  plane.add(tail)
  return plane
}

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

function createStarField() {
  const starCount = 1800
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
    size: 0.45,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.68,
  })
  return new THREE.Points(geometry, material)
}

function createCountryMarker(country) {
  const group = new THREE.Group()
  const direction = latLngToDirection(country.lat, country.lng).normalize()
  group.position.copy(direction.multiplyScalar(GLOBE_RADIUS * 1.01))

  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  )
  group.add(hitMesh)

  return { group, hitMesh }
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

export default function LandingPage({ tokens, unlockedCountries, glowCountry, level, rank, auth, countries, characters, unlockCost, onUnlockCountry, onCountrySelect }) {
  const mountRef = useRef(null)
  const triggerTravelRef = useRef(() => {})
  const onCountrySelectRef = useRef(onCountrySelect)
  const handleSelectCountryRef = useRef(() => {})

  const triggerDiveRef = useRef(() => {})

  const [pendingCountry, setPendingCountry] = useState(null)
  const [isTraveling, setIsTraveling] = useState(false)
  const [travelLabel, setTravelLabel] = useState('')
  const [showFlash, setShowFlash] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  const {
    user,
    authLoading,
    authError,
    authMessage,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  } = auth

  useEffect(() => {
    onCountrySelectRef.current = onCountrySelect
  }, [onCountrySelect])

  function handleSelectCountry(country) {
    if (isTraveling) return;
    const isUnlocked = unlockedCountries.includes(country.name.toLowerCase());
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
      if (tokens < unlockCost) return;
      setPendingCountry(country);
    }
  }

  useEffect(() => {
    handleSelectCountryRef.current = handleSelectCountry
  })



  useEffect(() => {
    const mount = mountRef.current
    const width = mount.clientWidth
    const height = mount.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x07101d)
    scene.fog = new THREE.FogExp2(0x07101d, 0.012)

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 0.15, 6.35)
    const baseFov = camera.fov

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    mount.appendChild(renderer.domElement)

    const flagLabel = document.createElement('img')
    Object.assign(flagLabel.style, {
      position: 'absolute',
      zIndex: '5',
      display: 'none',
      pointerEvents: 'none',
      transform: 'translate(-50%, -115%)',
      width: '46px',
      height: 'auto',
      borderRadius: '4px',
      filter: 'drop-shadow(0 8px 10px rgba(0,0,0,.55))',
    })
    mount.appendChild(flagLabel)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.minDistance = 3.4
    controls.maxDistance = 9

    const deepSpace = new THREE.Group()
    deepSpace.add(createStarField())
    scene.add(deepSpace)

    const ambientLight = new THREE.HemisphereLight(0x9edcff, 0x07101d, 1.5)
    const sunLight = new THREE.DirectionalLight(0xffe3c2, 2.4)
    const rimLight = new THREE.DirectionalLight(0x4f9cff, 1.2)
    sunLight.position.set(5, 4, 5)
    rimLight.position.set(-5, -1, -4)
    scene.add(ambientLight, sunLight, rimLight)

    const planetGroup = new THREE.Group()
    scene.add(planetGroup)

    const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48)
    const globeTexture = createToyboxGlobeTexture()
    const globeMaterial = new THREE.MeshStandardMaterial({
      map: globeTexture,
      roughness: 0.88,
      metalness: 0.015,
    })
    const globe = new THREE.Mesh(globeGeometry, globeMaterial)
    planetGroup.add(globe)

    const toyDecorations = new THREE.Group()
    scene.add(toyDecorations)
    const cloudLayer = new THREE.Group()
    toyDecorations.add(cloudLayer)
    const toyClouds = []
    for (let index = 0; index < 6; index += 1) {
      const cloud = createToyCloud()
      const angle = (index / 6) * Math.PI * 2 + 0.35
      const radius = 2.65 + (index % 2) * 0.32
      cloud.position.set(
        Math.cos(angle) * radius,
        -1.15 + (index % 3) * 1.05,
        Math.sin(angle) * radius,
      )
      cloud.scale.setScalar(0.75 + (index % 2) * 0.2)
      cloud.userData = { angle, radius, speed: 0.00012 + index * 0.000012 }
      cloudLayer.add(cloud)
      toyClouds.push(cloud)
    }

    const planeOrbit = new THREE.Group()
    planeOrbit.rotation.x = 0.52
    planeOrbit.rotation.z = 0.22
    toyDecorations.add(planeOrbit)
    const orbitPoints = Array.from({ length: 129 }, (_, index) => {
      const angle = (index / 128) * Math.PI * 2
      return new THREE.Vector3(Math.cos(angle) * 2.72, 0, Math.sin(angle) * 2.72)
    })
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints)
    const orbitMaterial = new THREE.LineDashedMaterial({
      color: 0x9bc9d8,
      dashSize: 0.09,
      gapSize: 0.075,
      transparent: true,
      opacity: 0.24,
    })
    const orbitRing = new THREE.Line(orbitGeometry, orbitMaterial)
    orbitRing.computeLineDistances()
    planeOrbit.add(orbitRing)
    const orbitPlane = createOrbitPlane()
    planeOrbit.add(orbitPlane)
    let planeAngle = 0.8

    const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.22, 64, 64)
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(0x65c8ff) } },
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
          float intensity = pow(0.62 - dot(vNormal, vViewDir), 3.2);
          gl_FragColor = vec4(glowColor, clamp(intensity * 0.7, 0.0, 0.72));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    scene.add(atmosphere)

    const markers = countries.map(country => {
      const marker = createCountryMarker(country)
      marker.country = country
      planetGroup.add(marker.group)
      return marker
    })
    const hitMeshes = markers.map(m => m.hitMesh)

    const raycaster = new THREE.Raycaster()
    const pointerNdc = new THREE.Vector2()
    let hoveredMarker = null

    function updatePointer(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    function handlePointerMove(event) {
      if (travel || dive) {
        flagLabel.style.display = 'none'
        return
      }
      updatePointer(event)
      raycaster.setFromCamera(pointerNdc, camera)
      const intersects = raycaster.intersectObjects(hitMeshes)
      hoveredMarker = intersects.length > 0 ? intersects[0].object : null
      renderer.domElement.style.cursor = hoveredMarker ? 'pointer' : 'auto'
      const marker = hoveredMarker ? markers.find((item) => item.hitMesh === hoveredMarker) : null
      if (marker) {
        const rect = renderer.domElement.getBoundingClientRect()
        const flagCode = FLAG_CODE_BY_COUNTRY[marker.country.name] ?? marker.country.code
        const flagUrl = `https://flagcdn.com/${flagCode}.svg`
        if (flagLabel.src !== flagUrl) flagLabel.src = flagUrl
        flagLabel.alt = `${marker.country.name} flag`
        flagLabel.style.left = `${event.clientX - rect.left}px`
        flagLabel.style.top = `${event.clientY - rect.top}px`
        flagLabel.style.display = 'block'
      } else {
        flagLabel.style.display = 'none'
      }
    }

    function handlePointerLeave() {
      hoveredMarker = null
      flagLabel.style.display = 'none'
      renderer.domElement.style.cursor = 'auto'
    }

    function handleClick(event) {
      if (travel || dive) return
      updatePointer(event)
      raycaster.setFromCamera(pointerNdc, camera)
      const intersects = raycaster.intersectObjects(hitMeshes)
      if (intersects.length > 0) {
        const clickedHitMesh = intersects[0].object
        const marker = markers.find(m => m.hitMesh === clickedHitMesh)
        if (marker) handleSelectCountryRef.current(marker.country)
      }
    }

    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
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
      cloudLayer.rotation.y += CLOUD_SPIN_SPEED * 0.08
      deepSpace.rotation.y += 0.00012
      deepSpace.rotation.x += 0.00004

      const t = performance.now() * 0.001
      toyClouds.forEach((cloud) => {
        cloud.userData.angle += cloud.userData.speed
        cloud.position.x = Math.cos(cloud.userData.angle) * cloud.userData.radius
        cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.radius
        cloud.position.y += Math.sin(t * 0.45 + cloud.id) * 0.00025
        cloud.lookAt(camera.position)
      })
      planeAngle += 0.0032
      orbitPlane.position.set(Math.cos(planeAngle) * 2.72, 0, Math.sin(planeAngle) * 2.72)
      orbitPlane.rotation.y = -planeAngle + Math.PI / 2
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
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      renderer.dispose()
      globeGeometry.dispose()
      globeMaterial.dispose()
      globeTexture.dispose()
      toyDecorations.traverse((object) => {
        object.geometry?.dispose()
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
        else object.material?.dispose()
      })
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      mount.removeChild(flagLabel)
      mount.removeChild(renderer.domElement)
    }
  }, [countries])

  async function handleConfirmUnlock() {
    const country = pendingCountry
    if (!country) return
    const success = await onUnlockCountry(country.name, unlockCost)
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
    <div className="relative h-screen w-screen overflow-hidden bg-[#07101d] text-white font-sans">
      <div ref={mountRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_42%,_rgba(32,93,133,0.13)_0%,_transparent_38%),linear-gradient(180deg,_rgba(3,8,18,0.08)_0%,_rgba(3,8,18,0.7)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:64px_64px]" />

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 px-4 py-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:gap-4 sm:px-8 sm:py-7">
        <div className="pointer-events-auto shrink-0">
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] drop-shadow-md sm:text-[1.8rem]">
            <span className="text-white">Lang</span>
            <span className="text-[#ff9a4d]">tour</span>
          </h1>
          <p className="mt-1 hidden text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 sm:block">
            A world of stories awaits
          </p>
        </div>

        <div className="pointer-events-auto flex max-w-[68vw] flex-wrap items-center justify-end gap-1.5 sm:gap-2.5">
          <div className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#0b1727]/85 px-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-200 shadow-[0_12px_35px_rgba(0,0,0,.28)] backdrop-blur-xl sm:h-11 sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-xs sm:tracking-[0.12em]">
            <span className="h-2 w-2 rounded-full bg-[#ff9a4d] shadow-[0_0_12px_rgba(255,154,77,.8)]" />
            <span>
              Level {level?.display_order ?? unlockedCountries.length}
            </span>
            {rank?.name && <span className="ml-1 text-[9px] font-bold tracking-wider text-[#ffb77f]">{rank.name}</span>}
          </div>
          
          <div className="flex h-9 items-center justify-center gap-1 rounded-xl border border-amber-300/15 bg-[#0b1727]/85 px-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-100 shadow-[0_12px_35px_rgba(0,0,0,.28)] backdrop-blur-xl tabular-nums sm:h-11 sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-xs sm:tracking-[0.12em]">
            <CoinIcon />
            <span>{tokens} tokens</span>
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => {
                setShowAuth(false)
                signOut()
              }}
              disabled={authLoading}
              title={`Signed in as ${user.email}. Click to sign out.`}
              className="flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-[#0b1727]/85 px-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-300 shadow-[0_12px_35px_rgba(0,0,0,.28)] backdrop-blur-xl transition-colors hover:bg-[#14243a] hover:text-white disabled:pointer-events-none disabled:opacity-50"
            >
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              disabled={authLoading}
              className="flex h-11 items-center justify-center rounded-2xl border border-[#ffb77f]/30 bg-[#ff9a4d] px-5 text-xs font-extrabold uppercase tracking-[0.12em] text-[#1b1008] shadow-[0_10px_30px_rgba(255,122,47,.2)] transition-colors hover:bg-[#ffad70] disabled:pointer-events-none disabled:opacity-50"
            >
              {authLoading ? 'Connecting…' : 'Sign in'}
            </button>
          )}
        </div>
      </header>

      {authError && !showAuth && (
        <div className="absolute right-6 top-24 z-30 max-w-sm rounded-xl border border-red-400/30 bg-red-950/80 px-4 py-3 text-sm text-red-100 backdrop-blur-xl">
          {authError}
        </div>
      )}

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

      <aside className="pointer-events-auto absolute left-7 top-1/2 z-20 w-[clamp(18rem,28vw,22rem)] -translate-y-1/2 rounded-[1.8rem] border border-white/10 bg-[#091525]/90 p-5 shadow-[0_28px_90px_rgba(0,0,0,.5)] backdrop-blur-2xl max-sm:bottom-[max(.75rem,env(safe-area-inset-bottom))] max-sm:left-3 max-sm:right-3 max-sm:top-auto max-sm:max-h-[52dvh] max-sm:w-auto max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:p-3 [@media(max-height:720px)]:max-h-[76dvh] [@media(max-height:720px)]:overflow-y-auto [@media(max-height:720px)]:p-3">
        <div className="mb-4 px-2 pt-1 max-sm:mb-2">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-[#ff9a4d]">Your next mission</p>
          <h2 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-white max-sm:text-lg">Choose your tale</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500 max-sm:hidden">Every destination unlocks a new identity.</p>
        </div>
        <ul className="flex flex-col gap-2 max-sm:grid max-sm:grid-cols-2">
          {countries.map((country) => {
            const isUnlocked = unlockedCountries.includes(country.name.toLowerCase());
            return (
            <li key={country.name}>
              <button
                type="button"
                disabled={isTraveling}
                onClick={() => handleSelectCountry(country)}
                title={isUnlocked ? `Travel to ${country.name}` : `Unlock ${country.name} (${unlockCost} tokens)`}
                className={
                  'group w-full flex items-center justify-between rounded-2xl px-3.5 py-3 text-left transition-all border max-sm:px-2.5 max-sm:py-2 ' +
                  (isUnlocked
                    ? 'bg-gradient-to-r from-[#172a3d] to-[#112033] hover:from-[#20374d] hover:to-[#162a40] cursor-pointer text-white border-[#ff9a4d]/35 shadow-[inset_3px_0_0_#ff9a4d]' +
                      (glowCountry === country.name ? ' animate-country-glow' : '')
                    : 'bg-white/[0.025] hover:bg-white/[0.055] text-slate-400 cursor-pointer border-white/[0.07]')
                }
              >
                <span className="flex min-w-0 items-center gap-3.5 max-sm:gap-2">
                  <span className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-[#08121f] text-xl shadow-inner max-sm:h-9 max-sm:w-9 max-sm:text-base ' + (isUnlocked ? 'border-[#ff9a4d]/25' : 'border-white/10 opacity-45 grayscale')}>{country.flag}</span>
                  <span>
                    <span className="block truncate text-sm font-extrabold uppercase tracking-[0.09em] max-sm:text-[11px]">{country.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold tracking-wide text-slate-500 max-sm:text-[9px]">{characters[country.name]?.type ?? 'New mission'}</span>
                  </span>
                </span>
                {isUnlocked ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff9a4d] shadow-[0_0_9px_rgba(255,154,77,.85)]" />
                ) : (
                  <span className="text-slate-600 transition-colors group-hover:text-slate-400">
                    <LockIcon />
                  </span>
                )}
              </button>
            </li>
          )})}
        </ul>
      </aside>

      {isTraveling && !showFlash && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[#ff9a4d]/30 bg-[#091525]/90 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[#ffc08f] shadow-[0_14px_40px_rgba(0,0,0,.35)] backdrop-blur-xl animate-pulse">
          {travelLabel}
        </div>
      )}

      {pendingCountry && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[#02060d]/75 px-4 backdrop-blur-md animate-overlay-fade">
          <div className="animate-modal-pop w-full max-w-sm rounded-[1.6rem] border border-white/10 bg-[#0b1727] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,.65)]">
            <div className="flex justify-center mb-4">
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#ff9a4d]/25 bg-[#07101d] text-4xl shadow-inner">{pendingCountry.flag}</span>
            </div>
            <h3 className="font-display text-xl font-extrabold mb-2 text-white">
              Unlock {pendingCountry.name}?
            </h3>
            <p className="text-sm text-gray-400 font-medium mb-6">
              This will cost <span className="text-white font-extrabold">{unlockCost} tokens</span>.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingCountry(null)}
              className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
              className="flex flex-1 items-center justify-center rounded-xl border border-[#ffb77f]/25 bg-[#ff9a4d] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[#1b1008] transition-colors hover:bg-[#ffad70]"
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
          if (window.confirm("Reset your progress? This wipes your unlocked countries, completed scenarios, tokens, and XP.")) {
            const ok = await auth.resetProgress();
            if (ok) window.location.reload();
          }
        }}
        className="pointer-events-auto absolute bottom-6 right-7 z-20 flex items-center justify-center rounded-xl border border-white/[0.08] bg-[#091525]/70 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600 backdrop-blur-lg transition-colors hover:border-red-400/20 hover:text-red-300 max-sm:hidden"
      >
        Reset
      </button>

      <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600 max-sm:hidden">
        Drag to explore <span className="mx-2 text-slate-700">·</span> Scroll to zoom <span className="mx-2 text-slate-700">·</span> Select a destination
      </div>
    </div>
  )
}

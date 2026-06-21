import { useState, useEffect } from 'react'
import LandingPage from './LandingPage'
import ScenariosPage from './ScenariosPage'
import VoiceTestPage from './pages/VoiceTestPage'
import ScenarioRunner from './components/ScenarioRunner'
import CountryBriefingModal from './components/CountryBriefingModal'
import LevelUpAnimation from './components/LevelUpAnimation'
import PassportCompletion from './components/PassportCompletion'
import AmbientParticles from './components/AmbientParticles'
import { API } from './api'
import {
  CHARACTERS, COUNTRIES, SCENARIOS_BY_COUNTRY, UNLOCK_COST, REWARD_TOKENS, levelForCompleted,
} from './gameData'

// China is the starting sector and is always playable, even though the backend
// seeds the unlocked list empty.
const ALWAYS_UNLOCKED = 'China'

function ensureChina(list) {
  const arr = Array.isArray(list) ? list : []
  return arr.includes(ALWAYS_UNLOCKED) ? arr : [ALWAYS_UNLOCKED, ...arr]
}

function App() {
  const [selectedCountry,    setSelectedCountry]    = useState(null)
  const [activeScenario,     setActiveScenario]      = useState(null)
  const [hash,               setHash]                = useState(window.location.hash)

  // Persisted via the node backend (/api/user/state). Seeded at 100 so the
  // HUD shows a full purse immediately on first load for the demo.
  const [tokens,             setTokens]              = useState(100)
  const [unlockedCountries,  setUnlockedCountries]   = useState([ALWAYS_UNLOCKED])
  const [completedScenarios, setCompletedScenarios]  = useState([])

  const [glowCountry,        setGlowCountry]         = useState(null)
  const [storySeen,          setStorySeen]           = useState([])

  // Post-scenario screen sequencing
  const [levelUpData,   setLevelUpData]   = useState(null) // { oldLevel, newLevel, character }
  const [passportData,  setPassportData]  = useState(null) // { country, flag, progress, scenarios }
  const [postQueue,     setPostQueue]     = useState([])    // remaining screens to show

  // Load persisted progress from the backend on first mount
  useEffect(() => {
    let cancelled = false
    fetch(`${API}/api/user/state`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (typeof data.tokens === 'number') setTokens(data.tokens)
        setUnlockedCountries(ensureChina(data.unlockedCountries))
        setCompletedScenarios(Array.isArray(data.completedScenarios) ? data.completedScenarios : [])
      })
      .catch(err => console.error('Failed to load user state from backend:', err))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (hash === '#test') return <VoiceTestPage />

  // Derive per-scenario progress (0/100) for a country from the completed list
  function getProgress(country) {
    const scenarios = SCENARIOS_BY_COUNTRY[country] ?? []
    return scenarios.map(s => completedScenarios.includes(s.id) ? 100 : 0)
  }

  // Progress map for every country (used by the globe heat zones)
  function buildProgressByCountry() {
    const map = {}
    COUNTRIES.forEach(c => {
      const scenarios = SCENARIOS_BY_COUNTRY[c.name] ?? []
      map[c.name] = scenarios.map(s => completedScenarios.includes(s.id) ? 100 : 0)
    })
    return map
  }

  async function handleUnlockCountry(country) {
    try {
      const res  = await fetch(`${API}/api/user/unlock-country`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ countryName: country.name, cost: UNLOCK_COST }),
      })
      const data = await res.json()
      if (data.success) {
        setTokens(data.tokens)
        setUnlockedCountries(ensureChina(data.unlockedCountries))
        return
      }
      console.error('Unlock rejected by backend:', data.error)
    } catch (err) {
      console.error('Unlock request failed:', err)
    }
    // Fallback so the UI still reflects the unlock if the backend is unreachable
    setTokens(t => t - UNLOCK_COST)
    setUnlockedCountries(list => list.includes(country.name) ? list : [...list, country.name])
  }

  function handleSelectCountry(countryName) {
    setGlowCountry(current => current === countryName ? null : current)
    setSelectedCountry(countryName)
  }

  function showNextPostScreen(queue) {
    const [next, ...rest] = queue
    setPostQueue(rest)
    if (!next) return
    if (next.type === 'levelup')  setLevelUpData(next.data)
    if (next.type === 'passport') setPassportData(next.data)
  }

  // Launch a scenario into the ScenarioRunner gameplay (from feat/lessons)
  function handleScenarioStart(scenario) {
    setActiveScenario(scenario)
  }

  // Called by ScenarioRunner/GameplayPhase when a mission ends
  async function handleEndScenario(result) {
    const country  = selectedCountry
    const scenario = activeScenario
    setActiveScenario(null)
    if (!country || !scenario || !result?.completed) return

    const scenarios     = SCENARIOS_BY_COUNTRY[country] ?? []
    const alreadyDone   = completedScenarios.includes(scenario.id)
    const newCompleted  = alreadyDone ? completedScenarios : [...completedScenarios, scenario.id]

    if (!alreadyDone) {
      setCompletedScenarios(newCompleted)
      try {
        await fetch(`${API}/api/user/complete-scenario`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ scenarioId: scenario.id }),
        })
      } catch (err) {
        console.error('Failed to persist scenario completion:', err)
      }
    }

    const countDone   = list => scenarios.filter(s => list.includes(s.id)).length
    const oldLevel    = levelForCompleted(countDone(completedScenarios))
    const newLevel    = levelForCompleted(countDone(newCompleted))
    const leveledUp   = newLevel > oldLevel
    const allComplete = scenarios.length > 0 && scenarios.every(s => newCompleted.includes(s.id))
    const progress    = scenarios.map(s => newCompleted.includes(s.id) ? 100 : 0)

    // Queue up any celebration screens earned by this completion
    const queue = []
    if (leveledUp)   queue.push({ type: 'levelup',  data: { oldLevel, newLevel, character: CHARACTERS[country] } })
    if (allComplete) queue.push({ type: 'passport', data: { country, flag: COUNTRIES.find(c => c.name === country)?.flag ?? '', progress, scenarios } })

    showNextPostScreen(queue)
  }

  function handleLevelUpDone() {
    setLevelUpData(null)
    showNextPostScreen(postQueue)
  }

  async function handlePassportClaim() {
    setPassportData(null)
    setSelectedCountry(null)
    try {
      const res  = await fetch(`${API}/api/user/earn`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: REWARD_TOKENS }),
      })
      const data = await res.json()
      if (data.success && typeof data.tokens === 'number') setTokens(data.tokens)
      else setTokens(t => t + REWARD_TOKENS)
    } catch (err) {
      console.error('Failed to award reward tokens:', err)
      setTokens(t => t + REWARD_TOKENS)
    }
    const next = COUNTRIES.find(c => !unlockedCountries.includes(c.name))
    if (next) setGlowCountry(next.name)
  }

  // ── Screen priority ──────────────────────────────────────────
  if (passportData) {
    const vocabMastered = (passportData.scenarios ?? []).reduce((sum, s) => sum + (s.vocab?.length ?? 0), 0)
    return (
      <PassportCompletion
        country={passportData.country}
        ducatsEarned={REWARD_TOKENS}
        vocabMastered={vocabMastered}
        onReturn={handlePassportClaim}
      />
    )
  }

  if (levelUpData) {
    return (
      <LevelUpAnimation
        oldLevel={levelUpData.oldLevel}
        newLevel={levelUpData.newLevel}
        character={levelUpData.character}
        onDone={handleLevelUpDone}
      />
    )
  }

  if (activeScenario) {
    return (
      <ScenarioRunner
        scenario={activeScenario}
        country={selectedCountry}
        onEndScenario={handleEndScenario}
      />
    )
  }

  if (selectedCountry && !storySeen.includes(selectedCountry)) {
    return (
      <CountryBriefingModal
        country={selectedCountry}
        onAccept={() => setStorySeen(seen => [...seen, selectedCountry])}
        onClose={() => setSelectedCountry(null)}
      />
    )
  }

  if (selectedCountry) {
    return (
      <ScenariosPage
        country={selectedCountry}
        progress={getProgress(selectedCountry)}
        onBack={() => setSelectedCountry(null)}
        onScenarioStart={handleScenarioStart}
      />
    )
  }

  return (
    <>
      <AmbientParticles />
      <LandingPage
        tokens={tokens}
        level={levelForCompleted(completedScenarios.length)}
        unlockedCountries={unlockedCountries}
        glowCountry={glowCountry}
        progressByCountry={buildProgressByCountry()}
        onUnlockCountry={handleUnlockCountry}
        onCountrySelect={handleSelectCountry}
      />
    </>
  )
}

export default App

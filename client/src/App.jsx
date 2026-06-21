import { useState, useEffect } from 'react'
import LandingPage from './LandingPage'
import ScenariosPage from './ScenariosPage'
import VoiceTestPage from './pages/VoiceTestPage'
import CharacterStoryPopup from './CharacterStoryPopup'
import LevelUpAnimation from './components/LevelUpAnimation'
import PassportStamp from './components/PassportStamp'
import AmbientParticles from './components/AmbientParticles'
import {
  CHARACTERS, COUNTRIES, SCENARIOS_BY_COUNTRY, UNLOCK_COST, REWARD_TOKENS, levelForCompleted,
} from './gameData'

const STARTING_TOKENS = 100

function App() {
  const [selectedCountry,    setSelectedCountry]    = useState(null)
  const [hash,               setHash]                = useState(window.location.hash)
  const [tokens,             setTokens]              = useState(STARTING_TOKENS)
  const [unlockedCountries,  setUnlockedCountries]   = useState(['China'])
  const [glowCountry,        setGlowCountry]         = useState(null)
  const [progressByCountry,  setProgressByCountry]   = useState({})
  const [storySeen,          setStorySeen]           = useState([])

  // Post-scenario screen sequencing
  const [levelUpData,   setLevelUpData]   = useState(null) // { oldLevel, newLevel, character }
  const [passportData,  setPassportData]  = useState(null) // { country, flag, progress, scenarios }
  const [postQueue,     setPostQueue]     = useState([])    // remaining screens to show, e.g. ['levelup', 'passport']

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (hash === '#test') return <VoiceTestPage />

  function getProgress(country) {
    const scenarios = SCENARIOS_BY_COUNTRY[country] ?? []
    return progressByCountry[country] ?? scenarios.map(() => 0)
  }

  function handleUnlockCountry(country) {
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

  function handleCompleteScenario(scenario) {
    const country = selectedCountry
    if (!country || !scenario) return

    const scenarios = SCENARIOS_BY_COUNTRY[country] ?? []
    const index     = scenarios.findIndex(s => s.id === scenario.id)
    if (index === -1) return

    const prevProgress = getProgress(country)
    const updated      = prevProgress.map((p, i) => i === index ? 100 : p)
    setProgressByCountry(map => ({ ...map, [country]: updated }))

    const oldLevel    = levelForCompleted(prevProgress.filter(p => p >= 100).length)
    const newLevel    = levelForCompleted(updated.filter(p => p >= 100).length)
    const leveledUp   = newLevel > oldLevel
    const allComplete = scenarios.length > 0 && updated.every(p => p >= 100)

    // Queue up any celebration screens earned by this completion
    const queue = []
    if (leveledUp)   queue.push({ type: 'levelup',  data: { oldLevel, newLevel, character: CHARACTERS[country] } })
    if (allComplete) queue.push({ type: 'passport', data: { country, flag: COUNTRIES.find(c => c.name === country)?.flag ?? '', progress: updated, scenarios } })

    showNextPostScreen(queue)
  }

  function handleLevelUpDone() {
    setLevelUpData(null)
    showNextPostScreen(postQueue)
  }

  function handlePassportClaim() {
    setPassportData(null)
    setSelectedCountry(null)
    setTokens(t => t + REWARD_TOKENS)
    const next = COUNTRIES.find(c => !unlockedCountries.includes(c.name))
    if (next) setGlowCountry(next.name)
  }

  // ── Screen priority ──────────────────────────────────────────
  if (passportData) {
    return (
      <PassportStamp
        country={passportData.country}
        flag={passportData.flag}
        progress={passportData.progress}
        scenarios={passportData.scenarios}
        onClaim={handlePassportClaim}
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

  if (selectedCountry && !storySeen.includes(selectedCountry)) {
    return (
      <CharacterStoryPopup
        country={selectedCountry}
        onBeginMission={() => setStorySeen(seen => [...seen, selectedCountry])}
      />
    )
  }

  if (selectedCountry) {
    return (
      <ScenariosPage
        country={selectedCountry}
        progress={getProgress(selectedCountry)}
        onBack={() => setSelectedCountry(null)}
        onScenarioStart={handleCompleteScenario}
      />
    )
  }

  return (
    <>
      <AmbientParticles />
      <LandingPage
        tokens={tokens}
        unlockedCountries={unlockedCountries}
        glowCountry={glowCountry}
        progressByCountry={progressByCountry}
        onUnlockCountry={handleUnlockCountry}
        onCountrySelect={handleSelectCountry}
      />
    </>
  )
}

export default App

import { useState, useEffect, useMemo } from 'react'
import LandingPage from './LandingPage'
import ScenariosPage from './ScenariosPage'
import VoiceTestPage from './pages/VoiceTestPage'
import CharacterStoryPopup from './CharacterStoryPopup'
import VocabularyWeb from './components/VocabularyWeb'
import LevelUpAnimation from './components/LevelUpAnimation'
import PassportStamp from './components/PassportStamp'
import VoiceWaveform from './components/VoiceWaveform'
import CognitiveLoadMeter from './components/CognitiveLoadMeter'
import { useProfile } from './hooks/useProfile'
import {
  CHARACTERS, COUNTRIES, SCENARIOS_BY_COUNTRY, UNLOCK_COST, REWARD_TOKENS, levelForCompleted,
} from './gameData'

function buildAllVocabData(progressByCountry) {
  return Object.entries(progressByCountry).flatMap(([country, progress]) =>
    (SCENARIOS_BY_COUNTRY[country] ?? []).map((scenario, i) => ({
      scenarioId: scenario.id,
      country,
      words:      scenario.vocab ?? [],
      progress:   progress[i] ?? 0,
    })).filter(entry => entry.progress > 0)
  )
}

function App() {
  const profile = useProfile()
  const {
    user, tokens, level, rank, completedScenarios,
    spendTokens, completeScenario, claimCountryReward,
  } = profile
  const [selectedCountry,    setSelectedCountry]    = useState(null)
  const [activeScenario,     setActiveScenario]      = useState(null)
  const [hash,               setHash]                = useState(window.location.hash)
  const [unlockedCountries,  setUnlockedCountries]   = useState(['China'])
  const [glowCountry,        setGlowCountry]         = useState(null)
  const [localProgressByCountry, setLocalProgressByCountry] = useState({})
  const [storySeen,          setStorySeen]           = useState([])

  // Post-scenario screen sequencing
  const [vocabWebData,  setVocabWebData]  = useState(null) // { allVocabData, currentScenarioId }
  const [levelUpData,   setLevelUpData]   = useState(null) // { oldLevel, newLevel, character }
  const [passportData,  setPassportData]  = useState(null) // { country, flag, progress, scenarios }
  // Queue of screens to show after vocab web closes
  const [postVocabQueue, setPostVocabQueue] = useState([]) // ['levelup', 'passport']

  // Cognitive load simulation
  const [cogScore,   setCogScore]   = useState(42)
  const [lastRespMs, setLastRespMs] = useState(null)
  const [errorCount, setErrorCount] = useState(0)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Simulate cognitive load changing during gameplay
  useEffect(() => {
    if (!activeScenario) return
    const interval = setInterval(() => {
      setCogScore(s => Math.max(10, Math.min(90, s + (Math.random() - 0.48) * 8)))
    }, 2500)
    return () => clearInterval(interval)
  }, [activeScenario])

  const syncedProgressByCountry = useMemo(() => Object.fromEntries(
    Object.entries(SCENARIOS_BY_COUNTRY).map(([country, scenarios]) => [
      country,
      scenarios.map((scenario) => completedScenarios.some((completion) =>
        completion.country_code === country.toLowerCase()
          && completion.scenario_id === scenario.id
      ) ? 100 : 0),
    ]),
  ), [completedScenarios])

  const progressByCountry = user ? syncedProgressByCountry : localProgressByCountry

  if (hash === '#test') return <VoiceTestPage />

  function getProgress(country) {
    const scenarios = SCENARIOS_BY_COUNTRY[country] ?? []
    return progressByCountry[country] ?? scenarios.map(() => 0)
  }

  async function handleUnlockCountry(country) {
    const spent = await spendTokens(UNLOCK_COST)
    if (!spent) return false
    setUnlockedCountries(list => list.includes(country.name) ? list : [...list, country.name])
    return true
  }

  function handleSelectCountry(countryName) {
    setGlowCountry(current => current === countryName ? null : current)
    setSelectedCountry(countryName)
  }

  async function handleFinishScenario() {
    const country  = selectedCountry
    const scenario = activeScenario
    if (!country || !scenario) return

    const saved = await completeScenario(country, scenario.id)
    if (!saved) return
    setActiveScenario(null)

    const scenarios = SCENARIOS_BY_COUNTRY[country] ?? []
    const index     = scenarios.findIndex(s => s.id === scenario.id)
    if (index === -1) return

    const prevProgress = getProgress(country)
    const updated      = prevProgress.map((p, i) => i === index ? 100 : p)
    setLocalProgressByCountry(map => ({ ...map, [country]: updated }))

    const oldLevel  = levelForCompleted(prevProgress.filter(p => p >= 100).length)
    const newLevel  = levelForCompleted(updated.filter(p => p >= 100).length)
    const leveledUp = newLevel > oldLevel
    const allComplete = scenarios.length > 0 && updated.every(p => p >= 100)

    // Build vocab data (include the just-completed scenario)
    const updatedProgress = { ...progressByCountry, [country]: updated }
    const allVocabData    = buildAllVocabData(updatedProgress)

    // Determine post-vocab screen queue
    const queue = []
    if (leveledUp)   queue.push({ type: 'levelup',  data: { oldLevel, newLevel, character: CHARACTERS[country] } })
    if (allComplete) queue.push({ type: 'passport', data: { country, flag: COUNTRIES.find(c => c.name === country)?.flag ?? '', progress: updated, scenarios } })

    setVocabWebData({ allVocabData, currentScenarioId: scenario.id })
    setPostVocabQueue(queue)
    setLastRespMs(null)
    setErrorCount(0)
    setCogScore(42)
  }

  function handleVocabWebClose() {
    setVocabWebData(null)
    const [next, ...rest] = postVocabQueue
    setPostVocabQueue(rest)
    if (!next) return
    if (next.type === 'levelup')  setLevelUpData(next.data)
    if (next.type === 'passport') setPassportData(next.data)
  }

  function handleLevelUpDone() {
    setLevelUpData(null)
    const [next, ...rest] = postVocabQueue
    setPostVocabQueue(rest)
    if (next?.type === 'passport') setPassportData(next.data)
  }

  async function handlePassportClaim() {
    const country = passportData?.country
    if (!country) return
    const claimed = await claimCountryReward(country, REWARD_TOKENS)
    if (!claimed) return
    setPassportData(null)
    setSelectedCountry(null)
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

  if (vocabWebData) {
    return (
      <VocabularyWeb
        allVocabData={vocabWebData.allVocabData}
        currentScenarioId={vocabWebData.currentScenarioId}
        onClose={handleVocabWebClose}
      />
    )
  }

  if (activeScenario) {
    return (
      <div className="w-screen h-screen flex flex-col bg-[#0F1418] text-white font-sans animate-fade-in-up">
        <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
          <h1 className="font-display text-lg font-extrabold">{activeScenario.title}</h1>
          <button
            type="button"
            onClick={handleFinishScenario}
            className="px-4 py-2 rounded-2xl bg-[#1F2937] hover:bg-[#28323c] border-2 border-[#37464F] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all font-display font-extrabold text-sm text-gray-400"
          >
            Finish Scenario
          </button>
        </header>

        <div className="flex-1 flex items-center justify-center gap-8 px-8">
          <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-lg">
            <div className="text-center text-gray-400">
              <p className="text-4xl mb-3">{activeScenario.icon}</p>
              <p className="font-display text-xl font-extrabold text-white mb-1">{activeScenario.title}</p>
              <p className="text-sm text-gray-500">Gameplay coming soon — press Finish Scenario to complete</p>
            </div>
            <VoiceWaveform active />
          </div>
          <CognitiveLoadMeter
            score={cogScore}
            lastResponseMs={lastRespMs}
            errorCount={errorCount}
          />
        </div>
      </div>
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
    const flag = COUNTRIES.find(c => c.name === selectedCountry)?.flag ?? ''
    return (
      <ScenariosPage
        country={selectedCountry}
        flag={flag}
        progress={getProgress(selectedCountry)}
        onBack={() => setSelectedCountry(null)}
        onScenarioStart={scenario => setActiveScenario(scenario)}
      />
    )
  }

  return (
    <LandingPage
      tokens={tokens}
      unlockedCountries={unlockedCountries}
      glowCountry={glowCountry}
      progressByCountry={progressByCountry}
      level={level}
      rank={rank}
      auth={profile}
      onUnlockCountry={handleUnlockCountry}
      onCountrySelect={handleSelectCountry}
    />
  )
}

export default App

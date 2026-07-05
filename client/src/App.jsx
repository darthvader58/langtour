import { useState, useEffect } from 'react'
import LandingPage from './LandingPage'
import ScenariosPage from './ScenariosPage'
import VoiceTestPage from './pages/VoiceTestPage'
import ScenarioRunner from './components/ScenarioRunner'
import CharacterStoryPopup from './CharacterStoryPopup'
import CompletionScreen from './CompletionScreen'
import AuthModal from './components/AuthModal'
import { API } from './api'
import { useProfile } from './hooks/useProfile'
import { COUNTRIES as LOCAL_COUNTRIES } from './gameData'
import UserProfileOverlay from './components/profile/UserProfileOverlay'
import { isFreshLangtourist, shouldShowArrivalStory } from './storyGate'

function App() {
  const profile = useProfile()
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [activeScenario, setActiveScenario] = useState(null)
  const [hash, setHash] = useState(window.location.hash)
  const [storySeen, setStorySeen] = useState([])
  // In-memory only (never localStorage): the server has no "seen intro" slot,
  // so this session flag is the one UI-only exception the story-mode ticket
  // allows. First-launch detection itself still comes from server profile
  // data (zero unlocks/completions), not from this flag.
  const [introDismissed, setIntroDismissed] = useState(false)
  const [completionCountry, setCompletionCountry] = useState(null)
  const [glowCountry, setGlowCountry] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    fetch(`${API}/api/catalog`)
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load game catalog')
        return res.json()
      })
      .then(setCatalog)
      .catch((error) => setCatalogError(error.message))
  }, [])

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hash === '#test') {
    return <VoiceTestPage />
  }

  if (catalogError) {
    return <div className="flex h-screen items-center justify-center bg-[#0F1418] text-red-200">{catalogError}</div>
  }

  if (!catalog || profile.authLoading) {
    return <div className="flex h-screen items-center justify-center bg-[#0F1418] text-white">Loading Langtour…</div>
  }

  if (!profile.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0F1418] text-white">
        <AuthModal
          loading={profile.authLoading}
          error={profile.authError}
          message={profile.authMessage}
          onGoogle={profile.signInWithGoogle}
          onEmailSignIn={profile.signInWithEmail}
          onEmailSignUp={profile.signUpWithEmail}
        />
      </div>
    )
  }

  const {
    characters,
    countries,
    scenariosByCountry,
    specialScenarioByCountry,
    rewardTokens,
    unlockCost,
  } = catalog

  const handleUnlockCountry = async (countryName, cost) => {
    const code = countryName.toLowerCase()
    const result = await profile.unlockCountry(code, cost)
    if (!result) return false
    setGlowCountry(countryName)
    return true
  }

  const scenarioIdsForCountry = (countryName) => {
    const regular = scenariosByCountry?.[countryName]?.map((s) => s.id) ?? []
    const special = specialScenarioByCountry?.[countryName]?.id
    return special ? [...regular, special] : regular
  }

  const showIntro = isFreshLangtourist(profile) && !introDismissed && !selectedCountry && !activeScenario && !completionCountry

  if (showIntro) {
    return (
      <CharacterStoryPopup
        mode="intro"
        onBeginMission={() => setIntroDismissed(true)}
      />
    )
  }

  if (completionCountry) {
    const code = countries.find((c) => c.name === completionCountry)?.code ?? 'us'
    return (
      <CompletionScreen
        country={completionCountry}
        code={code}
        character={characters[completionCountry]}
        rewardTokens={rewardTokens}
        onReturn={async () => {
          const code = completionCountry.toLowerCase()
          setCompletionCountry(null);
          setSelectedCountry(null);
          await profile.claimCountryReward(code)
        }}
      />
    )
  }

  if (activeScenario) {
    const langCode = LOCAL_COUNTRIES.find((c) => c.name === selectedCountry)?.langCode || 'zh'
    return (
      <ScenarioRunner
        scenario={activeScenario}
        langCode={langCode}
        country={selectedCountry}
        isAdmin={profile.isAdmin}
        onEndScenario={async (result) => {
          // Completion is already recorded server-side (inside /api/scenario/evaluate
          // after an evaluator pass, or the admin skip); just refresh our view.
          if (result?.completed && result?.id && !profile.completedScenarios.includes(result.id) && selectedCountry) {
            await profile.reloadGameState()
          }
          setActiveScenario(null);

          if (selectedCountry) {
            const allIds = scenarioIdsForCountry(selectedCountry)
            const completedAfter = result?.completed && result?.id
              ? [...profile.completedScenarios, result.id]
              : profile.completedScenarios
            if (allIds.length > 0 && allIds.every(id => completedAfter.includes(id))) {
              setCompletionCountry(selectedCountry);
            }
          }
        }}
      />
    )
  }

  if (shouldShowArrivalStory({
    country: selectedCountry,
    storySeen,
    completedScenarios: profile.completedScenarios,
    scenarioIdsForCountry: selectedCountry ? scenarioIdsForCountry(selectedCountry) : [],
  })) {
    return (
      <CharacterStoryPopup
        mode="arrival"
        country={selectedCountry}
        character={characters[selectedCountry]}
        onBeginMission={() => setStorySeen([...storySeen, selectedCountry])}
      />
    )
  }

  if (selectedCountry) {
    const code = countries.find((c) => c.name === selectedCountry)?.code ?? 'us'
    return (
      <ScenariosPage
        country={selectedCountry}
        code={code}
        completedScenarios={profile.completedScenarios}
        scenarios={scenariosByCountry[selectedCountry] ?? []}
        specialScenario={specialScenarioByCountry[selectedCountry] ?? null}
        onBack={() => setSelectedCountry(null)}
        onScenarioStart={(scenario) => setActiveScenario(scenario)}
      />
    )
  }

  return (
    <>
      <LandingPage
        tokens={profile.tokens}
        unlockedCountries={profile.unlockedCountries}
        glowCountry={glowCountry}
        level={profile.level}
        rank={profile.rank}
        auth={profile}
        countries={countries}
        characters={characters}
        unlockCost={unlockCost}
        onUnlockCountry={handleUnlockCountry}
        onOpenProfile={() => setProfileOpen(true)}
        onCountrySelect={(country) => {
          setGlowCountry(current => current === country ? null : current);
          setSelectedCountry(country);
        }}
      />
      <UserProfileOverlay
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={profile.user}
        profile={profile.profile}
        tokens={profile.tokens}
        level={profile.level}
        rank={profile.rank}
        unlockedCountries={profile.unlockedCountries}
        completedScenarios={profile.completedScenarios}
      />
    </>
  )
}

export default App

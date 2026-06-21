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

function App() {
  const profile = useProfile()
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [activeScenario, setActiveScenario] = useState(null)
  const [hash, setHash] = useState(window.location.hash)
  const [storySeen, setStorySeen] = useState([])
  const [completionCountry, setCompletionCountry] = useState(null)
  const [glowCountry, setGlowCountry] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')

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

  if (completionCountry) {
    const flag = countries.find((c) => c.name === completionCountry)?.flag ?? ''
    return (
      <CompletionScreen
        country={completionCountry}
        flag={flag}
        character={characters[completionCountry]}
        rewardTokens={rewardTokens}
        onReturn={async () => {
          setCompletionCountry(null);
          setSelectedCountry(null);
          await profile.awardTokens(rewardTokens)
        }}
      />
    )
  }

  if (activeScenario) {
    return (
      <ScenarioRunner
        scenario={activeScenario}
        onEndScenario={async (result) => {
          if (result?.completed && result?.id && !profile.completedScenarios.includes(result.id) && selectedCountry) {
            await profile.completeScenario(selectedCountry.toLowerCase(), result.id)
          }
          setActiveScenario(null);

          if (selectedCountry) {
            const allScenarios = scenariosByCountry[selectedCountry] || [];
            const allIds = allScenarios.map(s => s.id);
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

  if (selectedCountry && !storySeen.includes(selectedCountry)) {
    return (
      <CharacterStoryPopup
        country={selectedCountry}
        character={characters[selectedCountry]}
        onBeginMission={() => setStorySeen([...storySeen, selectedCountry])}
      />
    )
  }

  if (selectedCountry) {
    const flag = countries.find((c) => c.name === selectedCountry)?.flag ?? ''
    return (
      <ScenariosPage
        country={selectedCountry}
        flag={flag}
        completedScenarios={profile.completedScenarios}
        scenarios={scenariosByCountry[selectedCountry] ?? []}
        specialScenario={specialScenarioByCountry[selectedCountry] ?? null}
        onBack={() => setSelectedCountry(null)}
        onScenarioStart={(scenario) => setActiveScenario(scenario)}
      />
    )
  }

  return <LandingPage
           tokens={profile.tokens}
           unlockedCountries={profile.unlockedCountries}
           glowCountry={glowCountry}
           level={profile.level}
           rank={profile.rank}
           auth={profile}
           countries={countries}
           unlockCost={unlockCost}
           onUnlockCountry={handleUnlockCountry}
           onCountrySelect={(country) => {
             setGlowCountry(current => current === country ? null : current);
             setSelectedCountry(country);
           }}
         />
}

export default App

import { useState, useEffect, useMemo } from 'react'
import LandingPage from './LandingPage'
import ScenariosPage from './ScenariosPage'
import VoiceTestPage from './pages/VoiceTestPage'
import ScenarioRunner from './components/ScenarioRunner'
import CharacterStoryPopup from './CharacterStoryPopup'
import CompletionScreen from './CompletionScreen'
import { COUNTRIES, SCENARIOS_BY_COUNTRY, REWARD_TOKENS } from './gameData'
import { API } from './api'

function App() {
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [activeScenario, setActiveScenario] = useState(null)
  const [completedScenarios, setCompletedScenarios] = useState([])
  const [tokens, setTokens] = useState(0)
  const [unlockedCountries, setUnlockedCountries] = useState([])
  const [hash, setHash] = useState(window.location.hash)
  const [storySeen, setStorySeen] = useState([])
  const [completionCountry, setCompletionCountry] = useState(null)
  const [glowCountry, setGlowCountry] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/user/state`)
      .then(res => res.json())
      .then(data => {
        setTokens(data.tokens || 0);
        setUnlockedCountries(data.unlockedCountries || []);
        setCompletedScenarios(data.completedScenarios || []);
      })
      .catch(e => console.error(e));
  }, []);

  const handleSpendTokens = async (amount) => {
    try {
      await fetch(`${API}/api/user/spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      setTokens(prev => prev - amount);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  const handleUnlockCountry = async (countryName, cost) => {
    try {
      const res = await fetch(`${API}/api/user/unlock-country`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryName, cost })
      });
      const data = await res.json();
      if (data.success) {
        setTokens(data.tokens);
        setUnlockedCountries(data.unlockedCountries);
        setGlowCountry(countryName);
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

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

  if (completionCountry) {
    const flag = COUNTRIES.find((c) => c.name === completionCountry)?.flag ?? ''
    return (
      <CompletionScreen
        country={completionCountry}
        flag={flag}
        onReturn={async () => {
          setCompletionCountry(null);
          setSelectedCountry(null);
          try {
            const res = await fetch(`${API}/api/user/earn`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: REWARD_TOKENS })
            });
            const data = await res.json();
            if (data.success) setTokens(data.tokens);
          } catch (e) {
            console.error(e);
          }
        }}
      />
    )
  }

  if (activeScenario) {
    return (
      <ScenarioRunner 
        scenario={activeScenario}
        onEndScenario={async (result) => {
          let updatedCompleted = completedScenarios;
          if (result?.completed && result?.id && !completedScenarios.includes(result.id)) {
            updatedCompleted = [...completedScenarios, result.id];
            setCompletedScenarios(updatedCompleted);
            try {
              await fetch(`${API}/api/user/complete-scenario`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenarioId: result.id })
              });
            } catch (e) {
              console.error(e);
            }
          }
          setActiveScenario(null);

          if (selectedCountry) {
            const allScenarios = SCENARIOS_BY_COUNTRY[selectedCountry] || [];
            const allIds = allScenarios.map(s => s.id);
            if (allIds.length > 0 && allIds.every(id => updatedCompleted.includes(id))) {
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
        onBeginMission={() => setStorySeen([...storySeen, selectedCountry])}
      />
    )
  }

  if (selectedCountry) {
    const flag = COUNTRIES.find(c => c.name === selectedCountry)?.flag ?? ''
    return (
      <ScenariosPage
        country={selectedCountry}
        flag={flag}
        completedScenarios={completedScenarios}
        onBack={() => setSelectedCountry(null)}
        onScenarioStart={scenario => setActiveScenario(scenario)}
      />
    )
  }

  return <LandingPage 
           tokens={tokens} 
           unlockedCountries={unlockedCountries}
           glowCountry={glowCountry}
           onUnlockCountry={handleUnlockCountry} 
           onCountrySelect={(country) => {
             setGlowCountry(current => current === country ? null : current);
             setSelectedCountry(country);
           }} 
         />
}

export default App

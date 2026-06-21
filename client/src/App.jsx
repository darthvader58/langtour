import { useState, useEffect } from 'react'
import LandingPage from './LandingPage'
import ScenariosPage from './ScenariosPage'
import VoiceTestPage from './pages/VoiceTestPage'
import InputPhase from './components/InputPhase'
import GameplayPhase from './components/GameplayPhase'
import { API } from './api'

function App() {
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [activeScenario, setActiveScenario] = useState(null)
  const [inputPhaseComplete, setInputPhaseComplete] = useState(false)
  const [completedScenarios, setCompletedScenarios] = useState([])
  const [tokens, setTokens] = useState(0)
  const [unlockedCountries, setUnlockedCountries] = useState([])
  const [hash, setHash] = useState(window.location.hash)

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
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hash === '#test') {
    return <VoiceTestPage />
  }

  if (activeScenario) {
    if (!inputPhaseComplete) {
      return (
        <div className="w-screen h-screen flex flex-col items-center justify-center gap-4 bg-[#0F1418] text-white font-sans animate-fade-in-up">
          <InputPhase 
            scenario={activeScenario} 
            onComplete={() => setInputPhaseComplete(true)} 
          />
        </div>
      )
    }

    return (
      <div className="w-screen h-screen bg-[#0F1418] font-sans">
        <GameplayPhase 
          scenario={activeScenario}
          onEndScenario={async (result) => {
            if (result?.completed && result?.id && !completedScenarios.includes(result.id)) {
              setCompletedScenarios([...completedScenarios, result.id]);
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
            setInputPhaseComplete(false);
          }}
        />
      </div>
    )
  }

  if (selectedCountry) {
    return (
      <ScenariosPage
        country={selectedCountry}
        completedScenarios={completedScenarios}
        onBack={() => setSelectedCountry(null)}
        onScenarioStart={(scenario) => setActiveScenario(scenario)}
      />
    )
  }

  return <LandingPage 
           tokens={tokens} 
           unlockedCountries={unlockedCountries}
           onUnlockCountry={handleUnlockCountry} 
           onCountrySelect={(country) => setSelectedCountry(country)} 
         />
}

export default App

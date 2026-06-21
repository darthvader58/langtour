import { useState, useEffect } from 'react';
import { authFetch } from '../api';
import VisualCluster from './VisualCluster';
import InputPhase from './InputPhase';
import GameplayPhase from './GameplayPhase';
import { getCountryThemeStyle } from '../countryTheme';

export default function ScenarioRunner({ scenario, langCode, country, onEndScenario }) {
  const [phase, setPhase] = useState('loading'); // loading -> input -> gameplay
  const [targetWords, setTargetWords] = useState([]);

  useEffect(() => {
    // Fetch optimal dynamic vocabulary using the established backend flow.
    authFetch(`/api/scenario/discovery?scenarioId=${scenario.id}&topic=${scenario.title}&langCode=${langCode}`)
      .then(res => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(data => {
        if (!data.words) throw new Error("No words returned");
        setTargetWords(data.words);
        setTimeout(() => setPhase('input'), 2000);
      })
      .catch(err => {
        console.error("Discovery error", err);
        setTargetWords(scenario.vocab.slice(0, 4));
        setPhase('input');
      });
  }, [scenario]);

  if (phase === 'loading') {
    return <VisualCluster targetWords={targetWords} country={country} />;
  }

  if (phase === 'input') {
    return (
      <div style={getCountryThemeStyle(country)} className="flex min-h-dvh w-screen flex-col items-center justify-center gap-4 overflow-y-auto bg-[#07101d] bg-[linear-gradient(rgba(91,135,170,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.055)_1px,transparent_1px)] bg-[size:72px_72px] p-3 text-white font-display animate-fade-in-up sm:p-6">
        <InputPhase words={targetWords} langCode={langCode} onComplete={() => setPhase('gameplay')} />
      </div>
    );
  }

  return (
    <div style={getCountryThemeStyle(country)} className="h-dvh w-screen overflow-hidden bg-[#07101d] bg-[linear-gradient(rgba(91,135,170,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.055)_1px,transparent_1px)] bg-[size:72px_72px] font-display">
      <GameplayPhase
        scenario={scenario}
        targetWords={targetWords}
        langCode={langCode}
        onEndScenario={onEndScenario}
      />
    </div>
  );
}

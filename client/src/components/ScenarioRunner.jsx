import { useState } from 'react';
import InputPhase from './InputPhase';
import GameplayPhase from './GameplayPhase';
import { getTheme } from '../dynamicTheme';

export default function ScenarioRunner({ scenario, langCode, country, onEndScenario }) {
  const [phase, setPhase] = useState('input'); // input -> gameplay
  const targetWords = scenario.targetWords || scenario.vocab.slice(0, 4);
  const theme = getTheme(country);

  if (phase === 'input') {
    return (
      <div className={`w-screen h-screen flex flex-col items-center justify-center gap-4 ${theme.bgApp} ${theme.textPrimary} ${theme.font} animate-fade-in-up`}>
        <InputPhase words={targetWords} langCode={langCode} country={country} onComplete={() => setPhase('gameplay')} />
      </div>
    );
  }

  return (
    <div className={`w-screen h-screen ${theme.bgApp} ${theme.font}`}>
      <GameplayPhase 
        scenario={scenario} 
        targetWords={targetWords} 
        langCode={langCode}
        country={country}
        onEndScenario={onEndScenario} 
      />
    </div>
  );
}

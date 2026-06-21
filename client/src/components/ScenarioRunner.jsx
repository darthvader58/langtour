import { useState, useEffect } from 'react';
import { API } from '../api';
import VisualCluster from './VisualCluster';
import InputPhase from './InputPhase';
import GameplayPhase from './GameplayPhase';

const PLAYGROUND_BG = 'radial-gradient(ellipse 90% 60% at 50% 0%, #1E2C5A 0%, #131D3B 60%, #0D1530 100%)'

export default function ScenarioRunner({ scenario, country = 'China', onEndScenario }) {
  const [phase, setPhase] = useState('loading'); // loading -> input -> gameplay
  const [targetWords, setTargetWords] = useState([]);

  useEffect(() => {
    // 1. Fetch optimal dynamic vocabulary for this scenario
    fetch(`${API}/api/scenario/discovery?scenarioId=${scenario.id}&topic=${scenario.title}`)
      .then(res => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(data => {
        if (!data.words) throw new Error("No words returned");
        setTargetWords(data.words);
        // Leave the visual cluster up for at least 3 seconds total for the animation
        setTimeout(() => setPhase('input'), 2000);
      })
      .catch(err => {
        console.error("Discovery error", err);
        // Fallback
        setTargetWords(scenario.vocab.slice(0, 4));
        setPhase('input');
      });
  }, [scenario]);

  if (phase === 'loading') {
    return <VisualCluster targetWords={targetWords} />;
  }

  if (phase === 'input') {
    return (
      <div
        className="w-screen h-screen flex flex-col items-center justify-center gap-4 text-white font-sans animate-fade-in-up"
        style={{ background: PLAYGROUND_BG }}
      >
        <InputPhase words={targetWords} country={country} onComplete={() => setPhase('gameplay')} />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen font-sans" style={{ background: PLAYGROUND_BG }}>
      <GameplayPhase
        scenario={scenario}
        country={country}
        targetWords={targetWords}
        onEndScenario={onEndScenario}
      />
    </div>
  );
}

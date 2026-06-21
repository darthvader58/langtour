import { useState, useEffect } from 'react';
import { authFetch } from '../api';
import VisualCluster from './VisualCluster';
import InputPhase from './InputPhase';
import GameplayPhase from './GameplayPhase';

export default function ScenarioRunner({ scenario, langCode, onEndScenario }) {
  const [phase, setPhase] = useState('loading'); // loading -> input -> gameplay
  const [targetWords, setTargetWords] = useState([]);

  useEffect(() => {
    // 1. Fetch optimal dynamic vocabulary for this scenario
    authFetch(`/api/scenario/discovery?scenarioId=${scenario.id}&topic=${scenario.title}&langCode=${langCode}`)
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
      <div className="w-screen h-screen flex flex-col items-center justify-center gap-4 bg-[#0F1418] text-white font-sans animate-fade-in-up">
        <InputPhase words={targetWords} langCode={langCode} onComplete={() => setPhase('gameplay')} />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#0F1418] font-sans">
      <GameplayPhase 
        scenario={scenario} 
        targetWords={targetWords} 
        langCode={langCode}
        onEndScenario={onEndScenario} 
      />
    </div>
  );
}

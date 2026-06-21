import { useState, useEffect } from 'react';
import MicrophoneRecorder from './MicrophoneRecorder';
import { authFetch } from '../api';
import { getTheme } from '../dynamicTheme';

export default function GameplayPhase({ scenario, targetWords, langCode, country, onEndScenario }) {
  const [state, setState] = useState('generating'); // generating, npc_turn, user_turn, evaluating, feedback, scenario_complete
  const [npcLine, setNpcLine] = useState(null);
  const [userResponse, setUserResponse] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [previousTurns, setPreviousTurns] = useState([]);
  const [turnsCompleted, setTurnsCompleted] = useState(0);
  const TOTAL_TURNS = 4;
  const theme = getTheme(country);

  useEffect(() => {
    if (state !== 'generating') return undefined;
    const controller = new AbortController();

    async function generateNpcLine() {
      try {
        const response = await authFetch(`/api/scenario/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioContext: scenario.title,
            targetWords,
            previousTurns,
            langCode
          }),
          signal: controller.signal
        });
        const data = await response.json();
        setNpcLine(data);
        setState('npc_turn');
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error(e);
        setNpcLine({ zh: "你好！你想买什么？", pinyin: "nǐ hǎo! nǐ xiǎng mǎi shénme?", en: "Hello! What would you like to buy?" });
        setState('npc_turn');
      }
    }

    generateNpcLine();
    return () => controller.abort();
  }, [previousTurns, scenario.title, state, targetWords]);

  const playNpcAudio = () => {
    if (!npcLine) return;
    const utterance = new SpeechSynthesisUtterance(npcLine.zh);
    const voiceLangs = { hi: 'hi-IN', fr: 'fr-FR', es: 'es-MX', zh: 'zh-CN' };
    utterance.lang = voiceLangs[langCode] || 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const handleRecordingComplete = async (transcript) => {
    setUserResponse(transcript);
    setState('evaluating');

    try {
      const response = await authFetch(`/api/scenario/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioContext: scenario.title,
          targetWords,
          npcLine,
          userResponse: transcript,
          langCode
        }),
      });
      const result = await response.json();
      setFeedback(result);
      setState('feedback');
    } catch (e) {
      console.error(e);
      setFeedback({ status: 'failed', feedback: 'Network error evaluating response. Please try again.' });
      setState('feedback');
    }
  };

  const handleNextTurn = () => {
    if (feedback?.status === 'passed') {
      const newTurns = turnsCompleted + 1;
      setTurnsCompleted(newTurns);
      if (newTurns >= TOTAL_TURNS) {
        setState('scenario_complete');
      } else {
        setPreviousTurns([...previousTurns, { speaker: 'NPC', text: npcLine.zh }, { speaker: 'User', text: userResponse }]);
        setState('generating');
      }
    } else {
      setState('user_turn'); // Retry
    }
  };

  const handleDevSkip = () => {
    const newTurns = turnsCompleted + 1;
    setTurnsCompleted(newTurns);
    if (newTurns >= TOTAL_TURNS) {
      setState('scenario_complete');
    } else {
      setPreviousTurns([...previousTurns, { speaker: 'NPC', text: npcLine?.zh || 'Skipped' }, { speaker: 'User', text: '(Dev Skip)' }]);
      setState('generating');
    }
  };

  return (
    <div className={`flex flex-col h-full w-full max-w-lg mx-auto py-8 px-4 animate-fade-in-up ${theme.bgApp} ${theme.textPrimary}`}>
      {/* Header */}
      <div className="flex flex-col mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className={`${theme.font} font-extrabold text-2xl ${theme.textPrimary} flex items-center gap-2`}>
            <span>{scenario.icon}</span> {scenario.title}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDevSkip}
              title="Dev Skip Turn"
              className={`flex h-[46px] w-[46px] items-center justify-center rounded-2xl border-2 ${theme.border} ${theme.bgPanel} ${theme.textSecondary} transition-all hover:${theme.borderAccent} hover:bg-black/20 hover:${theme.textAccent}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            </button>
            <button
              onClick={() => onEndScenario()}
              className={`flex h-[46px] items-center justify-center rounded-2xl border-2 ${theme.border} ${theme.bgPanel} px-4 ${theme.font} text-sm font-extrabold uppercase tracking-widest ${theme.textSecondary} transition-all hover:bg-black/20 hover:${theme.textPrimary} shadow-md`}
            >
              Quit
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className={`w-full h-3 ${theme.bgPanel} rounded-full overflow-hidden border-2 ${theme.border}`}>
          <div
            className={`h-full ${theme.bgAccent} transition-all duration-500 ease-out`}
            style={{ width: `${(turnsCompleted / TOTAL_TURNS) * 100}%` }}
          />
        </div>
      </div>

      {/* Target Words Indicator */}
      {state !== 'scenario_complete' && (
        <div className="flex gap-2 mb-8 flex-wrap">
          {targetWords.map(w => (
            <div key={w.en} className={`px-3 py-1 rounded-lg text-xs font-bold border-2 ${feedback?.status === 'passed' && feedback.usedWord === w.expression ? `${theme.bgAccentMuted} ${theme.borderAccent} ${theme.textAccent}` : `${theme.bgPanel} ${theme.border} ${theme.textSecondary}`}`}>
              {w.zh}
            </div>
          ))}
        </div>
      )}

      {/* Main Conversation Area */}
      {state !== 'scenario_complete' && (
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto mb-6">

          {/* NPC Bubble */}
          {(state === 'npc_turn' || state === 'user_turn' || state === 'evaluating' || state === 'feedback') && npcLine && (
            <div className="flex gap-4 self-start max-w-[85%]">
              <div className={`w-10 h-10 rounded-full ${theme.bgAccentFaded} flex items-center justify-center shrink-0`}>
                <span className="text-xl">👤</span>
              </div>
              <div className={`${theme.bgPanel} border-2 ${theme.border} rounded-2xl rounded-tl-sm p-4 pr-12 relative flex flex-col gap-1 shadow-md`}>
                <button
                  onClick={playNpcAudio}
                  className={`absolute right-3 top-3 w-8 h-8 ${theme.bgAccent} rounded-full flex items-center justify-center ${theme.textPrimary} shadow-md ${theme.bgAccentHover} active:scale-95 cursor-pointer z-10`}
                >
                  <svg className="w-4 h-4 ml-0.5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                </button>
                <span className={`${theme.font} font-extrabold text-2xl ${theme.textPrimary}`}>{npcLine.zh}</span>
                <span className={`font-bold ${theme.textAccent} text-sm`}>{npcLine.pinyin}</span>
                <span className={`${theme.textSecondary} font-medium mt-1`}>{npcLine.en}</span>
              </div>
            </div>
          )}

          {/* Loading Generator */}
          {state === 'generating' && (
            <div className="flex gap-4 self-start max-w-[85%]">
              <div className={`w-10 h-10 rounded-full ${theme.bgAccentFaded} flex items-center justify-center shrink-0`}>
                <span className="text-xl">👤</span>
              </div>
              <div className={`${theme.bgPanel} border-2 ${theme.border} rounded-2xl rounded-tl-sm p-4 flex items-center gap-2`}>
                <div className={`w-2 h-2 rounded-full ${theme.bgAccent} animate-bounce`}></div>
                <div className={`w-2 h-2 rounded-full ${theme.bgAccent} animate-bounce`} style={{ animationDelay: '0.2s' }}></div>
                <div className={`w-2 h-2 rounded-full ${theme.bgAccent} animate-bounce`} style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}

          {/* User Bubble (When transcript exists) */}
          {(state === 'evaluating' || state === 'feedback') && userResponse && (
            <div className="flex gap-4 self-end max-w-[85%] flex-row-reverse mt-2">
              <div className={`${theme.bgAccent} rounded-2xl rounded-tr-sm p-4 ${theme.textPrimary} shadow-md`}>
                <span className={`${theme.font} font-bold text-xl`}>{userResponse}</span>
              </div>
            </div>
          )}

          {state === 'evaluating' && (
            <div className={`text-center text-sm font-bold ${theme.textSecondary} animate-pulse mt-4`}>
              Evaluating response...
            </div>
          )}

          {/* Feedback Banner */}
          {state === 'feedback' && feedback && (
            <div className={`mt-4 p-5 rounded-2xl border-2 \${feedback.status === 'passed' ? \`\${theme.bgAccentMuted} \${theme.borderAccent}\` : 'bg-[#FF4B4B]/10 border-[#FF4B4B]'}`}>
              <h3 className={`\${theme.font} font-extrabold text-xl mb-2 \${feedback.status === 'passed' ? theme.textAccent : 'text-[#FF4B4B]'}`}>
                {feedback.status === 'passed' ? 'Excellent!' : 'Not quite right'}
              </h3>
              <p className={`${theme.textPrimary} opacity-90 font-medium`}>{feedback.feedback}</p>
              {feedback.status === 'passed' && feedback.usedWord && (
                <p className={`mt-2 text-sm ${theme.textAccent} font-bold`}>✓ FSRS updated for "{feedback.usedWord}"</p>
              )}
              <button
                onClick={handleNextTurn}
                className={`mt-4 w-full py-3 rounded-xl \${theme.font} font-extrabold uppercase tracking-widest \${theme.textPrimary} transition-colors \${feedback.status === 'passed' ? \`\${theme.bgAccent} \${theme.bgAccentHover}\` : 'bg-[#FF4B4B] hover:bg-[#FF5555]'}`}
              >
                {feedback.status === 'passed' ? 'Continue Scenario' : 'Try Again'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer / Input Area */}
      {state === 'npc_turn' && (
        <button
          onClick={() => setState('user_turn')}
          className={`w-full py-4 rounded-2xl ${theme.bgAccent} ${theme.bgAccentHover} border-2 ${theme.borderAccent} border-b-4 active:border-b-2 active:translate-y-0.5 transition-all ${theme.textPrimary} ${theme.font} font-extrabold uppercase tracking-wide text-lg`}
        >
          Tap to Reply
        </button>
      )}

      {state === 'user_turn' && (
        <MicrophoneRecorder langCode={langCode} onRecordingComplete={handleRecordingComplete} />
      )}

      {/* Win Screen */}
      {state === 'scenario_complete' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in-up text-center">
          <div className={`w-24 h-24 ${theme.bgAccentMuted} rounded-full flex items-center justify-center text-6xl mb-6 ${theme.shadowGlow}`}>
            🏆
          </div>
          <h2 className={`${theme.font} font-extrabold text-3xl ${theme.textPrimary} mb-2`}>Scenario Complete!</h2>
          <p className={`${theme.textSecondary} font-medium mb-8`}>You successfully mastered 4 new words in conversation.</p>
          <button
            onClick={() => onEndScenario({ completed: true, id: scenario.id })}
            className={`w-full py-4 rounded-2xl ${theme.bgAccent} ${theme.bgAccentHover} border-2 ${theme.borderAccent} border-b-4 active:border-b-2 active:translate-y-0.5 transition-all ${theme.textPrimary} ${theme.font} font-extrabold uppercase tracking-wide text-lg`}
          >
            Return to Map
          </button>
        </div>
      )}

    </div>
  );
}

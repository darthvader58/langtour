import { useState, useEffect } from 'react';
import MicrophoneRecorder from './MicrophoneRecorder';
import { authFetch } from '../api';
import ToyIcon from './ToyIcon';

export default function GameplayPhase({ scenario, targetWords, langCode, onEndScenario }) {
  const [state, setState] = useState('generating'); // generating, npc_turn, user_turn, evaluating, feedback, scenario_complete
  const [npcLine, setNpcLine] = useState(null);
  const [userResponse, setUserResponse] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [previousTurns, setPreviousTurns] = useState([]);
  const [turnsCompleted, setTurnsCompleted] = useState(0);
  const TOTAL_TURNS = 4;

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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-3 py-3 animate-fade-in-up sm:px-5 sm:py-6 [@media(max-height:650px)]:py-2">
      {/* Header */}
      <div className="mb-3 flex flex-col rounded-[1.3rem] border border-white/10 bg-[#0b1727]/90 p-3 shadow-[0_18px_55px_rgba(0,0,0,.28)] backdrop-blur-xl sm:mb-5 sm:rounded-[1.6rem] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
          <h2 className="flex min-w-0 items-center gap-2 font-display text-lg font-extrabold text-white sm:text-2xl">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-25)] bg-[#07101d] text-xl sm:h-11 sm:w-11 sm:text-2xl">{scenario.icon}</span><span className="truncate">{scenario.title}</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDevSkip}
              title="Dev Skip Turn"
              className="hidden h-[42px] w-[42px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-500 transition-all hover:bg-white/[0.07] hover:text-[var(--accent-soft)] sm:flex"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            </button>
            <button
              onClick={() => onEndScenario()}
              className="flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-3 font-display text-[10px] font-extrabold uppercase tracking-wider text-slate-500 transition-all hover:bg-white/[0.07] hover:text-white sm:h-[42px] sm:px-4 sm:text-xs sm:tracking-widest"
            >
              Quit
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/[.06] bg-[#07101d]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out"
            style={{ width: `${(turnsCompleted / TOTAL_TURNS) * 100}%` }}
          />
        </div>
      </div>

      {/* Target Words Indicator */}
      {state !== 'scenario_complete' && (
        <div className="mb-3 flex flex-wrap gap-1.5 px-1 sm:mb-5 sm:gap-2">
          {targetWords.map((w, index) => (
            <div key={`${w.expression ?? w.zh}-${index}`} className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${feedback?.status === 'passed' && feedback.usedWord === w.expression ? 'bg-[var(--accent-15)] border-[var(--accent-40)] text-[var(--accent-soft)]' : 'bg-[#0b1727] border-white/10 text-slate-400'}`}>
              {w.zh}
            </div>
          ))}
        </div>
      )}

      {/* Main Conversation Area */}
      {state !== 'scenario_complete' && (
        <div className="mb-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-[1.4rem] border border-white/[.08] bg-[#081422]/78 p-3 shadow-inner sm:mb-5 sm:gap-6 sm:rounded-[1.75rem] sm:p-5">

          {/* NPC Bubble */}
          {(state === 'npc_turn' || state === 'user_turn' || state === 'evaluating' || state === 'feedback') && npcLine && (
            <div className="flex max-w-[96%] gap-2.5 self-start sm:max-w-[85%] sm:gap-4">
              <div className="w-11 h-11 rounded-xl border border-[#52b9db]/20 bg-[#52b9db]/10 flex items-center justify-center shrink-0">
                <ToyIcon name="person" size={23} className="text-[#52b9db]" />
              </div>
              <div className="relative flex flex-col gap-1 rounded-2xl rounded-tl-sm border border-white/10 bg-[#102239] p-4 pr-12 shadow-md">
                <button
                  onClick={playNpcAudio}
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#52b9db]/25 bg-[#52b9db]/15 text-[#7fd5ef] shadow-md hover:bg-[#52b9db]/25 active:scale-95"
                >
                  <svg className="w-4 h-4 ml-0.5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                </button>
                <span className="font-display text-xl font-extrabold text-white sm:text-2xl">{npcLine.zh}</span>
                <span className="font-bold text-[#52b9db] text-sm">{npcLine.pinyin}</span>
                <span className="text-gray-400 font-medium mt-1">{npcLine.en}</span>
              </div>
            </div>
          )}

          {/* Loading Generator */}
          {state === 'generating' && (
            <div className="flex max-w-[96%] gap-2.5 self-start sm:max-w-[85%] sm:gap-4">
              <div className="w-11 h-11 rounded-xl border border-[#52b9db]/20 bg-[#52b9db]/10 flex items-center justify-center shrink-0">
                <ToyIcon name="person" size={23} className="text-[#52b9db]" />
              </div>
              <div className="bg-[#102239] border border-white/10 rounded-2xl rounded-tl-sm p-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}

          {/* User Bubble (When transcript exists) */}
          {(state === 'evaluating' || state === 'feedback') && userResponse && (
            <div className="mt-2 flex max-w-[92%] flex-row-reverse gap-3 self-end sm:max-w-[85%] sm:gap-4">
              <div className="rounded-2xl rounded-tr-sm border border-[var(--accent-30)] bg-[var(--accent)] p-4 text-[var(--accent-ink)] shadow-md">
                <span className="font-display font-extrabold text-xl">{userResponse}</span>
              </div>
            </div>
          )}

          {state === 'evaluating' && (
            <div className="text-center text-sm font-bold text-gray-400 animate-pulse mt-4">
              Evaluating response...
            </div>
          )}

          {/* Feedback Banner */}
          {state === 'feedback' && feedback && (
            <div className={`mt-4 rounded-2xl border p-5 ${feedback.status === 'passed' ? 'bg-[var(--accent-10)] border-[var(--accent-30)]' : 'bg-[#FF4B4B]/10 border-[#FF4B4B]/40'}`}>
              <h3 className={`font-display font-extrabold text-xl mb-2 ${feedback.status === 'passed' ? 'text-[var(--accent-soft)]' : 'text-[#FF6B6B]'}`}>
                {feedback.status === 'passed' ? 'Excellent!' : 'Not quite right'}
              </h3>
              <p className="text-gray-300 font-medium">{feedback.feedback}</p>
              {feedback.status === 'passed' && feedback.usedWord && (
                <p className="mt-2 text-sm text-[var(--accent-soft)] font-bold">Mastered: “{feedback.usedWord}”</p>
              )}
              <button
                onClick={handleNextTurn}
                className={`mt-4 w-full py-3 rounded-xl font-display font-extrabold uppercase tracking-widest transition-all ${feedback.status === 'passed' ? 'bg-[var(--accent)] hover:brightness-110 text-[var(--accent-ink)]' : 'bg-[#FF4B4B] hover:bg-[#FF5555] text-white'}`}
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
          className="w-full rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] py-4 font-display text-base font-extrabold uppercase tracking-widest text-[var(--accent-ink)] transition-all hover:brightness-110 active:translate-y-0.5"
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
          <div className="w-24 h-24 bg-[#FFC800]/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(255,200,0,0.4)] text-[#FFC800]">
            <ToyIcon name="trophy" size={55} />
          </div>
          <h2 className="font-display font-extrabold text-3xl text-white mb-2">Scenario Complete!</h2>
          <p className="text-gray-400 font-medium mb-8">You successfully mastered 4 new words in conversation.</p>
          <button
            onClick={() => onEndScenario({ completed: true, id: scenario.id })}
            className="w-full rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] py-4 font-display text-base font-extrabold uppercase tracking-widest text-[var(--accent-ink)] transition-all hover:brightness-110 active:translate-y-0.5"
          >
            Return to Map
          </button>
        </div>
      )}

    </div>
  );
}

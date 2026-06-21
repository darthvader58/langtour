import React, { useState, useEffect } from 'react';
import MicrophoneRecorder from './MicrophoneRecorder';
import PronunciationScore from './PronunciationScore';
import { AGENT_AVATARS } from '../gameData';
import { API } from '../api';

export default function GameplayPhase({ scenario, country = 'China', targetWords, onEndScenario }) {
  const [state, setState] = useState('generating'); // generating, npc_turn, user_turn, evaluating, feedback, scenario_complete
  const [npcLine, setNpcLine] = useState(null);
  const [userResponse, setUserResponse] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [previousTurns, setPreviousTurns] = useState([]);
  const [turnsCompleted, setTurnsCompleted] = useState(0);
  const TOTAL_TURNS = 4;

  const avatar = AGENT_AVATARS[country];

  useEffect(() => {
    if (state === 'generating') {
      const controller = new AbortController();
      generateNpcLine(controller.signal);
      return () => controller.abort();
    }
  }, [state]);

  const generateNpcLine = async (signal) => {
    try {
      const response = await fetch(`${API}/api/scenario/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioContext: scenario.title,
          targetWords,
          previousTurns
        }),
        signal
      });
      const data = await response.json();
      setNpcLine(data);
      setState('npc_turn');
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error(e);
      // Fallback in case of error
      setNpcLine({ zh: "你好！你想买什么？", pinyin: "nǐ hǎo! nǐ xiǎng mǎi shénme?", en: "Hello! What would you like to buy?" });
      setState('npc_turn');
    }
  };

  const playNpcAudio = () => {
    if (!npcLine) return;
    const utterance = new SpeechSynthesisUtterance(npcLine.zh);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const handleRecordingComplete = async (transcript) => {
    setUserResponse(transcript);
    setState('evaluating');

    try {
      const response = await fetch(`${API}/api/scenario/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioContext: scenario.title,
          targetWords,
          npcLine,
          userResponse: transcript
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

  const NpcAvatar = () => (
    <div className="w-12 h-12 rounded-2xl bg-white border-4 border-slate-200 flex items-center justify-center shrink-0 shadow-[0_3px_0_0_rgba(203,213,225,1)] overflow-hidden">
      {avatar ? (
        <img src={avatar} alt={`${country} guide`} className="w-10 h-10" />
      ) : (
        <span className="text-xl">👤</span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full max-w-lg mx-auto py-8 px-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-black text-2xl text-white flex items-center gap-2">
            <span>{scenario.icon}</span> {scenario.title}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDevSkip}
              title="Dev Skip Turn"
              className="text-sky-200/70 font-bold text-sm bg-[#22305C] px-3 py-1.5 rounded-2xl border-4 border-[#34457C] hover:text-[#1CB0F6] hover:-translate-y-0.5 transition-all flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            </button>
            <button
              onClick={() => onEndScenario()}
              className="text-sky-200/70 font-display font-extrabold text-sm bg-[#22305C] px-4 py-1.5 rounded-2xl border-4 border-[#34457C] hover:text-white hover:-translate-y-0.5 transition-all"
            >
              Quit
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-4 bg-[#15203F] rounded-full overflow-hidden border-4 border-[#34457C]">
          <div
            className="h-full bg-[#58CC02] transition-all duration-500 ease-out"
            style={{ width: `${(turnsCompleted / TOTAL_TURNS) * 100}%` }}
          />
        </div>
      </div>

      {/* Target Words Indicator */}
      {state !== 'scenario_complete' && (
        <div className="flex gap-2 mb-8 flex-wrap">
          {targetWords.map(w => (
            <div key={w.en} className={`px-3 py-1.5 rounded-xl text-sm font-display font-black border-[3px] transition-colors ${feedback?.status === 'passed' && feedback.usedWord === w.expression ? 'bg-[#58CC02]/20 border-[#58CC02] text-[#7CE04F]' : 'bg-[#2C3A63] border-[#34457C] text-sky-200/70'}`}>
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
            <div className="flex gap-3 self-start max-w-[88%]">
              <NpcAvatar />
              <div className="bg-white border-4 border-slate-200 rounded-3xl rounded-tl-md p-4 pr-12 relative flex flex-col gap-1 shadow-[0_4px_0_0_rgba(203,213,225,1)]">
                <button
                  onClick={playNpcAudio}
                  className="absolute right-3 top-3 w-9 h-9 bg-[#1CB0F6] rounded-full flex items-center justify-center text-white shadow-md hover:bg-[#1899D6] active:scale-95 cursor-pointer z-10"
                >
                  <svg className="w-4 h-4 ml-0.5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                </button>
                <span className="font-display font-black text-2xl text-slate-800">{npcLine.zh}</span>
                <span className="font-display font-bold text-[#1CB0F6] text-sm">{npcLine.pinyin}</span>
                <span className="text-slate-500 font-semibold mt-1">{npcLine.en}</span>
              </div>
            </div>
          )}

          {/* Loading Generator */}
          {state === 'generating' && (
            <div className="flex gap-3 self-start max-w-[88%]">
              <NpcAvatar />
              <div className="bg-white border-4 border-slate-200 rounded-3xl rounded-tl-md p-5 flex items-center gap-2 shadow-[0_4px_0_0_rgba(203,213,225,1)]">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300 animate-bounce"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}

          {/* User Bubble (When transcript exists) */}
          {(state === 'evaluating' || state === 'feedback') && userResponse && (
            <div className="flex gap-3 self-end max-w-[88%] flex-row-reverse mt-2">
              <div className="bg-[#1CB0F6] border-4 border-[#1899D6] rounded-3xl rounded-tr-md p-4 text-white shadow-[0_4px_0_0_#1474AA]">
                <span className="font-display font-black text-xl">{userResponse}</span>
              </div>
            </div>
          )}

          {state === 'evaluating' && (
            <div className="text-center text-sm font-display font-bold text-sky-200/70 animate-pulse mt-4">
              Checking your answer…
            </div>
          )}

          {/* Feedback — friendly pronunciation score card */}
          {state === 'feedback' && feedback && (() => {
            const passed = feedback.status === 'passed';
            const score = passed ? (feedback.usedWord ? 92 : 80) : 45;
            return (
              <div className="mt-4 p-6 rounded-[2rem] bg-white border-4 border-slate-300 shadow-[0_8px_0_0_rgba(200,200,200,1)]">
                <PronunciationScore score={score} feedback={feedback.feedback} />
                {passed && feedback.usedWord && (
                  <p className="mt-3 text-center font-display text-xs font-extrabold text-[#58CC02]">
                    ⭐ Nice! You used "{feedback.usedWord}"
                  </p>
                )}
                <button
                  onClick={handleNextTurn}
                  className={
                    'mt-5 w-full py-3.5 rounded-2xl font-display font-black uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 active:translate-y-0.5 ' +
                    (passed
                      ? 'bg-[#58CC02] border-4 border-[#46A302] shadow-[0_5px_0_0_#3E8E00] active:shadow-[0_2px_0_0_#3E8E00]'
                      : 'bg-[#FF9600] border-4 border-[#E07F00] shadow-[0_5px_0_0_#B86700] active:shadow-[0_2px_0_0_#B86700]')
                  }
                >
                  {passed ? 'Continue →' : 'Try Again'}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Footer / Input Area */}
      {state === 'npc_turn' && (
        <button
          onClick={() => setState('user_turn')}
          className="w-full py-4 rounded-2xl bg-[#1CB0F6] text-white border-4 border-[#1899D6] font-display font-black uppercase tracking-wide text-lg shadow-[0_5px_0_0_#1474AA] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_#1474AA] transition-all"
        >
          🎤 Tap to Reply
        </button>
      )}

      {state === 'user_turn' && (
        <MicrophoneRecorder onRecordingComplete={handleRecordingComplete} />
      )}

      {/* Win Screen */}
      {state === 'scenario_complete' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in-up text-center">
          <div className="w-28 h-28 bg-[#FFC93C]/20 rounded-full flex items-center justify-center text-6xl mb-6 shadow-[0_0_40px_rgba(255,201,60,0.4)] animate-token-pulse">
            🏆
          </div>
          <h2 className="font-display font-black text-3xl text-white mb-2">Mission Complete!</h2>
          <p className="text-sky-200/70 font-display font-semibold mb-8">You mastered 4 new words in a real conversation. 🎉</p>
          <button
            onClick={() => onEndScenario({ completed: true, id: scenario.id })}
            className="w-full py-4 rounded-2xl bg-[#58CC02] text-white border-4 border-[#46A302] font-display font-black uppercase tracking-wide text-lg shadow-[0_5px_0_0_#3E8E00] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_#3E8E00] transition-all"
          >
            Back to Map →
          </button>
        </div>
      )}

    </div>
  );
}

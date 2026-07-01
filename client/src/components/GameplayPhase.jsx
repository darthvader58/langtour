import { useState, useEffect } from 'react';
import MicrophoneRecorder from './MicrophoneRecorder';
import { authFetch } from '../api';
import ToyIcon from './ToyIcon';
import { deriveProgress, detectNewWordIds, normalizeWord } from './gameplayProgress.js';

// Completion is driven entirely by `scenarioComplete: true` from the server
// evaluate response — there is no client-side turn counter.  The server
// policy (INITIAL_TARGET_SIZE=2, GROW_PER_ATTEST=2, ESSENTIAL_FRACTION=2/3)
// lives in node/lib/graph/growingTargetPolicy.js and is authoritative.

export default function GameplayPhase({ scenario, targetWords, langCode, country, onEndScenario }) {
  const [state, setState] = useState('generating'); // generating, npc_turn, user_turn, evaluating, feedback, scenario_complete
  const [npcLine, setNpcLine] = useState(null);
  const [userResponse, setUserResponse] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [previousTurns, setPreviousTurns] = useState([]);

  // Server-authoritative target word set.  Seeded from discovery words; updated
  // from evaluate response after every turn.  These are the UN-attested words
  // remaining in the current growth window.
  const [currentTargetWords, setCurrentTargetWords] = useState(targetWords);

  // IDs of words the player has attested in this session — for progress display
  // only.  Completion is decided by the server's `scenarioComplete`, never by
  // the size of this set.
  const [attestedWordIds, setAttestedWordIds] = useState(new Set());

  // IDs of words that entered the target window on the most recent grow event.
  // Cleared when the player continues to the next turn.
  const [newWordIds, setNewWordIds] = useState(new Set());

  // Derived progress — pure calculation, no I/O.
  const { attestedCount, windowSize, progressPct } = deriveProgress(
    attestedWordIds.size,
    currentTargetWords,
  );

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
            targetWords: currentTargetWords,
            previousTurns,
            langCode,
            // Send country + scenario so the server can compute the growing
            // target server-side and return an authoritative targetWords set.
            countryCode: country,
            scenarioId: scenario.id,
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
  }, [previousTurns, scenario.title, scenario.id, state, currentTargetWords, langCode, country]);

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
          targetWords: currentTargetWords,
          npcLine,
          userResponse: transcript,
          langCode,
          // Required for server to compute the growing-target state and return
          // the authoritative targetWords + scenarioComplete after this turn.
          countryCode: country,
          scenarioId: scenario.id,
        }),
      });
      const result = await response.json();

      // Track attested word IDs from the server-confirmed attestation list.
      // Display only — completion is driven by result.scenarioComplete.
      if (result.status === 'passed' && Array.isArray(result.usedWordIds) && result.usedWordIds.length > 0) {
        setAttestedWordIds((prev) => {
          const next = new Set(prev);
          result.usedWordIds.forEach((id) => next.add(id));
          return next;
        });
      }

      setFeedback(result);
      setState('feedback');
    } catch (e) {
      console.error(e);
      setFeedback({ status: 'failed', feedback: 'Network error evaluating response. Please try again.' });
      setState('feedback');
    }
  };

  const handleNextTurn = () => {
    if (feedback?.status === 'passed' && feedback?.scenarioComplete) {
      // Server confirmed: all essential words attested — scenario is done.
      setState('scenario_complete');
    } else if (feedback?.status === 'passed') {
      // Passed but not yet complete: update the target word set and detect
      // words that newly entered the window (grow event).
      const nextTargetWords = feedback.targetWords ?? currentTargetWords;
      const newIds = detectNewWordIds(currentTargetWords, nextTargetWords);

      setCurrentTargetWords(nextTargetWords);
      setNewWordIds(newIds);
      setPreviousTurns((prev) => [
        ...prev,
        { speaker: 'NPC', text: npcLine.zh },
        { speaker: 'User', text: userResponse },
      ]);
      setState('generating');
    } else {
      // Failed: update target words from server truth (no change expected),
      // clear any new-word highlights, and let the player retry.
      if (feedback?.targetWords) setCurrentTargetWords(feedback.targetWords);
      setNewWordIds(new Set());
      setState('user_turn');
    }
  };

  // Dev-only skip: advances the conversation without server evaluation.
  // Never triggers scenario_complete — use the quit button to exit during dev.
  // This button is hidden on mobile (sm:flex) so it never appears on real devices.
  const handleDevSkip = () => {
    setPreviousTurns((prev) => [
      ...prev,
      { speaker: 'NPC', text: npcLine?.zh || 'Skipped' },
      { speaker: 'User', text: '(Dev Skip)' },
    ]);
    setNewWordIds(new Set());
    setState('generating');
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

        {/* Progress bar — width is the server-derived attestedCount / windowSize ratio. */}
        <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/[.06] bg-[#07101d]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {/* Progress label — derived from server attestation state, not a fixed denominator. */}
        <div className="mt-1.5 flex items-center justify-end">
          <span className="text-[10px] font-bold tabular-nums text-slate-500">
            {attestedCount} of {windowSize} attested
          </span>
        </div>
      </div>

      {/* Target Words — server-authoritative growing set.
          Words in newWordIds just entered the window (grow event) and pulse briefly. */}
      {state !== 'scenario_complete' && (
        <div className="mb-3 flex flex-wrap gap-1.5 px-1 sm:mb-5 sm:gap-2">
          {currentTargetWords.map((w) => {
            const { expr, reading, meaning } = normalizeWord(w);
            const isNew = w.id != null && newWordIds.has(w.id);
            return (
              <div
                key={w.id ?? expr}
                className={`rounded-xl border px-3 py-2 text-xs transition-all ${
                  isNew
                    ? 'border-[var(--mastery-ui-learning-50)] bg-[var(--mastery-ui-learning-12)] text-[var(--mastery-ui-learning)] animate-pulse'
                    : 'border-white/10 bg-[#0b1727] text-slate-400'
                }`}
              >
                <span className="block font-extrabold text-sm leading-tight">{expr}</span>
                {reading && (
                  <span className="mt-0.5 block text-[10px] font-medium opacity-70">{reading}</span>
                )}
                {meaning && (
                  <span className="mt-0.5 block text-[10px] opacity-50">{meaning}</span>
                )}
              </div>
            );
          })}
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
                <p className="mt-2 text-sm text-[var(--accent-soft)] font-bold">Mastered: "{feedback.usedWord}"</p>
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

      {/* Win Screen — copy is dynamic: attestedWordIds.size not a hardcoded "4". */}
      {state === 'scenario_complete' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in-up text-center">
          <div className="w-24 h-24 bg-[#FFC800]/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(255,200,0,0.4)] text-[#FFC800]">
            <ToyIcon name="trophy" size={55} />
          </div>
          <h2 className="font-display font-extrabold text-3xl text-white mb-2">Scenario Complete!</h2>
          <p className="text-gray-400 font-medium mb-8">
            You successfully mastered {attestedWordIds.size} new word{attestedWordIds.size === 1 ? '' : 's'} in conversation.
          </p>
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

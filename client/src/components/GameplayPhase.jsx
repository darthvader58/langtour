import { useCallback, useState } from 'react';
import MicrophoneRecorder from './MicrophoneRecorder';
import { authFetch } from '../api';
import ToyIcon from './ToyIcon';
import { getSidekick } from '../storyData';
import { isWordUsed, newlyGrownWords, normalizeGrowth, progressPercent } from './growthModel';
import { wordKey, wordMeaning, wordText } from './wordDisplay';

const ERROR_KIND_LABEL = {
  'off-topic': 'Off topic',
  'too-vague': 'Too vague',
  'bare-word': 'Just a bare word',
  grammar: 'Grammar slip',
  'wrong-word': 'Wrong word',
  'wrong-register': 'Wrong register',
};

// Keep the context sent to the server lean (token-economy rule in CLAUDE.md) —
// the last few exchanges are enough for generateTurn/evaluateResponse to stay
// coherent without re-sending the whole conversation every turn.
const MAX_PRIOR_TURNS_SENT = 6;

function recentPriorTurns(priorTurns) {
  return priorTurns.slice(-MAX_PRIOR_TURNS_SENT);
}

// Turn state machine: npc_turn (line shown) -> user_turn (recording) ->
// evaluating -> feedback -> either generating (next turn) or scenario_complete.
// scenarioComplete only ever comes from the server's evaluate response
// (docs/contracts/ai-module.md) — nothing here marks a scenario done.
export default function GameplayPhase({ scenario, countryCode, langCode, firstTurn, isAdmin = false, onEndScenario }) {
  const [state, setState] = useState('npc_turn');
  const [scenarioId] = useState(firstTurn.scenarioId);
  const [npcLine, setNpcLine] = useState(firstTurn.npcLine);
  const [sidekickLine, setSidekickLine] = useState(firstTurn.sidekickLine);
  const [expectedIntent, setExpectedIntent] = useState(firstTurn.expectedIntent);
  const [targetWords, setTargetWords] = useState(firstTurn.targetWords);
  const [newWordIds, setNewWordIds] = useState(new Set());
  const [growth, setGrowth] = useState(normalizeGrowth(firstTurn.growth));
  const [userResponse, setUserResponse] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [priorTurns, setPriorTurns] = useState([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [genError, setGenError] = useState('');

  const sidekick = getSidekick(firstTurn.personaId);
  const title = scenario?.title ?? firstTurn.situation?.title ?? 'Scenario';
  const icon = scenario?.icon ?? '\u{1F5FA}\u{FE0F}';

  const fetchNextTurn = useCallback(async (turns, index) => {
    setState('generating');
    setGenError('');
    try {
      const response = await authFetch('/api/scenario/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode,
          scenarioId,
          priorTurns: recentPriorTurns(turns),
          turnIndex: index,
        }),
      });
      if (!response.ok) throw new Error('generate failed');
      const data = await response.json();
      setNewWordIds(new Set(newlyGrownWords(targetWords, data.targetWords).map((w) => w.id)));
      setNpcLine(data.npcLine);
      setSidekickLine(data.sidekickLine);
      setExpectedIntent(data.expectedIntent);
      setTargetWords(data.targetWords);
      setGrowth(normalizeGrowth(data.growth));
      setUserResponse('');
      setFeedback(null);
      setState('npc_turn');
    } catch (e) {
      console.error(e);
      setGenError('Could not reach the next line. Try again.');
      setState('gen_error');
    }
  }, [countryCode, scenarioId, targetWords]);

  const playNpcAudio = () => {
    if (!npcLine) return;
    const utterance = new SpeechSynthesisUtterance(npcLine.text);
    const voiceLangs = { hi: 'hi-IN', fr: 'fr-FR', es: 'es-MX', zh: 'zh-CN', ar: 'ar-SA', pt: 'pt-BR' };
    utterance.lang = voiceLangs[langCode] || 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const handleRecordingComplete = async (transcript) => {
    setUserResponse(transcript);
    setState('evaluating');

    try {
      const response = await authFetch('/api/scenario/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode,
          scenarioId,
          transcript,
          priorTurns: recentPriorTurns(priorTurns),
          turnIndex,
        }),
      });
      if (!response.ok) throw new Error('evaluate failed');
      const result = await response.json();
      setFeedback(result);
      setGrowth(normalizeGrowth(result.growth));
      setState('feedback');
    } catch (e) {
      console.error(e);
      setFeedback({
        pass: false,
        errorKind: null,
        teachingNote: 'Network error evaluating your response. Please try again.',
        sidekickLine: null,
        usedWords: [],
        scenarioComplete: false,
        growth,
      });
      setState('feedback');
    }
  };

  const handleNextTurn = () => {
    if (feedback?.scenarioComplete) {
      setState('scenario_complete');
      return;
    }
    if (feedback?.pass) {
      const turns = [
        ...priorTurns,
        { speaker: 'npc', text: npcLine.text },
        { speaker: 'user', text: userResponse },
      ];
      const nextIndex = turnIndex + 1;
      setPriorTurns(turns);
      setTurnIndex(nextIndex);
      fetchNextTurn(turns, nextIndex);
    } else {
      setState('user_turn'); // Retry the same NPC line.
    }
  };

  // Admin-only evaluator skip (server-enforced: /api/scenario/admin-complete
  // re-checks identity against ADMIN_EMAIL and records completion via the
  // service-role RPC). Rendered only for the admin; a non-admin who forced the
  // call still gets a 403.
  const handleAdminSkip = async () => {
    try {
      const response = await authFetch('/api/scenario/admin-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode, scenarioId }),
      });
      if (!response.ok) throw new Error('admin skip failed');
      onEndScenario({ completed: true, id: scenarioId });
    } catch (e) {
      console.error(e);
      setGenError('Admin skip failed.');
    }
  };

  const progress = progressPercent(growth);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-3 py-3 animate-fade-in-up sm:px-5 sm:py-6 [@media(max-height:650px)]:py-2">
      {/* Header */}
      <div className="mb-3 flex flex-col rounded-[1.3rem] border border-white/10 bg-[var(--surface-card)]/90 p-3 shadow-[0_18px_55px_rgba(0,0,0,.28)] backdrop-blur-xl sm:mb-5 sm:rounded-[1.6rem] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
          <h2 className="flex min-w-0 items-center gap-2 font-display text-lg font-extrabold text-white sm:text-2xl">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-25)] bg-[var(--surface-bg)] text-xl sm:h-11 sm:w-11 sm:text-2xl">{icon}</span><span className="truncate">{title}</span>
          </h2>
          <div className="flex items-center gap-2">
            {isAdmin && state !== 'scenario_complete' && (
              <button
                onClick={handleAdminSkip}
                title="Admin: skip evaluator and complete this scenario"
                className="flex h-9 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 font-display text-[10px] font-extrabold uppercase tracking-wider text-amber-300 transition-all hover:bg-amber-400/20 sm:h-[42px] sm:px-4 sm:text-xs sm:tracking-widest"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => onEndScenario()}
              className="flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-3 font-display text-[10px] font-extrabold uppercase tracking-wider text-slate-500 transition-all hover:bg-white/[0.07] hover:text-white sm:h-[42px] sm:px-4 sm:text-xs sm:tracking-widest"
            >
              Quit
            </button>
          </div>
        </div>

        {/* Progress Bar — driven by growth.usedWordIds/targetSize, not a fixed turn count */}
        <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/[.06] bg-[var(--surface-bg)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Target Words Indicator — grows mid-play; new words get a badge */}
      {state !== 'scenario_complete' && (
        <div className="mb-3 flex flex-wrap gap-1.5 px-1 sm:mb-5 sm:gap-2">
          {targetWords.map((w, index) => {
            const used = isWordUsed(w.id, growth);
            const isNew = newWordIds.has(w.id);
            return (
              <div
                key={wordKey(w, index)}
                className={
                  'relative rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ' +
                  (used
                    ? 'bg-[var(--accent-15)] border-[var(--accent-40)] text-[var(--accent-soft)]'
                    : 'bg-[var(--surface-card)] border-white/10 text-slate-400') +
                  (isNew ? ' animate-fade-in-up ring-2 ring-[var(--accent-40)]' : '')
                }
              >
                {isNew && (
                  <span className="absolute -top-2 -right-2 rounded-full border border-[var(--accent-30)] bg-[var(--accent)] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-[var(--accent-ink)]">New</span>
                )}
                {wordText(w)}
              </div>
            );
          })}
        </div>
      )}

      {/* Main Conversation Area */}
      {state !== 'scenario_complete' && (
        <div className="mb-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-[1.4rem] border border-white/[.08] bg-[var(--surface-bg)]/78 p-3 shadow-inner sm:mb-5 sm:gap-6 sm:rounded-[1.75rem] sm:p-5">

          {/* NPC Bubble */}
          {(state === 'npc_turn' || state === 'user_turn' || state === 'evaluating' || state === 'feedback') && npcLine && (
            <div className="flex max-w-[96%] gap-2.5 self-start sm:max-w-[85%] sm:gap-4">
              <div className="w-11 h-11 rounded-xl border border-[#52b9db]/20 bg-[#52b9db]/10 flex items-center justify-center shrink-0">
                <ToyIcon name="person" size={23} className="text-[#52b9db]" />
              </div>
              <div className="relative flex flex-col gap-1 rounded-2xl rounded-tl-sm border border-white/10 bg-[var(--surface-card)] p-4 pr-12 shadow-md">
                <button
                  onClick={playNpcAudio}
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#52b9db]/25 bg-[#52b9db]/15 text-[#7fd5ef] shadow-md hover:bg-[#52b9db]/25 active:scale-95"
                >
                  <svg className="w-4 h-4 ml-0.5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                </button>
                <span className="font-display text-xl font-extrabold text-white sm:text-2xl">{npcLine.text}</span>
                <span className="font-bold text-[#52b9db] text-sm">{npcLine.reading}</span>
                <span className="text-gray-400 font-medium mt-1">{npcLine.translation}</span>
              </div>
            </div>
          )}

          {/* Sidekick aside */}
          {state === 'npc_turn' && sidekickLine?.text && (
            <div className="flex max-w-[92%] items-start gap-2.5 self-start pl-2 sm:max-w-[80%]">
              <span
                className="h-8 w-8 shrink-0 rounded-full border border-[var(--accent-30)] bg-[image:var(--sidekick-portrait)] bg-cover bg-center"
                role="img"
                aria-label={`${sidekick?.name ?? 'Sidekick'} portrait`}
              />
              <div className="rounded-xl border border-[var(--accent-25)] bg-[var(--accent-10)] px-3 py-2">
                <p className="mb-0.5 font-display text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-soft)]">{sidekick?.name ?? 'Sidekick'}</p>
                <p className="text-xs font-medium italic text-slate-300">{sidekickLine.text}</p>
              </div>
            </div>
          )}

          {expectedIntent && (state === 'user_turn') && (
            <p className="px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">Aim: {expectedIntent}</p>
          )}

          {/* Loading Generator */}
          {state === 'generating' && (
            <div className="flex max-w-[96%] gap-2.5 self-start sm:max-w-[85%] sm:gap-4">
              <div className="w-11 h-11 rounded-xl border border-[#52b9db]/20 bg-[#52b9db]/10 flex items-center justify-center shrink-0">
                <ToyIcon name="person" size={23} className="text-[#52b9db]" />
              </div>
              <div className="bg-[var(--surface-card)] border border-white/10 rounded-2xl rounded-tl-sm p-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}

          {state === 'gen_error' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-sm font-medium text-slate-300">{genError}</p>
              <button
                type="button"
                onClick={() => fetchNextTurn(priorTurns, turnIndex)}
                className="rounded-xl border border-[var(--accent-30)] bg-[var(--accent)] px-5 py-2.5 font-display text-xs font-extrabold uppercase tracking-widest text-[var(--accent-ink)]"
              >
                Retry
              </button>
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
            <div className={`mt-4 rounded-2xl border p-5 ${feedback.pass ? 'bg-[var(--accent-10)] border-[var(--accent-30)]' : 'bg-[#FF4B4B]/10 border-[#FF4B4B]/40'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className={`font-display font-extrabold text-xl ${feedback.pass ? 'text-[var(--accent-soft)]' : 'text-[#FF6B6B]'}`}>
                  {feedback.pass ? 'Excellent!' : 'Not quite right'}
                </h3>
                {!feedback.pass && feedback.errorKind && (
                  <span className="shrink-0 rounded-full border border-[#FF4B4B]/40 bg-[#FF4B4B]/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#FF9B9B]">
                    {ERROR_KIND_LABEL[feedback.errorKind] ?? feedback.errorKind}
                  </span>
                )}
              </div>
              {feedback.sidekickLine?.text && (
                <div className="mb-2 flex items-start gap-2">
                  <span
                    className="h-7 w-7 shrink-0 rounded-full border border-[var(--accent-30)] bg-[image:var(--sidekick-portrait)] bg-cover bg-center"
                    role="img"
                    aria-label={`${sidekick?.name ?? 'Sidekick'} portrait`}
                  />
                  <p className="text-sm font-semibold italic text-slate-300">{feedback.sidekickLine.text}</p>
                </div>
              )}
              <p className="text-gray-300 font-medium">{feedback.teachingNote}</p>
              {feedback.pass && feedback.usedWords?.length > 0 && (
                <p className="mt-2 text-sm text-[var(--accent-soft)] font-bold">
                  Mastered: {feedback.usedWords.map((id) => wordText(targetWords.find((w) => w.id === id))).filter(Boolean).join(', ')}
                </p>
              )}
              <button
                onClick={handleNextTurn}
                className={`mt-4 w-full py-3 rounded-xl font-display font-extrabold uppercase tracking-widest transition-all ${feedback.pass ? 'bg-[var(--accent)] hover:brightness-110 text-[var(--accent-ink)]' : 'bg-[#FF4B4B] hover:bg-[#FF5555] text-white'}`}
              >
                {feedback.scenarioComplete ? 'Finish Scenario' : feedback.pass ? 'Continue Scenario' : 'Try Again'}
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

      {/* Win Screen — scenarioComplete came from the server's evaluate response */}
      {state === 'scenario_complete' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in-up text-center">
          <div className="w-24 h-24 bg-[#FFC800]/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(255,200,0,0.4)] text-[#FFC800]">
            <ToyIcon name="trophy" size={55} />
          </div>
          <h2 className="font-display font-extrabold text-3xl text-white mb-2">Scenario Complete!</h2>
          <p className="text-gray-400 font-medium mb-8">
            You mastered {targetWords.length} {targetWords.length === 1 ? 'word' : 'words'} in conversation{wordMeaning(targetWords[0]) ? '.' : ''}
          </p>
          <button
            onClick={() => onEndScenario({ completed: true, id: scenarioId })}
            className="w-full rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] py-4 font-display text-base font-extrabold uppercase tracking-widest text-[var(--accent-ink)] transition-all hover:brightness-110 active:translate-y-0.5"
          >
            Return to Map
          </button>
        </div>
      )}

    </div>
  );
}

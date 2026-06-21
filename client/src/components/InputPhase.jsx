import { useState } from 'react';

export default function InputPhase({ words, langCode, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // In the future, this will fetch from the backend:
  // /api/scenario/discovery?scenarioId=...
  
  const currentWord = words[currentIndex];
  
  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete();
    }
  };
  
  const playAudio = () => {
    // Basic text-to-speech fallback
    const utterance = new SpeechSynthesisUtterance(currentWord.zh);
    const voiceLangs = { hi: 'hi-IN', fr: 'fr-FR', es: 'es-MX', zh: 'zh-CN' };
    utterance.lang = voiceLangs[langCode] || 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  if (!currentWord) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-2xl h-12 w-12 border-2 border-[var(--accent)] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-col items-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b1727]/92 p-4 shadow-[0_30px_100px_rgba(0,0,0,.45)] animate-fade-in-up sm:rounded-[2rem] sm:p-7 [@media(max-height:650px)]:p-3">
      <div className="mb-4 flex w-full items-center justify-between gap-3 sm:mb-6">
        <div><p className="font-display text-[9px] font-extrabold uppercase tracking-[.3em] text-[var(--accent)]">Mission vocabulary</p><h2 className="mt-1 font-display text-xl font-extrabold text-white">Pack your phrasebook</h2></div>
        <span className="rounded-xl border border-white/10 bg-[#07101d] px-3 py-2 text-xs font-extrabold tabular-nums text-slate-400">{currentIndex + 1} / {words.length}</span>
      </div>
      <div className="mb-4 flex w-full gap-2 sm:mb-6">{words.map((word, index) => <span key={`${word.expression ?? word.zh}-${index}`} className={'h-1.5 flex-1 rounded-full transition-colors ' + (index <= currentIndex ? 'bg-[var(--accent)]' : 'bg-white/10')} />)}</div>
      
      <div className="relative mb-4 flex min-h-[230px] w-full flex-col items-center justify-center rounded-[1.4rem] border border-white/[.08] bg-[#07101d] p-5 shadow-inner sm:mb-7 sm:min-h-[280px] sm:rounded-[1.6rem] sm:p-8 [@media(max-height:650px)]:min-h-[180px]">
        <button 
          onClick={playAudio}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--accent-25)] bg-[var(--accent-10)] text-[var(--accent-soft)] transition-colors hover:bg-[var(--accent-20)]"
          aria-label="Play audio"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
          </svg>
        </button>

        <span className="mb-3 max-w-full break-words text-center font-display text-4xl font-extrabold text-white sm:mb-4 sm:text-6xl">
          {currentWord.zh}
        </span>
        <span className="mb-4 text-center text-lg font-bold italic text-[#52b9db] sm:mb-6 sm:text-xl">
          {currentWord.pinyin}
        </span>
        <span className="text-lg text-gray-300 font-medium text-center">
          {currentWord.en}
        </span>
      </div>

      <button
        type="button"
        onClick={handleNext}
        className="w-full rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] py-3.5 font-display text-base font-extrabold uppercase tracking-widest text-[var(--accent-ink)] transition-all hover:brightness-110 active:translate-y-0.5"
      >
        {currentIndex < words.length - 1 ? 'Continue' : 'Start Scenario'}
      </button>
    </div>
  );
}

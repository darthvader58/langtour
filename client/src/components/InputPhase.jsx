import { useState } from 'react';
import { AGENT_AVATARS } from '../gameData';

export default function InputPhase({ words, country = 'China', onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading] = useState(false);

  const currentWord = words[currentIndex];
  const total = words.length;
  const avatar = AGENT_AVATARS[country];

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete();
    }
  };

  const playAudio = () => {
    const utterance = new SpeechSynthesisUtterance(currentWord.zh);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  if (loading || !currentWord) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#58CC02]/30 border-t-[#58CC02]"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 flex flex-col items-center animate-fade-in-up">
      {/* Guide + progress */}
      <div className="flex items-center gap-3 mb-5">
        {avatar && <img src={avatar} alt={`${country} guide`} className="w-12 h-12 drop-shadow-2xl sackboy-bob" />}
        <div className="text-left">
          <p className="font-display text-[11px] font-extrabold uppercase tracking-wide text-[#FFC93C]">
            New Words
          </p>
          <p className="font-display text-sm font-black text-white tabular-nums">
            {currentIndex + 1} of {total}
          </p>
        </div>
      </div>

      {/* segmented progress dots */}
      <div className="flex gap-1.5 mb-6">
        {words.map((_, i) => (
          <span
            key={i}
            className={
              'h-2.5 rounded-full transition-all duration-300 ' +
              (i === currentIndex ? 'w-8 bg-[#58CC02]' : i < currentIndex ? 'w-2.5 bg-[#58CC02]' : 'w-2.5 bg-white/20')
            }
          />
        ))}
      </div>

      {/* Physical flashcard */}
      <div className="w-full bg-white rounded-[2rem] border-4 border-slate-300 p-8 flex flex-col items-center justify-center min-h-[260px] mb-8 relative shadow-[0_8px_0_0_rgba(200,200,200,1)]">
        <button
          onClick={playAudio}
          className="absolute top-4 right-4 w-11 h-11 rounded-2xl bg-[#1CB0F6] border-4 border-[#1899D6] flex items-center justify-center text-white shadow-[0_3px_0_0_#1474AA] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_1px_0_0_#1474AA] transition-all"
          aria-label="Play audio"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
          </svg>
        </button>

        <span className="text-6xl font-display font-black text-slate-800 mb-3">
          {currentWord.zh}
        </span>
        <span className="text-xl text-[#1CB0F6] font-black italic mb-5">
          {currentWord.pinyin}
        </span>
        <span className="text-lg text-slate-500 font-bold text-center">
          {currentWord.en}
        </span>
      </div>

      <button
        type="button"
        onClick={handleNext}
        className="w-full py-4 rounded-2xl bg-[#58CC02] text-white border-4 border-[#46A302] font-display font-black uppercase tracking-wide text-lg shadow-[0_5px_0_0_#3E8E00] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_#3E8E00] transition-all"
      >
        {currentIndex < total - 1 ? 'Continue' : "Let's Go!"}
      </button>
    </div>
  );
}

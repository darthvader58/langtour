import { useState } from 'react';

export default function InputPhase({ words, onComplete }) {
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
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  if (!currentWord) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#58CC02]"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-[#1F2937] rounded-3xl border-2 border-[#37464F] flex flex-col items-center animate-fade-in-up">
      <h2 className="text-gray-400 font-display font-bold uppercase tracking-widest text-sm mb-6">
        New Vocabulary ({currentIndex + 1} / {words.length})
      </h2>
      
      <div className="w-full bg-[#0F1418] rounded-2xl p-8 flex flex-col items-center justify-center min-h-[250px] mb-8 relative">
        <button 
          onClick={playAudio}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#1F2937] hover:bg-[#28323c] flex items-center justify-center text-[#1CB0F6] transition-colors"
          aria-label="Play audio"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
          </svg>
        </button>

        <span className="text-6xl font-display font-extrabold text-white mb-4">
          {currentWord.zh}
        </span>
        <span className="text-xl text-[#1CB0F6] font-bold italic mb-6">
          {currentWord.pinyin}
        </span>
        <span className="text-lg text-gray-300 font-medium text-center">
          {currentWord.en}
        </span>
      </div>

      <button
        type="button"
        onClick={handleNext}
        className="w-full py-3.5 rounded-2xl bg-[#58CC02] hover:bg-[#61D908] border-2 border-[#46A302] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all text-white font-display font-extrabold uppercase tracking-wide text-lg"
      >
        {currentIndex < words.length - 1 ? 'Continue' : 'Start Scenario'}
      </button>
    </div>
  );
}

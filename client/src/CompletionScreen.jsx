import { useState, useEffect } from 'react'

export default function CompletionScreen({ country, code, character, rewardTokens, onReturn }) {
  const [showStamp, setShowStamp] = useState(false)
  const [showReward, setShowReward] = useState(false)
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setShowStamp(true), 500)
    const t2 = setTimeout(() => setShowReward(true), 1300)
    const t3 = setTimeout(() => setShowButton(true), 1750)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div className="relative w-screen h-screen overflow-hidden text-white font-sans animate-overlay-fade">
      <div className={`absolute inset-0 bg-gradient-to-b ${character.gradient} opacity-80`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_15%,_rgba(0,0,0,0.88)_100%)]" />

      <div className="relative z-10 flex flex-col items-center justify-center text-center h-full max-w-lg mx-auto px-8">
        {/* Passport stamp */}
        <div className={`mb-8 ${showStamp ? 'animate-stamp' : 'opacity-0'}`}>
          <div className="relative w-40 h-40 rounded-full border-[8px] border-[#40DF01] flex flex-col items-center justify-center bg-[#0F1418]/90 shadow-[0_0_60px_rgba(64, 223, 1,0.45)]">
            <img src={`https://flagcdn.com/${code ?? 'us'}.svg`} alt={country} className="w-12 rounded shadow-sm" />
            <span className="font-display text-[9px] font-extrabold uppercase tracking-[0.25em] text-[#40DF01] mt-2">
              Mastered
            </span>
            <div className="absolute inset-2 rounded-full border border-[#40DF01]/30" />
          </div>
        </div>

        <div
          className="font-display text-[11px] font-extrabold uppercase tracking-[0.35em] text-white/40 mb-2 animate-fade-in-up"
          style={{ animationDelay: '0.1s' }}
        >
          Mission Complete
        </div>

        <h2
          className="font-display text-4xl font-extrabold text-white mb-2 animate-fade-in-up"
          style={{ animationDelay: '0.2s' }}
        >
          {country} <span className="text-[#40DF01]">Mastered!</span>
        </h2>

        <p
          className="text-gray-400 font-medium mb-10 animate-fade-in-up"
          style={{ animationDelay: '0.35s' }}
        >
          You've completed all scenarios as a {character.type}.
        </p>

        {showReward && (
          <div className="flex items-center gap-4 rounded-3xl bg-[#1F2937]/80 backdrop-blur border-2 border-[#37464F] px-8 py-5 mb-10 animate-token-pop shadow-xl">
            <span className="text-4xl">🪙</span>
            <div className="text-left">
              <div className="font-display text-3xl font-extrabold text-[#FFC800]">
                +{rewardTokens}
              </div>
              <div className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                Tokens Earned
              </div>
            </div>
          </div>
        )}

        {showButton && (
          <button
            type="button"
            onClick={onReturn}
            className="flex h-[56px] items-center justify-center animate-fade-in-up px-10 rounded-2xl bg-[#40DF01] hover:bg-[#61D908] border-2 border-[#46A302] transition-all text-white font-display font-extrabold text-lg uppercase tracking-widest shadow-2xl"
          >
            Return to Globe
          </button>
        )}
      </div>
    </div>
  )
}

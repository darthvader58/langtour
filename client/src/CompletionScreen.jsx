import { useState, useEffect } from 'react'
import { CHARACTERS, REWARD_TOKENS } from './gameData'

export default function CompletionScreen({ country, flag, onReturn }) {
  const character = CHARACTERS[country] ?? CHARACTERS.China
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
    <div className="relative w-screen h-screen overflow-hidden text-[#F5F0E8] font-mono animate-overlay-fade">
      <div className={`absolute inset-0 bg-gradient-to-b ${character.gradient} opacity-70`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_15%,_rgba(0,0,0,0.9)_100%)]" />

      {/* Grain */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(201,168,76,0.08) 3px, rgba(201,168,76,0.08) 4px)' }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center text-center h-full max-w-lg mx-auto px-8">
        {/* Passport stamp ring */}
        <div className={`mb-8 ${showStamp ? 'animate-stamp' : 'opacity-0'}`}>
          <div className="relative w-40 h-40 rounded-full border-[6px] border-[#C9A84C] flex flex-col items-center justify-center bg-[#0A0805]/90 shadow-[0_0_50px_rgba(201,168,76,0.35)]">
            <span className="text-5xl">{flag}</span>
            <span className="font-display text-[9px] font-bold uppercase tracking-[0.25em] text-[#C9A84C] mt-1.5">
              Mastered
            </span>
            <div className="absolute inset-2 rounded-full border border-[#C9A84C]/25" />
          </div>
        </div>

        <div
          className="font-mono text-[10px] font-bold uppercase tracking-[0.4em] text-[#C9A84C]/40 mb-2 animate-fade-in-up"
          style={{ animationDelay: '0.1s' }}
        >
          Mission Complete
        </div>

        <h2
          className="font-display text-4xl font-bold text-[#F5F0E8] mb-2 tracking-wider animate-fade-in-up"
          style={{ animationDelay: '0.2s' }}
        >
          {country} <span className="text-[#C9A84C]">Mastered</span>
        </h2>

        <p
          className="text-[#8B7355] text-sm mb-10 animate-fade-in-up"
          style={{ animationDelay: '0.35s' }}
        >
          All scenarios completed as a {character.type}.
        </p>

        {showReward && (
          <div className="flex items-center gap-4 bg-[#0D0B06]/80 border border-[#C9A84C]/30 px-8 py-5 mb-10 animate-token-pop shadow-[0_0_30px_rgba(201,168,76,0.1)]">
            <span className="text-4xl">🪙</span>
            <div className="text-left">
              <div className="font-display text-3xl font-bold text-[#C9A84C]">
                +{REWARD_TOKENS}
              </div>
              <div className="font-mono text-[10px] text-[#8B7355] uppercase tracking-widest">
                Ducats Earned
              </div>
            </div>
          </div>
        )}

        {showButton && (
          <button
            type="button"
            onClick={onReturn}
            className="animate-fade-in-up px-10 py-4 bg-[#C9A84C]/10 border border-[#C9A84C]/50 hover:bg-[#C9A84C]/20 transition-all font-display font-bold text-[#C9A84C] text-lg uppercase tracking-widest shadow-[0_0_30px_rgba(201,168,76,0.1)]"
          >
            Return to Globe
          </button>
        )}
      </div>
    </div>
  )
}

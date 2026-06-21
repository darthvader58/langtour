import { useState, useEffect } from 'react'
import ToyIcon from './components/ToyIcon'
import { getCountryThemeStyle } from './countryTheme'

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
    <div style={getCountryThemeStyle(country)} className="relative min-h-dvh w-screen overflow-x-hidden overflow-y-auto text-white font-sans animate-overlay-fade">
      <div className={`absolute inset-0 bg-gradient-to-b ${character.gradient} opacity-80`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_15%,_rgba(0,0,0,0.88)_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 py-8 text-center sm:px-8 sm:py-12">
        {/* Passport stamp */}
        <div className={`mb-5 sm:mb-8 ${showStamp ? 'animate-stamp' : 'opacity-0'}`}>
          <div className="relative flex h-28 w-28 flex-col items-center justify-center rounded-full border-[6px] border-[var(--accent)] bg-[#0F1418]/90 sm:h-40 sm:w-40 sm:border-[8px]">
            <img src={`https://flagcdn.com/${code ?? 'us'}.svg`} alt={country} className="w-12 rounded shadow-sm" />
            <span className="mt-2 font-display text-[8px] font-extrabold uppercase tracking-[0.2em] text-[var(--accent)] sm:text-[9px] sm:tracking-[0.25em]">
              Mastered
            </span>
            <div className="absolute inset-2 rounded-full border border-[var(--accent-30)]" />
          </div>
        </div>

        <div
          className="font-display text-[11px] font-extrabold uppercase tracking-[0.35em] text-white/40 mb-2 animate-fade-in-up"
          style={{ animationDelay: '0.1s' }}
        >
          Mission Complete
        </div>

        <h2
          className="mb-2 font-display text-3xl font-extrabold text-white animate-fade-in-up sm:text-4xl"
          style={{ animationDelay: '0.2s' }}
        >
          {country} <span className="text-[var(--accent-soft)]">Mastered!</span>
        </h2>

        <p
          className="mb-6 text-sm font-medium text-gray-400 animate-fade-in-up sm:mb-10 sm:text-base"
          style={{ animationDelay: '0.35s' }}
        >
          You've completed all scenarios as a {character.type}.
        </p>

        {showReward && (
          <div className="mb-6 flex items-center gap-4 rounded-3xl border border-white/10 bg-[#1F2937]/80 px-6 py-4 shadow-xl backdrop-blur animate-token-pop sm:mb-10 sm:px-8 sm:py-5">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFC800]/10 text-[#FFC800]"><ToyIcon name="coin" size={38} /></span>
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
            className="flex h-[52px] w-full max-w-sm items-center justify-center rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] px-6 font-display text-sm font-extrabold uppercase tracking-widest text-[var(--accent-ink)] shadow-2xl transition-all hover:brightness-110 animate-fade-in-up sm:h-[56px] sm:w-auto sm:px-10 sm:text-lg"
          >
            Return to Globe
          </button>
        )}
      </div>
    </div>
  )
}

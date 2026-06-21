import { useEffect, useState } from 'react'
import SackboyCharacter from './SackboyCharacter'

/**
 * PassportCompletion — the win state when every scenario in a country is done.
 * A glowing digital-gold passport stamp slams onto the screen, followed by a
 * readout of Ducats earned and vocabulary mastered.
 *
 * Props:
 *   country        - completed country name
 *   ducatsEarned   - reward tokens granted
 *   vocabMastered  - count of vocabulary entries cleared
 *   onReturn       - called by "Return to Globe"
 */

const GOLD = '#E8C547'

function useCountUp(target, start, duration = 1000) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!start) return undefined
    let raf
    let t0 = null
    const tick = (t) => {
      if (t0 === null) t0 = t
      const p = Math.min(1, (t - t0) / duration)
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, start, duration])
  return val
}

function CoinIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <defs>
        <radialGradient id="pcCoin" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff6c8" />
          <stop offset="55%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9.5" fill="url(#pcCoin)" stroke="#92400e" strokeWidth="1" />
      <text x="12" y="16" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#78350f">L</text>
    </svg>
  )
}

function StatTile({ icon, value, label }) {
  return (
    <div
      className="relative flex-1 flex flex-col items-center gap-1 rounded-lg py-4 px-3"
      style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.25)' }}
    >
      <span className="hud-corner hud-corner--tl" />
      <span className="hud-corner hud-corner--br" />
      <div className="flex items-center gap-1.5">{icon}</div>
      <span className="font-display text-3xl font-black tabular-nums animate-value-glow" style={{ color: GOLD }}>
        {value}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8B7355] text-center">{label}</span>
    </div>
  )
}

export default function PassportCompletion({ country = 'China', ducatsEarned = 0, vocabMastered = 0, onReturn }) {
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), 360)
    return () => clearTimeout(t)
  }, [])

  const ducats = useCountUp(ducatsEarned, landed)
  const vocab  = useCountUp(vocabMastered, landed)

  return (
    <div className={'fixed inset-0 z-50 flex items-center justify-center px-4 bg-[#050407] text-[#F5F0E8] ' + (landed ? 'animate-stamp-shake' : '')}>
      {/* radial gold ambiance + CRT scanlines */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(201,168,76,0.12), transparent 70%)' }} />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(232,197,71,0.4) 2px, rgba(232,197,71,0.4) 3px)' }}
      />

      {/* passport page */}
      <div
        className="relative w-full max-w-md rounded-xl p-8 animate-modal-pop"
        style={{
          background: 'linear-gradient(180deg, rgba(201,168,76,0.12), rgba(12,10,7,0.97) 30%)',
          border: '1px solid rgba(201,168,76,0.38)',
          boxShadow: '0 0 70px rgba(201,168,76,0.16), 0 24px 80px rgba(0,0,0,0.8)',
        }}
      >
        <span className="hud-corner hud-corner--tl hud-corner--pulse" />
        <span className="hud-corner hud-corner--tr hud-corner--pulse" />
        <span className="hud-corner hud-corner--bl hud-corner--pulse" />
        <span className="hud-corner hud-corner--br hud-corner--pulse" />
        <div className="hud-topline" />

        <p className="text-center font-mono text-[10px] uppercase tracking-[0.4em] text-[#8B7355] mb-1">
          Field Operations Complete
        </p>

        {/* stamp + agent */}
        <div className="relative flex items-center justify-center py-6" style={{ minHeight: '210px' }}>
          <SackboyCharacter country={country} size={120} state="dance" />

          {/* the slamming digital-gold stamp */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="animate-stamp-slam">
              <div
                className="relative flex flex-col items-center justify-center rounded-full"
                style={{
                  width: '186px', height: '186px',
                  border: `4px solid ${GOLD}`,
                  boxShadow: '0 0 34px rgba(232,197,71,0.7), inset 0 0 26px rgba(232,197,71,0.35)',
                  background: 'radial-gradient(circle, rgba(201,168,76,0.08), transparent 65%)',
                }}
              >
                <div className="absolute rounded-full" style={{ inset: '10px', border: `1.5px solid rgba(232,197,71,0.55)` }} />
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>Mission</span>
                <span className="font-display text-2xl font-black uppercase tracking-wider my-0.5" style={{ color: GOLD, textShadow: '0 0 14px rgba(232,197,71,0.8)' }}>
                  {country}
                </span>
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>Cleared</span>
                <span className="mt-1 font-mono text-[8px] tracking-[0.3em] text-[#C9A84C]/70">★ ★ ★</span>
              </div>
            </div>
          </div>
        </div>

        {/* summary */}
        <div className="flex gap-3 mt-2 mb-7">
          <StatTile icon={<CoinIcon />} value={ducats} label="Ducats Earned" />
          <StatTile
            icon={<span className="font-display text-base" style={{ color: GOLD }}>◈</span>}
            value={vocab}
            label="Vocab Mastered"
          />
        </div>

        <button
          type="button"
          onClick={onReturn}
          className="btn-chunky hud-btn animate-terminal-glow w-full py-3.5 rounded-lg font-display font-bold text-sm uppercase tracking-[0.2em]"
          style={{ background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(232,197,71,0.6)', color: GOLD, textShadow: '0 0 10px rgba(232,197,71,0.6)' }}
        >
          ◂ Return to Globe
        </button>
      </div>
    </div>
  )
}

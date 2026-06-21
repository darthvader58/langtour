import { useState, useEffect } from 'react'

const STAMP_COLORS = {
  China:  '#ef4444',
  Japan:  '#8b5cf6',
  France: '#3b82f6',
  Mexico: '#f97316',
  Egypt:  '#facc15',
  Brazil: '#22c55e',
}

function PassportPage({ country, flag, character, completedCount, topVocab, stampVisible }) {
  const color = STAMP_COLORS[country] ?? '#58CC02'

  return (
    <div className="relative w-full h-full rounded-r-2xl bg-[#f5f0e8] flex flex-col overflow-hidden">
      {/* Header band */}
      <div className="shrink-0 px-8 pt-7 pb-4" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
        <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-400 mb-1">Mission Passport</p>
        <h2 className="font-display text-2xl font-extrabold text-white tracking-wide">{country}</h2>
        <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{character?.type ?? 'Agent'} · {completedCount} Scenarios Mastered</p>
      </div>

      {/* Body */}
      <div className="flex-1 px-8 py-5 flex flex-col gap-4 overflow-y-auto">
        {/* Top vocab */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Top Vocabulary</p>
          <div className="grid grid-cols-2 gap-1.5">
            {topVocab.slice(0, 6).map((word, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-1.5 border border-gray-200">
                <span className="text-sm font-bold text-gray-800">{word.zh}</span>
                <span className="text-[10px] text-gray-500">{word.en}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Security lines (fake passport decoration) */}
        <div className="flex flex-col gap-1 opacity-20">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-px rounded-full"
              style={{ background: 'repeating-linear-gradient(90deg, #aaa 0px, #aaa 4px, transparent 4px, transparent 8px)', width: `${60 + ((i * 17) % 41)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Stamp overlay */}
      <div
        className="absolute bottom-8 right-8 flex flex-col items-center justify-center transition-all duration-700"
        style={{
          opacity:   stampVisible ? 1 : 0,
          transform: stampVisible ? 'scale(1) rotate(-12deg)' : 'scale(2) rotate(-12deg)',
        }}
      >
        <div
          className="w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center"
          style={{
            borderColor: color,
            color,
            boxShadow: `0 0 0 2px ${color}30, inset 0 0 0 2px ${color}20`,
          }}
        >
          <span className="text-3xl">{flag}</span>
          <span className="font-display text-[8px] font-extrabold uppercase tracking-wider mt-1" style={{ color }}>
            Mastered
          </span>
          <div
            className="absolute inset-1 rounded-full border opacity-30"
            style={{ borderColor: color }}
          />
        </div>
      </div>
    </div>
  )
}

export default function PassportStamp({ country, flag, character, rewardTokens, progress, scenarios, onClaim }) {
  const [open, setOpen]       = useState(false)
  const [stamp, setStamp]     = useState(false)
  const [canClaim, setCanClaim] = useState(false)

  const completedCount = (progress ?? []).filter(p => p >= 100).length
  const topVocab = (scenarios ?? []).flatMap(s => s.vocab ?? []).slice(0, 6)

  useEffect(() => {
    const t1 = setTimeout(() => setOpen(true),  200)
    const t2 = setTimeout(() => setStamp(true), 1100)
    const t3 = setTimeout(() => setCanClaim(true), 1900)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div className="fixed inset-0 z-40 bg-[#05060a] flex items-center justify-center animate-overlay-fade">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_rgba(88,204,2,0.04)_0%,_transparent_65%)]" />

      {/* Passport book */}
      <div
        className="relative flex shadow-2xl"
        style={{ width: 680, height: 420, perspective: '2000px' }}
      >
        {/* Left cover (spine side) */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-l-2xl bg-[#1a1a2e] border-r-2 border-[#37464F] z-10 shrink-0"
          style={{
            width:          340,
            transformOrigin: 'right center',
            transform:       `rotateY(${open ? -25 : -150}deg)`,
            transition:      'transform 0.9s cubic-bezier(0.16,1,0.3,1)',
            backfaceVisibility: 'hidden',
          }}
        >
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
            <div className="text-5xl">{flag}</div>
            <div className="font-display text-2xl font-extrabold text-white tracking-wide text-center">{country}</div>
            <div className="font-display text-[10px] font-extrabold uppercase tracking-[0.3em] text-gray-500">Mission Passport</div>
            <div className="w-16 h-px bg-[#58CC02]/30 mt-2" />
            <div className="text-[#58CC02]/50 text-xs font-bold uppercase tracking-widest">Classified</div>
          </div>
        </div>

        {/* Right page */}
        <div
          className="absolute right-0 top-0 bottom-0 rounded-r-2xl overflow-hidden border border-[#37464F]"
          style={{ width: 340, left: 340 }}
        >
          <PassportPage
            country={country}
            flag={flag}
            character={character}
            completedCount={completedCount}
            topVocab={topVocab}
            stampVisible={stamp}
          />
        </div>

        {/* Spine */}
        <div className="absolute left-[336px] top-0 bottom-0 w-2 bg-gradient-to-r from-[#0d0f14] to-[#1a1a2e] z-20" />
      </div>

      {/* Claim button */}
      <div
        className="absolute bottom-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 transition-all duration-500"
        style={{ opacity: canClaim ? 1 : 0, transform: `translateX(-50%) translateY(${canClaim ? 0 : 16}px)` }}
      >
        <p className="text-gray-500 text-sm font-medium">+{rewardTokens} tokens awarded</p>
        <button
          type="button"
          onClick={onClaim}
          className="px-12 py-4 rounded-2xl bg-[#58CC02] hover:bg-[#61D908] border-2 border-[#46A302] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all text-white font-display font-extrabold text-lg uppercase tracking-widest shadow-[0_0_32px_rgba(88,204,2,0.35)]"
        >
          Claim Tokens
        </button>
      </div>
    </div>
  )
}

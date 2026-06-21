import { useEffect, useState } from 'react'
import { AGENT_AVATARS } from '../gameData'

const GOLD = '#FFC93C'

// Friendly per-scenario flavor: where you're headed, how long it takes, and how
// tricky it is (1-5 stars). No more "classification" / spy redaction.
const SCENARIO_META = {
  'street-market':     { difficulty: 2, time: '8 min',  place: 'Huangpu Market, Shanghai' },
  'restaurant':        { difficulty: 2, time: '8 min',  place: "Jing'an Bistro, Shanghai" },
  'train-station':     { difficulty: 3, time: '10 min', place: 'Hongqiao Station, Shanghai' },
  'taxi-ride':         { difficulty: 2, time: '7 min',  place: 'Pudong, Shanghai' },
  'hotel-checkin':     { difficulty: 1, time: '6 min',  place: 'The Bund Hotel, Shanghai' },
  'newspaper-reading': { difficulty: 4, time: '12 min', place: 'French Concession, Shanghai' },
  'business-meeting':  { difficulty: 4, time: '15 min', place: 'Lujiazui, Shanghai' },
  'politician-speech': { difficulty: 5, time: '18 min', place: "People's Square, Shanghai" },
}

function DifficultyStars({ count, max = 5 }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? 'text-[#FFC93C]' : 'text-slate-300'}>★</span>
      ))}
    </span>
  )
}

function InfoChip({ icon, label, children }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1 rounded-2xl bg-[#EEF3FF] border-[3px] border-slate-200 px-3 py-3">
      <span className="font-display text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
        {icon} {label}
      </span>
      <span className="font-display text-sm font-black text-slate-700 text-center leading-tight">
        {children}
      </span>
    </div>
  )
}

export default function MissionBriefing({ scenario, country, onAccept, onCancel }) {
  const meta = SCENARIO_META[scenario.id] ?? {
    difficulty: 3, time: '10 min', place: `${country}`,
  }
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 60)
    return () => clearTimeout(t)
  }, [])

  const keyPhrases = (scenario.vocab ?? []).slice(0, 4)
  const avatar = AGENT_AVATARS[country]

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0D1530]/80 backdrop-blur-sm animate-overlay-fade px-4">
      <div className="animate-modal-pop relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[2rem] bg-white border-4 border-slate-300 p-7 pt-12 shadow-[0_8px_0_0_rgba(200,200,200,1)]">
        {/* Friendly banner ribbon */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-6 py-2 rounded-2xl bg-[#1CB0F6] border-4 border-white shadow-[0_4px_0_0_rgba(24,153,214,1)]">
          <span className="font-display text-sm font-black uppercase tracking-wide text-white whitespace-nowrap">
            ✨ Mission Overview
          </span>
        </div>

        {/* Agent avatar + title */}
        <div className="flex flex-col items-center text-center mb-6">
          {avatar && (
            <img
              src={avatar}
              alt={`${country} guide`}
              draggable="false"
              className={'w-24 h-24 drop-shadow-2xl mb-2 ' + (show ? 'sackboy-bob' : '')}
            />
          )}
          <span className="font-display text-[11px] font-extrabold uppercase tracking-wide text-[#1CB0F6]">
            {country} Adventure
          </span>
          <h1 className="font-display text-2xl font-black text-slate-800 leading-tight mt-0.5 flex items-center gap-2">
            <span>{scenario.icon}</span> {scenario.title}
          </h1>
          <p className="font-display text-sm font-semibold text-slate-500 mt-2 max-w-sm">
            {scenario.description}
          </p>
        </div>

        {/* Info chips */}
        <div className="flex gap-3 mb-6">
          <InfoChip icon="📍" label="Where">{meta.place}</InfoChip>
          <InfoChip icon="⏱️" label="Time">{meta.time}</InfoChip>
          <InfoChip icon="⭐" label="Level"><DifficultyStars count={meta.difficulty} /></InfoChip>
        </div>

        {/* Key phrases */}
        {keyPhrases.length > 0 && (
          <div className="rounded-3xl bg-[#F4F7FF] border-[3px] border-slate-200 p-4 mb-7">
            <p className="font-display text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-3">
              🎒 Phrases you'll pack
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {keyPhrases.map((word, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-white border-2 border-slate-200 px-3 py-2">
                  <span className="font-display text-xs font-semibold text-slate-500 truncate">{word.en}</span>
                  <span className="font-display text-base font-black text-slate-800 shrink-0">{word.native ?? word.zh}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-2xl bg-white border-4 border-slate-300 font-display font-extrabold text-sm uppercase tracking-wide text-slate-500 shadow-[0_4px_0_0_rgba(203,213,225,1)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_1px_0_0_rgba(203,213,225,1)] transition-all"
          >
            Maybe Later
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-[2] py-3.5 rounded-2xl bg-[#58CC02] text-white border-4 border-[#46A302] font-display font-black text-base uppercase tracking-wide shadow-[0_5px_0_0_#3E8E00] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_#3E8E00] transition-all"
          >
            Let's Go! →
          </button>
        </div>
      </div>
    </div>
  )
}

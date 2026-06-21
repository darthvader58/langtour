import { useEffect, useState } from 'react'

/**
 * PronunciationScore — friendly Playground-style grade readout for the
 * ScenarioRunner. A circular progress ring with a letter grade (S / A / B / C / D),
 * coloured bright green for strong scores and shifting to amber/orange/red as the
 * score drops. A friendly feedback bubble sits below. Designed to live on a
 * white feedback card.
 *
 * Props:
 *   score    - 0-100 pronunciation / response score
 *   feedback - AI feedback string
 *   label    - small caption above the feedback (default "Pronunciation")
 */

function gradeFor(s) {
  if (s >= 95) return 'S'
  if (s >= 85) return 'A'
  if (s >= 70) return 'B'
  if (s >= 55) return 'C'
  return 'D'
}

function colorFor(s) {
  if (s >= 80) return '#58CC02' // bright green
  if (s >= 60) return '#FFC93C' // gold
  if (s >= 40) return '#FF9600' // orange
  return '#FF4B4B'              // friendly red
}

export default function PronunciationScore({ score = 0, feedback, label = 'Pronunciation' }) {
  const target = Math.max(0, Math.min(100, Math.round(score)))
  const color = colorFor(target)
  const grade = gradeFor(target)

  const R = 52
  const CIRC = 2 * Math.PI * R

  const [progress, setProgress] = useState(0)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setProgress(target), 60)
    let raf
    let t0 = null
    const tick = (now) => {
      if (t0 === null) t0 = now
      const p = Math.min(1, (now - t0) / 900)
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { clearTimeout(t); cancelAnimationFrame(raf) }
  }, [target])

  const offset = CIRC * (1 - progress / 100)

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#E5EAF2" strokeWidth="10" />
          <circle
            cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-black text-5xl leading-none" style={{ color }}>
            {grade}
          </span>
          <span className="font-display text-sm font-bold text-slate-400 mt-1 tabular-nums">
            {shown}<span className="opacity-60">/100</span>
          </span>
        </div>
      </div>

      <span className="font-display text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
        {label} Score
      </span>

      {feedback && (
        <div className="w-full rounded-2xl p-4 bg-[#F4F7FF] border-[3px] border-slate-200">
          <p className="font-display text-[11px] font-extrabold uppercase tracking-wide text-[#1CB0F6] mb-1.5">
            💬 Coach says
          </p>
          <p className="font-display text-sm font-semibold leading-relaxed text-slate-600">{feedback}</p>
        </div>
      )}
    </div>
  )
}

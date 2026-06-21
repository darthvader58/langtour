import { useState, useEffect } from 'react'
import ToyIcon from './ToyIcon'

const SCENARIO_META = {
  'street-market':     { classification: 'RESTRICTED',   difficulty: 2, time: '8 min',  location: 'HUANGPU DISTRICT, SHANGHAI' },
  'restaurant':        { classification: 'CONFIDENTIAL',  difficulty: 2, time: '8 min',  location: 'JING\'AN, SHANGHAI' },
  'train-station':     { classification: 'SECRET',        difficulty: 3, time: '10 min', location: 'SHANGHAI HONGQIAO STATION' },
  'taxi-ride':         { classification: 'CONFIDENTIAL',  difficulty: 2, time: '7 min',  location: 'PUDONG, SHANGHAI' },
  'hotel-checkin':     { classification: 'RESTRICTED',    difficulty: 1, time: '6 min',  location: 'THE BUND, SHANGHAI' },
  'newspaper-reading': { classification: 'TOP SECRET',    difficulty: 4, time: '12 min', location: 'FRENCH CONCESSION, SHANGHAI' },
  'business-meeting':  { classification: 'TOP SECRET',    difficulty: 4, time: '15 min', location: 'LUJIAZUI FINANCIAL DISTRICT' },
  'politician-speech': { classification: 'EYES ONLY',     difficulty: 5, time: '18 min', location: 'PEOPLE\'S SQUARE, SHANGHAI' },
}

function Stars({ count, max = 5 }) {
  return (
    <span>
      {Array.from({ length: max }, (_, i) => (
        <ToyIcon key={i} name="spark" size={15} className={'inline-block ' + (i < count ? 'text-[#FFC800]' : 'text-gray-700')} />
      ))}
    </span>
  )
}

function TypewriterLine({ text, delay = 0, speed = 22, className = '' }) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(startTimer)
  }, [delay])

  useEffect(() => {
    if (!started) return
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, ++i))
      } else {
        clearInterval(interval)
      }
    }, speed)
    return () => clearInterval(interval)
  }, [started, text, speed])

  if (!started && !displayed) return <span className={className + ' opacity-0'}>|</span>

  return (
    <span className={className}>
      {displayed}
      {displayed.length < text.length && (
        <span className="animate-pulse text-[var(--accent)]">▋</span>
      )}
    </span>
  )
}

export default function MissionBriefing({ scenario, country, onAccept, onCancel }) {
  const meta = SCENARIO_META[scenario.id] ?? {
    classification: 'CLASSIFIED', difficulty: 3, time: '10 min', location: 'UNKNOWN LOCATION',
  }
  const [showButton, setShowButton] = useState(false)

  const totalTypingMs = 200 + 6 * 400
  useEffect(() => {
    const t = setTimeout(() => setShowButton(true), totalTypingMs + 600)
    return () => clearTimeout(t)
  }, [totalTypingMs])

  const lines = [
    { label: 'MISSION REF',      value: scenario.id.toUpperCase().replace(/-/g, '_'),  delay: 0,    redact: false },
    { label: 'CLASSIFICATION',   value: meta.classification,                            delay: 400,  redact: false, highlight: true },
    { label: 'LOCATION',         value: meta.location,                                  delay: 800,  redact: true  },
    { label: 'OBJECTIVE',        value: scenario.description,                           delay: 1200, redact: false },
    { label: 'ESTIMATED TIME',   value: meta.time,                                      delay: 1600, redact: false },
    { label: 'DIFFICULTY',       value: null,                                           delay: 2000, stars: meta.difficulty },
  ]

  const keyPhrases = (scenario.vocab ?? []).slice(0, 4)

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#050b14] animate-overlay-fade sm:items-center">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(91,135,170,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.055)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(30,100,145,.24),transparent_38%),radial-gradient(circle_at_25%_80%,rgba(255,154,77,.1),transparent_35%)]" />

      <div className="relative z-10 mx-3 my-3 w-full max-w-3xl rounded-[1.5rem] border border-white/10 bg-[#0b1727]/92 px-4 py-5 shadow-[0_35px_120px_rgba(0,0,0,.6)] backdrop-blur-xl sm:mx-6 sm:my-8 sm:rounded-[2rem] sm:px-10 sm:py-9">
        {/* Header stamp */}
        <div className="mb-5 flex items-center gap-3 animate-fade-in-up sm:mb-8 sm:gap-4">
          <div className="flex-1 h-px bg-[var(--accent-30)]" />
          <span className="whitespace-nowrap font-display text-[8px] font-extrabold tracking-[0.24em] text-[var(--accent-soft)] sm:text-[10px] sm:tracking-[0.4em]">
            CLASSIFIED DOSSIER
          </span>
          <div className="flex-1 h-px bg-[var(--accent-30)]" />
        </div>

        {/* Mission icon + title */}
        <div className="mb-5 flex items-center gap-3 animate-fade-in-up sm:mb-8 sm:gap-4" style={{ animationDelay: '0.1s' }}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-30)] bg-[#07101d] text-3xl shadow-inner sm:h-16 sm:w-16 sm:rounded-2xl sm:text-4xl">
            {scenario.icon}
          </div>
          <div>
            <p className="font-display text-[10px] text-slate-500 tracking-widest uppercase mb-1">{country} Mission</p>
            <h1 className="font-display text-xl font-extrabold tracking-wide text-white sm:text-3xl">{scenario.title}</h1>
          </div>
        </div>

        {/* Typewriter lines */}
        <div className="mb-5 space-y-3 font-mono sm:mb-8">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[6.5rem_1fr] gap-x-2 text-xs leading-relaxed sm:grid-cols-[9rem_auto_1fr] sm:gap-3 sm:text-sm">
              <span className="pt-0.5 text-[10px] uppercase tracking-wider text-slate-500 sm:text-xs sm:tracking-widest">
                {line.label}
              </span>
              <span className="hidden text-[var(--accent-soft)] sm:block">:</span>
              {line.stars ? (
                <TypewriterLine
                  text=""
                  delay={line.delay}
                  className="text-base"
                />
              ) : line.redact ? (
                <TypewriterLine
                  text={line.value}
                  delay={line.delay}
                  className={'font-bold ' + (line.highlight ? 'text-[var(--accent)]' : 'text-slate-200')}
                />
              ) : (
                <TypewriterLine
                  text={line.value}
                  delay={line.delay}
                  className={'font-medium ' + (line.highlight ? 'text-[var(--accent)] font-bold' : 'text-slate-200')}
                />
              )}
              {line.stars && (
                <span
                  className="transition-opacity duration-500"
                  style={{ opacity: showButton ? 1 : 0 }}
                >
                  <Stars count={line.stars} />
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Key phrases */}
        {keyPhrases.length > 0 && (
          <div className="mb-5 rounded-2xl border border-white/10 bg-[#07101d]/85 p-3 animate-fade-in-up sm:mb-8 sm:p-4" style={{ animationDelay: '2.4s' }}>
            <p className="font-display text-[10px] text-[var(--accent)] tracking-widest uppercase mb-3">Key Phrases to Master</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {keyPhrases.map((word, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[var(--accent-soft)] font-mono text-xs">›</span>
                  <span className="font-mono text-sm text-slate-400">{word.en}</span>
                  <span className="font-mono text-sm text-white font-bold">{word.zh}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div
          className={'flex flex-col gap-2 transition-all duration-500 sm:flex-row sm:gap-4 ' + (showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')}
        >
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-2xl bg-white/[0.025] border border-white/10 hover:bg-white/[0.06] font-display font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-all"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-2 flex-grow-[2] py-3.5 rounded-2xl bg-[var(--accent)] border border-[var(--accent-30)] hover:brightness-110 font-display font-extrabold text-[var(--accent-ink)] uppercase tracking-widest transition-all"
          >
            Accept Mission
          </button>
        </div>

        {/* Footer */}
        <div className="mt-5 hidden items-center gap-4 animate-fade-in-up sm:flex sm:mt-8" style={{ animationDelay: '2.6s' }}>
          <div className="flex-1 h-px bg-white/10" />
          <span className="font-mono text-[9px] text-slate-700 tracking-widest">UNAUTHORIZED ACCESS IS PROHIBITED</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
      </div>
    </div>
  )
}

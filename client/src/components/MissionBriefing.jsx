import { useState, useEffect } from 'react'

const SCENARIO_META = {
  'street-market':     { classification: 'RESTRICTED',  difficulty: 2, time: '8 min',  location: 'HUANGPU DISTRICT, SHANGHAI' },
  'restaurant':        { classification: 'CONFIDENTIAL', difficulty: 2, time: '8 min',  location: "JING'AN, SHANGHAI" },
  'train-station':     { classification: 'SECRET',       difficulty: 3, time: '10 min', location: 'SHANGHAI HONGQIAO STATION' },
  'taxi-ride':         { classification: 'CONFIDENTIAL', difficulty: 2, time: '7 min',  location: 'PUDONG, SHANGHAI' },
  'hotel-checkin':     { classification: 'RESTRICTED',   difficulty: 1, time: '6 min',  location: 'THE BUND, SHANGHAI' },
  'newspaper-reading': { classification: 'TOP SECRET',   difficulty: 4, time: '12 min', location: 'FRENCH CONCESSION, SHANGHAI' },
  'business-meeting':  { classification: 'TOP SECRET',   difficulty: 4, time: '15 min', location: 'LUJIAZUI FINANCIAL DISTRICT' },
  'politician-speech': { classification: 'EYES ONLY',    difficulty: 5, time: '18 min', location: "PEOPLE'S SQUARE, SHANGHAI" },
}

function Stars({ count, max = 5 }) {
  return (
    <span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? 'text-[#C9A84C]' : 'text-[#3D2E0D]'}>★</span>
      ))}
    </span>
  )
}

function TypewriterLine({ text, delay = 0, speed = 22, className = '' }) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  useEffect(() => {
    if (!started) return
    setDisplayed('')
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) setDisplayed(text.slice(0, ++i))
      else clearInterval(interval)
    }, speed)
    return () => clearInterval(interval)
  }, [started, text, speed])

  if (!started && !displayed) return <span className={className + ' opacity-0'}>|</span>

  return (
    <span className={className}>
      {displayed}
      {displayed.length < text.length && (
        <span className="animate-pulse text-[#C9A84C]">▋</span>
      )}
    </span>
  )
}

export default function MissionBriefing({ scenario, country, onAccept, onCancel }) {
  const meta = SCENARIO_META[scenario.id] ?? {
    classification: 'CLASSIFIED', difficulty: 3, time: '10 min', location: `${country.toUpperCase()} SECTOR`,
  }
  const [showButton, setShowButton] = useState(false)
  const [showStamp, setShowStamp] = useState(false)

  const totalTypingMs = 200 + 6 * 400
  useEffect(() => {
    const t1 = setTimeout(() => setShowStamp(true), 350)
    const t2 = setTimeout(() => setShowButton(true), totalTypingMs + 600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [totalTypingMs])

  const lines = [
    { label: 'MISSION REF',    value: scenario.id.toUpperCase().replace(/-/g, '_'), delay: 0,    redact: false },
    { label: 'CLASSIFICATION', value: meta.classification,                          delay: 400,  redact: false, highlight: true },
    { label: 'LOCATION',       value: meta.location,                                delay: 800,  redact: true  },
    { label: 'OBJECTIVE',      value: scenario.description,                         delay: 1200, redact: false },
    { label: 'EST. DURATION',  value: meta.time,                                    delay: 1600, redact: false },
    { label: 'THREAT LEVEL',   value: null,                                         delay: 2000, stars: meta.difficulty },
  ]

  const keyPhrases = (scenario.vocab ?? []).slice(0, 4)

  return (
    <div className="fixed inset-0 z-40 bg-[#080604] flex items-center justify-center animate-overlay-fade">
      {/* Aged paper grain */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(201,168,76,0.1) 3px, rgba(201,168,76,0.1) 4px)' }}
      />

      {/* Coffee stain A */}
      <div className="absolute pointer-events-none" style={{
        top: '12%', right: '10%', width: '200px', height: '180px',
        background: 'radial-gradient(ellipse, rgba(101,67,33,0.14) 0%, rgba(101,67,33,0.06) 45%, transparent 70%)',
        borderRadius: '60% 40% 55% 45%',
      }} />
      {/* Coffee stain B */}
      <div className="absolute pointer-events-none" style={{
        bottom: '18%', left: '7%', width: '130px', height: '160px',
        background: 'radial-gradient(ellipse, rgba(101,67,33,0.1) 0%, rgba(101,67,33,0.04) 45%, transparent 70%)',
        borderRadius: '40% 60% 30% 70%',
        transform: 'rotate(-20deg)',
      }} />

      {/* CLASSIFIED diagonal stamp */}
      {showStamp && (
        <div
          className="absolute top-20 right-12 pointer-events-none animate-stamp"
          style={{ transform: 'rotate(-18deg)', transformOrigin: 'center' }}
        >
          <div className="border-[3px] border-[#8B0000] px-6 py-2" style={{ opacity: 0.8 }}>
            <span className="font-display text-xl font-black tracking-[0.35em] text-[#8B0000] uppercase">
              Classified
            </span>
          </div>
        </div>
      )}

      <div className="relative z-10 w-full max-w-2xl px-8 py-10">
        {/* Header rule */}
        <div className="flex items-center gap-4 mb-8 animate-fade-in-up">
          <div className="flex-1 h-px bg-[#C9A84C]/20" />
          <span className="font-mono text-[9px] font-bold tracking-[0.45em] text-[#C9A84C]/40">
            Field Operations Dossier
          </span>
          <div className="flex-1 h-px bg-[#C9A84C]/20" />
        </div>

        {/* Mission icon + title */}
        <div className="flex items-center gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="w-16 h-16 rounded-2xl border-[2.5px] border-[#C9A84C]/25 flex items-center justify-center text-3xl bg-[#0A0805]">
            {scenario.icon}
          </div>
          <div>
            <p className="font-mono text-[9px] text-[#C9A84C]/35 tracking-widest uppercase mb-1">
              {country} — Field Mission
            </p>
            <h1 className="font-display text-2xl font-bold text-[#F5F0E8] tracking-wider">
              {scenario.title}
            </h1>
          </div>
        </div>

        {/* Typewriter data lines */}
        <div className="space-y-2.5 mb-8 font-mono">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-3 text-sm leading-relaxed border-b border-[#C9A84C]/[0.06] pb-2.5">
              <span className="text-[#C9A84C]/30 shrink-0 w-36 text-[9px] tracking-widest uppercase pt-0.5">
                {line.label}
              </span>
              <span className="text-[#C9A84C]/30 text-xs">|</span>
              {line.stars ? (
                <span className="transition-opacity duration-500" style={{ opacity: showButton ? 1 : 0 }}>
                  <Stars count={line.stars} />
                </span>
              ) : (
                <TypewriterLine
                  text={line.value ?? ''}
                  delay={line.delay}
                  className={'font-medium ' + (line.highlight ? 'text-[#8B0000] font-bold tracking-widest' : 'text-[#D4C9A8]/80')}
                />
              )}
            </div>
          ))}
        </div>

        {/* Key phrases panel */}
        {keyPhrases.length > 0 && (
          <div
            className="mb-8 border border-[#C9A84C]/15 bg-[#0A0805] p-4 animate-fade-in-up"
            style={{ animationDelay: '2.4s' }}
          >
            <p className="font-mono text-[8px] text-[#C9A84C]/30 tracking-widest uppercase mb-3">
              Operational Vocabulary
            </p>
            <div className="grid grid-cols-2 gap-2">
              {keyPhrases.map((word, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[#C9A84C]/25 font-mono text-xs">›</span>
                  <span className="font-mono text-xs text-[#8B7355]">{word.en}</span>
                  <span className="font-display text-sm text-[#C9A84C] ml-1">{word.native ?? word.zh}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className={'flex gap-4 transition-all duration-500 ' + (showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')}>
          <button
            type="button"
            onClick={onCancel}
            className="btn-chunky flex-1 py-3.5 rounded-2xl bg-transparent border-[2.5px] border-[#3D2E0D] hover:border-[#C9A84C]/30 font-display text-sm font-bold text-[#5A4A2A] hover:text-[#C9A84C]/55 uppercase tracking-widest"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="btn-chunky flex-[2] py-3.5 rounded-2xl bg-[#8B0000]/15 border-[2.5px] border-[#8B0000]/55 hover:bg-[#8B0000]/25 font-display font-bold text-[#F5F0E8] uppercase tracking-widest animate-mission-glow"
          >
            Accept Mission
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 mt-8 animate-fade-in-up" style={{ animationDelay: '2.6s' }}>
          <div className="flex-1 h-px bg-[#C9A84C]/10" />
          <span className="font-mono text-[8px] text-[#C9A84C]/18 tracking-widest">
            UNAUTHORIZED ACCESS IS PROHIBITED
          </span>
          <div className="flex-1 h-px bg-[#C9A84C]/10" />
        </div>
      </div>
    </div>
  )
}

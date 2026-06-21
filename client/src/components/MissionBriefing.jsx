import { useState, useEffect } from 'react'
import { authFetch } from '../api'
import { COUNTRIES as LOCAL_COUNTRIES } from '../gameData'
import { getTheme } from '../dynamicTheme'

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
        <span key={i} className={i < count ? 'text-[#FFC800]' : 'text-gray-700'}>★</span>
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
        <span className="animate-pulse">▋</span>
      )}
    </span>
  )
}

export default function MissionBriefing({ scenario, country, onAccept, onCancel }) {
  const meta = SCENARIO_META[scenario.id] ?? {
    classification: 'CLASSIFIED', difficulty: 3, time: '10 min', location: 'UNKNOWN LOCATION',
  }
  const [showButton, setShowButton] = useState(false)
  const [typingDone, setTypingDone] = useState(false)
  const [targetWords, setTargetWords] = useState(null)
  const [isFetching, setIsFetching] = useState(true)

  const t = getTheme(country).terminal

  const totalTypingMs = 200 + 6 * 400
  
  useEffect(() => {
    const t = setTimeout(() => {
      setTypingDone(true)
    }, totalTypingMs + 600)
    return () => clearTimeout(t)
  }, [totalTypingMs])

  useEffect(() => {
    const langCode = LOCAL_COUNTRIES.find((c) => c.name === country)?.langCode || 'zh'
    authFetch(`/api/scenario/discovery?scenarioId=${scenario.id}&topic=${scenario.title}&langCode=${langCode}`)
      .then(res => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(data => {
        if (!data.words) throw new Error("No words returned");
        setTargetWords(data.words);
        setIsFetching(false);
      })
      .catch(err => {
        console.error("Discovery error", err);
        // Fallback
        setTargetWords(scenario.vocab.slice(0, 4));
        setIsFetching(false);
      });
  }, [scenario, country]);

  useEffect(() => {
    if (typingDone && !isFetching) {
      setShowButton(true);
    }
  }, [typingDone, isFetching]);

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
    <div className="fixed inset-0 z-40 bg-black flex items-center justify-center animate-overlay-fade">
      <div className={`absolute inset-0 ${t.bgLines} pointer-events-none`} />
      <div className={`absolute inset-0 ${t.bgRadial} pointer-events-none`} />

      <div className="relative z-10 w-full max-w-2xl px-8 py-10">
        {/* Header stamp */}
        <div className="flex items-center gap-4 mb-8 animate-fade-in-up">
          <div className={`flex-1 h-px ${t.bgAccent30}`} />
          <span className={`font-mono text-[10px] font-bold tracking-[0.4em] ${t.textAccent60}`}>
            CLASSIFIED DOSSIER
          </span>
          <div className={`flex-1 h-px ${t.bgAccent30}`} />
        </div>

        {/* Mission icon + title */}
        <div className="flex items-center gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className={`w-16 h-16 rounded-2xl ${t.iconBg} border ${t.borderAccent30} flex items-center justify-center text-3xl`}>
            {scenario.icon}
          </div>
          <div>
            <p className={`font-mono text-[10px] ${t.textAccent50} tracking-widest uppercase mb-1`}>{country} Mission</p>
            <h1 className={`font-mono text-3xl font-bold ${t.textAccent} tracking-wide`}>{scenario.title}</h1>
          </div>
        </div>

        {/* Typewriter lines */}
        <div className="space-y-3 mb-8 font-mono">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className={`${t.textAccent40} shrink-0 w-36 text-xs tracking-widest uppercase pt-0.5`}>
                {line.label}
              </span>
              <span className={`${t.textAccent80}`}>:</span>
              {line.stars ? (
                <TypewriterLine
                  text=""
                  delay={line.delay}
                  className={`text-base ${t.textAccent}`}
                />
              ) : line.redact ? (
                <TypewriterLine
                  text={line.value}
                  delay={line.delay}
                  className={`font-bold ${line.highlight ? t.highlight : t.textAccent}`}
                />
              ) : (
                <TypewriterLine
                  text={line.value}
                  delay={line.delay}
                  className={`font-medium ${line.highlight ? `${t.highlight} font-bold` : t.textAccent90}`}
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
          <div className={`mb-8 border ${t.borderAccent20} rounded-xl p-4 ${t.bgCard} animate-fade-in-up`} style={{ animationDelay: '2.4s' }}>
            <p className={`font-mono text-[10px] ${t.textAccent40} tracking-widest uppercase mb-3`}>Key Phrases to Master</p>
            <div className="grid grid-cols-2 gap-2">
              {keyPhrases.map((word, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`${t.textAccent30} font-mono text-xs`}>›</span>
                  <span className={`font-mono text-sm ${t.textAccent70}`}>{word.en}</span>
                  <span className={`font-mono text-sm ${t.textAccent} font-bold`}>{word.zh}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div
          className={'flex gap-4 transition-all duration-500 ' + (showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')}
        >
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 py-3.5 rounded-2xl bg-transparent border-2 ${t.borderAccent30} ${t.borderAccentHover60} font-mono font-bold ${t.textAccent50} ${t.textAccentHover80} uppercase tracking-widest transition-all`}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => onAccept(targetWords)}
            className={`flex-2 flex-grow-[2] py-3.5 rounded-2xl ${t.iconBg} border-2 ${t.borderAccent} ${t.bgAccent10} font-mono font-bold ${t.textAccent} uppercase tracking-widest transition-all ${getTheme(country).glow} ${getTheme(country).glowHover} animate-mission-glow`}
          >
            ▶ Accept Mission
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 mt-8 animate-fade-in-up" style={{ animationDelay: '2.6s' }}>
          <div className={`flex-1 h-px ${t.bgAccent20}`} />
          <span className={`font-mono text-[9px] ${t.textAccent25} tracking-widest`}>UNAUTHORIZED ACCESS IS PROHIBITED</span>
          <div className={`flex-1 h-px ${t.bgAccent20}`} />
        </div>
      </div>
    </div>
  )
}

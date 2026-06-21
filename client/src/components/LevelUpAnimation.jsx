import { useEffect, useRef, useState } from 'react'

function Counter({ from, to, duration = 900 }) {
  const [val, setVal] = useState(from)
  const rafRef = useRef(null)

  useEffect(() => {
    const start = performance.now()
    function step(now) {
      const p    = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 4)
      setVal(Math.round(from + (to - from) * ease))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    const t = setTimeout(() => { rafRef.current = requestAnimationFrame(step) }, 600)
    return () => { clearTimeout(t); cancelAnimationFrame(rafRef.current) }
  }, [from, to, duration])

  return <span>{val}</span>
}

function seededFraction(index, salt) {
  const value = Math.sin(index * 91.7 + salt * 37.3) * 10000
  return value - Math.floor(value)
}

export default function LevelUpAnimation({ oldLevel, newLevel, character, onDone }) {
  const [phase, setPhase] = useState('flash') // flash | text | done

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('text'), 350)
    const t2 = setTimeout(() => setPhase('done'), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useEffect(() => {
    if (phase === 'done') onDone?.()
  }, [phase, onDone])

  const particles = Array.from({ length: 24 }, (_, i) => ({
    angle: (i / 24) * 360,
    dist:  90 + seededFraction(i, 1) * 80,
    delay: seededFraction(i, 2) * 0.4,
    size:  4 + seededFraction(i, 3) * 6,
    color: ['#40DF01', '#FFC800', '#1CB0F6', '#FF4B4B', '#FFFFFF'][Math.floor(seededFraction(i, 4) * 5)],
  }))

  return (
    <div
      className={
        'fixed inset-0 z-50 flex items-center justify-center ' +
        (phase === 'flash' ? 'bg-white' : 'bg-[#05060a] animate-overlay-fade')
      }
      style={{ transition: 'background-color 0.35s ease' }}
    >
      {phase !== 'flash' && (
        <>
          {/* Scan lines */}
          <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(255,255,255,0.015)_3px,rgba(255,255,255,0.015)_4px)]" />

          {/* Particles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            {particles.map((p, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-particle"
                style={{
                  width:  p.size,
                  height: p.size,
                  background: p.color,
                  boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                  '--angle': `${p.angle}deg`,
                  '--dist':  `${p.dist}px`,
                  animationDelay: `${p.delay}s`,
                }}
              />
            ))}
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="text-7xl mb-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              {character?.icon ?? '⬆️'}
            </div>

            <div
              className="font-display text-[11px] font-extrabold uppercase tracking-[0.4em] text-white/30 mb-2 animate-fade-in-up"
              style={{ animationDelay: '0.2s' }}
            >
              {character?.type ?? 'Agent'}
            </div>

            <h1
              className="font-display font-extrabold uppercase tracking-widest text-white animate-fade-in-up"
              style={{ fontSize: 'clamp(3rem,8vw,5.5rem)', animationDelay: '0.25s', textShadow: '0 0 40px rgba(64, 223, 1,0.6), 0 0 80px rgba(64, 223, 1,0.3)' }}
            >
              Level Up
            </h1>

            <div className="flex items-center gap-5 mt-6 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <span className="font-display text-5xl font-extrabold text-gray-500 tabular-nums">{oldLevel}</span>
              <span className="text-2xl text-[#40DF01]">→</span>
              <span
                className="font-display text-6xl font-extrabold tabular-nums text-[#40DF01]"
                style={{ textShadow: '0 0 24px rgba(64, 223, 1,0.8)' }}
              >
                <Counter from={oldLevel} to={newLevel} />
              </span>
            </div>

            <p
              className="mt-4 text-sm text-gray-500 font-medium animate-fade-in-up"
              style={{ animationDelay: '0.6s' }}
            >
              Your {character?.type ?? 'agent'} skills are growing…
            </p>
          </div>
        </>
      )}
    </div>
  )
}

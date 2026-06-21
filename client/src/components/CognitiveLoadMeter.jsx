import { useEffect, useRef, useState } from 'react'

const R        = 44
const STROKE   = 7
const CIRC     = 2 * Math.PI * R
const CENTER   = 60

function getZone(score) {
  if (score < 40) return { label: 'Too Easy',    color: '#40DF01', ring: '#40DF01', tip: 'Increase difficulty' }
  if (score < 70) return { label: 'Optimal',     color: '#facc15', ring: '#facc15', tip: 'Stay in the zone'   }
  return               { label: 'Struggling',  color: '#ef4444', ring: '#ef4444', tip: 'Simplify'            }
}

export default function CognitiveLoadMeter({ score = 42, lastResponseMs = null, errorCount = 0, hintCount = 0 }) {
  const [displayed, setDisplayed] = useState(score)
  const prevRef  = useRef(score)
  const rafRef   = useRef(null)

  useEffect(() => {
    const from = prevRef.current
    const to   = score
    const start = performance.now()
    const dur   = 800

    cancelAnimationFrame(rafRef.current)

    function step(now) {
      const p = Math.min((now - start) / dur, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplayed(Math.round(from + (to - from) * ease))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
      else prevRef.current = to
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [score])

  const zone     = getZone(displayed)
  const pct      = displayed / 100
  const dashOffset = CIRC * (1 - pct)

  const metrics = [
    { label: 'Response', value: lastResponseMs ? `${(lastResponseMs / 1000).toFixed(1)}s` : '--' },
    { label: 'Errors',   value: errorCount   },
    { label: 'Hints',    value: hintCount    },
  ]

  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#1F2937]/80 backdrop-blur border-2 border-[#37464F] p-5 w-40 shadow-xl">
      <p className="font-display text-[9px] font-extrabold uppercase tracking-widest text-gray-500">Cognitive Load</p>

      <div className="relative">
        <svg width={CENTER * 2} height={CENTER * 2} className="-rotate-90">
          {/* Track */}
          <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke="#37464F" strokeWidth={STROKE} />
          {/* Progress */}
          <circle
            cx={CENTER} cy={CENTER} r={R}
            fill="none"
            stroke={zone.ring}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1), stroke 0.8s ease', filter: `drop-shadow(0 0 6px ${zone.ring})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-extrabold text-white tabular-nums">{displayed}</span>
          <span className="font-display text-[8px] font-bold uppercase tracking-wider" style={{ color: zone.color }}>
            {zone.label}
          </span>
        </div>
      </div>

      <p className="text-[9px] text-gray-500 text-center font-medium leading-tight">{zone.tip}</p>

      <div className="w-full space-y-1.5 mt-1">
        {metrics.map(m => (
          <div key={m.label} className="flex items-center justify-between">
            <span className="text-[9px] text-gray-600 font-bold uppercase tracking-wide">{m.label}</span>
            <span className="text-[9px] text-gray-400 font-bold tabular-nums">{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

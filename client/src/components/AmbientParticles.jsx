import { useMemo } from 'react'

const SEED = [0.12, 0.88, 0.34, 0.67, 0.23, 0.91, 0.45, 0.78, 0.56, 0.03,
              0.72, 0.19, 0.84, 0.41, 0.62, 0.07, 0.95, 0.28, 0.53, 0.16,
              0.74, 0.39, 0.81, 0.05, 0.48]

export default function AmbientParticles() {
  const particles = useMemo(() =>
    SEED.map((s, i) => ({
      id: i,
      left:     `${s * 96 + 2}%`,
      delay:    `${(s * 11).toFixed(2)}s`,
      duration: `${(7 + s * 9).toFixed(2)}s`,
      size:     1 + (i % 3),
      opacity:  (0.18 + (i % 5) * 0.07).toFixed(2),
    })),
  [])

  return (
    <div className="fixed inset-0 pointer-events-none z-[90] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-ember-float"
          style={{
            left: p.left,
            bottom: '-4px',
            width:  `${p.size}px`,
            height: `${p.size}px`,
            background: '#C9A84C',
            boxShadow: `0 0 ${p.size + 2}px ${p.size}px rgba(201,168,76,0.45)`,
            '--ember-start-opacity': p.opacity,
            animationDelay:    p.delay,
            animationDuration: p.duration,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  )
}

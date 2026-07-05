import { useEffect, useState } from 'react'
import { authFetch } from '../api'
import VisualCluster from './VisualCluster'
import InputPhase from './InputPhase'
import GameplayPhase from './GameplayPhase'
import { getCountryThemeStyle } from '../countryTheme'
import { COUNTRIES } from '../gameData'

function countryCodeForName(name) {
  return COUNTRIES.find((c) => c.name === name)?.code ?? null
}

const SHELL_CLASS = 'flex min-h-dvh w-screen flex-col items-center justify-center gap-4 overflow-y-auto bg-[var(--surface-bg)] bg-[linear-gradient(rgba(91,135,170,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.055)_1px,transparent_1px)] bg-[size:72px_72px] p-3 text-white font-display animate-fade-in-up sm:p-6'

// Orchestrates one scenario's lifecycle against the forward-chaining engine
// (docs/contracts/ai-module.md, node/routes/scenario.js): try to resume the
// clicked scenario, and if the chain engine hasn't generated it yet for this
// user, let it plan the real next one instead of forcing a specific id.
export default function ScenarioRunner({ scenario, langCode, country, isAdmin = false, onEndScenario }) {
  const [phase, setPhase] = useState('loading') // loading -> input -> gameplay -> chain-complete -> error
  const [firstTurn, setFirstTurn] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const countryCode = countryCodeForName(country)

  useEffect(() => {
    let cancelled = false

    async function requestTurn(body) {
      return authFetch('/api/scenario/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    async function start() {
      try {
        let res = await requestTurn({ countryCode, scenarioId: scenario.id, priorTurns: [], turnIndex: 0 })
        if (res.status === 400) {
          // Not generated yet for this user — the chain plans the real next one.
          res = await requestTurn({ countryCode, priorTurns: [], turnIndex: 0 })
        }
        if (!res.ok) throw new Error('Unable to start scenario')
        const data = await res.json()
        if (cancelled) return
        if (data.chainComplete && !data.scenario) {
          setPhase('chain-complete')
          return
        }
        setFirstTurn(data)
        setPhase('input')
      } catch (err) {
        if (cancelled) return
        console.error('Scenario start error', err)
        setErrorMessage('Could not reach the mission briefing. Check your connection and try again.')
        setPhase('error')
      }
    }

    start()
    return () => { cancelled = true }
  }, [scenario.id, countryCode])

  if (phase === 'loading') {
    return <VisualCluster targetWords={[]} country={country} />
  }

  if (phase === 'error') {
    return (
      <div style={getCountryThemeStyle(country)} className={SHELL_CLASS}>
        <p className="max-w-sm text-center text-sm font-medium text-slate-300">{errorMessage}</p>
        <button
          type="button"
          onClick={() => onEndScenario()}
          className="rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] px-6 py-3 font-display text-sm font-extrabold uppercase tracking-widest text-[var(--accent-ink)]"
        >
          Back to Missions
        </button>
      </div>
    )
  }

  if (phase === 'chain-complete') {
    return (
      <div style={getCountryThemeStyle(country)} className={SHELL_CLASS}>
        <p className="max-w-sm text-center text-lg font-bold text-[var(--accent-soft)]">Every situation here is covered — you&rsquo;ve gone native.</p>
        <button
          type="button"
          onClick={() => onEndScenario()}
          className="rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] px-6 py-3 font-display text-sm font-extrabold uppercase tracking-widest text-[var(--accent-ink)]"
        >
          Back to Missions
        </button>
      </div>
    )
  }

  if (phase === 'input') {
    return (
      <div style={getCountryThemeStyle(country)} className={SHELL_CLASS}>
        <InputPhase words={firstTurn.targetWords} langCode={langCode} onComplete={() => setPhase('gameplay')} />
      </div>
    )
  }

  return (
    <div style={getCountryThemeStyle(country)} className="h-dvh w-screen overflow-hidden bg-[var(--surface-bg)] bg-[linear-gradient(rgba(91,135,170,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.055)_1px,transparent_1px)] bg-[size:72px_72px] font-display">
      <GameplayPhase
        scenario={scenario}
        countryCode={countryCode}
        langCode={langCode}
        firstTurn={firstTurn}
        isAdmin={isAdmin}
        onEndScenario={onEndScenario}
      />
    </div>
  )
}

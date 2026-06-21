import { useEffect, useRef, useState } from 'react'
import { AGENT_AVATARS, CHARACTERS, COUNTRY_THEMES, SCENARIOS_BY_COUNTRY, SPECIAL_SCENARIO_BY_COUNTRY, levelForCompleted } from './gameData'
import MissionBriefing from './components/MissionBriefing'

const GOLD = '#FFC93C'

function ProgressBar({ progress, accent }) {
  return (
    <div className="relative h-2.5 w-full bg-[#15203F] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${progress}%`, background: accent, boxShadow: progress > 0 ? `0 0 8px ${accent}aa` : 'none' }}
      />
    </div>
  )
}

const CARD_ROTATIONS = ['-1deg', '0.8deg', '-0.6deg', '1deg', '-0.7deg', '0.5deg', '-0.9deg', '0.7deg']

function ScenarioCard({ scenario, unlocked, progress, completed, index, onClick, accent = GOLD }) {
  const isSpecial = Boolean(scenario.special)
  const rotation = isSpecial ? '0deg' : CARD_ROTATIONS[index % CARD_ROTATIONS.length]
  const borderColor = isSpecial ? GOLD : (unlocked ? accent : '#2A3760')

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!unlocked}
      style={{
        animationDelay: `${index * 60}ms`,
        transform: `rotate(${rotation})`,
        borderColor,
        boxShadow: unlocked ? '0 7px 0 0 rgba(0,0,0,0.32)' : 'none',
      }}
      className={
        'group relative animate-fade-in-up text-left rounded-3xl border-4 bg-[#2C3A63] p-5 transition-all duration-200 ease-out ' +
        (unlocked
          ? 'hover:[transform:rotate(0deg)_translateY(-8px)_scale(1.02)] active:translate-y-0 cursor-pointer'
          : 'opacity-60 cursor-not-allowed')
      }
    >
      {/* icon tile */}
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl mb-4"
        style={{ background: isSpecial ? GOLD : accent + '33', border: `3px solid ${isSpecial ? GOLD : accent}` }}
      >
        {isSpecial ? '👑' : scenario.icon}
      </div>

      <h3 className="font-display text-base font-extrabold mb-1 text-white leading-snug">
        {scenario.title}
      </h3>
      <p className="font-display text-xs font-semibold text-sky-200/60 leading-snug mb-4 min-h-[2.5rem]">
        {scenario.description}
      </p>

      <div className="flex items-center gap-3">
        <ProgressBar progress={progress} accent={isSpecial ? GOLD : accent} />
        <span className="font-display text-[11px] font-bold tabular-nums text-sky-200/60 shrink-0">{progress}%</span>
      </div>

      {/* completed badge */}
      {completed && (
        <div className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-[#58CC02] border-4 border-[#243154] flex items-center justify-center text-white font-black">
          ✓
        </div>
      )}

      {/* locked overlay */}
      {!unlocked && (
        <div className="absolute inset-0 rounded-3xl flex flex-col items-center justify-center gap-2 bg-[#101A38]/82">
          <span className="text-4xl">🔒</span>
          <span className="font-display text-xs font-extrabold uppercase tracking-wide text-sky-200/75">
            {isSpecial ? 'Final Boss' : 'Locked'}
          </span>
          {isSpecial && (
            <span className="font-display text-[10px] font-semibold text-sky-200/50">Complete all missions</span>
          )}
        </div>
      )}
    </button>
  )
}

function VocabModal({ scenario, onClose, onStart, accent = GOLD }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0D1530]/80 backdrop-blur-sm z-20 animate-overlay-fade px-4">
      <div
        className="animate-modal-pop relative w-[28rem] max-w-full max-h-[85vh] overflow-y-auto rounded-3xl border-4 p-7"
        style={{ background: '#1E2A4F', borderColor: accent, boxShadow: '0 10px 0 0 rgba(0,0,0,0.35)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-5 text-sky-200/50 hover:text-white transition-colors text-2xl leading-none font-bold"
          aria-label="Close"
        >
          &times;
        </button>

        <div className="flex items-center gap-3 mb-5">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl shrink-0"
            style={{ background: scenario.special ? GOLD : accent + '33', border: `3px solid ${scenario.special ? GOLD : accent}` }}
          >
            {scenario.special ? '👑' : scenario.icon}
          </span>
          <div>
            <h3 className="font-display text-xl font-black text-white">{scenario.title}</h3>
            <p className="font-display text-xs font-semibold text-sky-200/60">{scenario.description}</p>
          </div>
        </div>

        <p className="font-display text-[11px] font-extrabold uppercase tracking-wide text-sky-200/50 mb-2.5">📚 Key Vocabulary</p>
        <ul className="flex flex-col gap-2 mb-6">
          {scenario.vocab.map((word) => (
            <li key={word.en} className="flex items-center justify-between gap-3 rounded-xl bg-[#28365E] px-4 py-2.5">
              <span className="font-display text-sm font-semibold text-sky-200/80">{word.en}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-lg font-black text-white">{word.native ?? word.zh}</span>
                <span className="font-display text-xs font-bold italic" style={{ color: accent }}>{word.roman ?? word.pinyin}</span>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onStart}
          className="w-full py-3.5 rounded-2xl bg-[#FFC93C] text-[#3A2E0A] border-4 border-[#E0A91E] font-display font-black uppercase tracking-wide shadow-[0_5px_0_0_#B8860B] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_#B8860B] transition-all"
        >
          Start Mission →
        </button>
      </div>
    </div>
  )
}

function CharacterBadge({ country, progress }) {
  const character = CHARACTERS[country] ?? CHARACTERS.China
  const completedCount = progress.filter((p) => p >= 100).length
  const level = levelForCompleted(completedCount)
  const prevLevelRef = useRef(level)
  const [justLeveledUp, setJustLeveledUp] = useState(false)

  useEffect(() => {
    if (level > prevLevelRef.current) {
      setJustLeveledUp(true)
      const timeout = setTimeout(() => setJustLeveledUp(false), 700)
      prevLevelRef.current = level
      return () => clearTimeout(timeout)
    }
    prevLevelRef.current = level
  }, [level])

  return (
    <div
      className={
        'flex items-center gap-2.5 bg-[#22305C] rounded-2xl border-4 border-[#34457C] pl-2 pr-4 py-1.5 shadow-[0_5px_0_0_rgba(0,0,0,0.35)] '
        + (justLeveledUp ? 'animate-level-up' : '')
      }
    >
      <img src={AGENT_AVATARS[country]} alt={`${country} agent`} className="w-10 h-10 drop-shadow-lg shrink-0" />
      <span className="font-display text-sm font-bold text-sky-100">
        {character.type}{' '}
        <span className="font-black" style={{ color: GOLD }}>Lv {level}</span>
      </span>
    </div>
  )
}

export default function ScenariosPage({ country = 'China', progress, onBack, onScenarioStart }) {
  const [activeScenario, setActiveScenario]   = useState(null)
  const [missionScenario, setMissionScenario] = useState(null)

  const scenarios = SCENARIOS_BY_COUNTRY[country] ?? []
  const specialScenario = SPECIAL_SCENARIO_BY_COUNTRY[country]
  const hasScenarios = scenarios.length > 0
  const allCompleted = hasScenarios && progress.every((p) => p >= 100)

  const theme = COUNTRY_THEMES[country] ?? COUNTRY_THEMES.China
  const accent = theme.accents[0]

  function isUnlocked(index) {
    return index === 0 || progress[index - 1] >= 100
  }

  function handleCardClick(scenario, unlocked) {
    if (!unlocked) return
    setActiveScenario(scenario)
  }

  function handleStartScenario() {
    const scenario = activeScenario
    if (!scenario) return
    setActiveScenario(null)
    setMissionScenario(scenario)
  }

  function handleAcceptMission() {
    const scenario = missionScenario
    setMissionScenario(null)
    onScenarioStart?.(scenario)
  }

  return (
    <div
      className="relative w-screen h-screen overflow-y-auto overflow-x-hidden text-white font-sans"
      style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 0%, #1E2C5A 0%, #131D3B 60%, #0D1530 100%)' }}
    >
      {/* soft per-country accent glow at the top */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 55% 30% at 50% 0%, ${accent}22, transparent 70%)` }}
      />

      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 bg-[#22305C] rounded-2xl border-4 border-[#34457C] px-4 py-2.5 font-display font-extrabold text-sm text-sky-100 shadow-[0_5px_0_0_rgba(0,0,0,0.35)] hover:-translate-y-0.5 active:translate-y-0.5 transition-transform"
        >
          ← Globe
        </button>

        <div className="flex items-center gap-3">
          <img src={AGENT_AVATARS[country]} alt={`${country} agent`} className="w-16 h-16 drop-shadow-2xl shrink-0" />
          <div>
            <h1 className="font-display text-3xl font-black text-white leading-none">{country}</h1>
            <p className="font-display text-xs font-bold tracking-wide mt-1" style={{ color: GOLD }}>
              Choose your mission!
            </p>
          </div>
        </div>

        <CharacterBadge country={country} progress={progress} />
      </header>

      <main className="relative z-10 px-8 py-8 pb-20">
        {hasScenarios ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {scenarios.map((scenario, index) => {
              const unlocked = isUnlocked(index)
              return (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  index={index}
                  unlocked={unlocked}
                  progress={progress[index]}
                  completed={progress[index] >= 100}
                  accent={accent}
                  onClick={() => handleCardClick(scenario, unlocked)}
                />
              )
            })}
            {specialScenario && (
              <ScenarioCard
                scenario={specialScenario}
                index={scenarios.length}
                unlocked={allCompleted}
                progress={0}
                completed={false}
                accent={accent}
                onClick={() => handleCardClick(specialScenario, allCompleted)}
              />
            )}
          </div>
        ) : (
          <div className="max-w-md mx-auto text-center py-24">
            <p className="font-display text-base font-bold text-sky-200/60">
              Missions for {country} are coming soon! 🚧
            </p>
          </div>
        )}
      </main>

      {activeScenario && (
        <VocabModal
          scenario={activeScenario}
          onClose={() => setActiveScenario(null)}
          onStart={handleStartScenario}
          accent={accent}
        />
      )}

      {missionScenario && (
        <MissionBriefing
          scenario={missionScenario}
          country={country}
          onAccept={handleAcceptMission}
          onCancel={() => setMissionScenario(null)}
        />
      )}
    </div>
  )
}

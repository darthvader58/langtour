import { useEffect, useRef, useState } from 'react'
import { CHARACTERS, SCENARIOS_BY_COUNTRY, SPECIAL_SCENARIO_BY_COUNTRY, levelForCompleted } from './gameData'
import MissionBriefing from './components/MissionBriefing'
import SackboyCharacter from './components/SackboyCharacter'

function LockIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CrownIcon({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <defs>
        <linearGradient id="crownGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8C547" />
          <stop offset="55%" stopColor="#C9A84C" />
          <stop offset="100%" stopColor="#8B6914" />
        </linearGradient>
      </defs>
      <path
        d="M3 8l3.5 3L12 4l5.5 7L21 8l-2 10H5L3 8z"
        fill="url(#crownGold)"
        stroke="#6B4C0A"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HudProgressBar({ progress, gold }) {
  return (
    <div className="relative h-1 w-full bg-[#1A1208] border border-[#3D2E0D]/50 overflow-hidden">
      <div
        className="h-full transition-all duration-500"
        style={{
          width: `${progress}%`,
          background: gold
            ? 'linear-gradient(90deg, #8B6914, #C9A84C, #E8C547)'
            : 'linear-gradient(90deg, #8B6914, #C9A84C)',
          boxShadow: `0 0 4px rgba(201,168,76,${gold ? '0.7' : '0.4'})`,
        }}
      />
    </div>
  )
}

const CARD_ROTATIONS = ['-0.8deg', '0.6deg', '-0.4deg', '0.9deg', '-0.5deg', '0.3deg', '-0.7deg', '0.5deg']

function ScenarioCard({ scenario, unlocked, progress, completed, index, onClick }) {
  const isSpecial = Boolean(scenario.special)
  const rotation = isSpecial ? '0deg' : CARD_ROTATIONS[index % CARD_ROTATIONS.length]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!unlocked}
      style={{ animationDelay: `${index * 70}ms`, transform: `rotate(${rotation})` }}
      className={
        'group relative animate-fade-in-up text-left transition-all duration-200 overflow-hidden rounded-[22px] ' +
        'bg-[linear-gradient(160deg,_#1A1408_0%,_#100D06_65%,_#0D0A04_100%)] ' +
        (isSpecial
          ? 'border-[2.5px] border-[#C9A84C]/45 shadow-[2px_5px_16px_rgba(0,0,0,0.7),_inset_0_1px_0_rgba(201,168,76,0.08)] '
            + (unlocked ? 'hover:scale-[1.03] hover:[transform:rotate(0deg)_scale(1.03)] cursor-pointer' : '')
          : 'border-[2.5px] border-[#3D2E0D]/55 shadow-[2px_5px_16px_rgba(0,0,0,0.6)] '
            + (unlocked
              ? 'hover:border-[#C9A84C]/35 hover:scale-[1.03] hover:[transform:rotate(0deg)_scale(1.03)] cursor-pointer'
              : 'cursor-not-allowed'))
      }
    >
      {/* Parchment line texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(201,168,76,0.1) 3px, rgba(201,168,76,0.1) 4px)' }}
      />

      {/* Scenario bg animation */}
      {!isSpecial && <div className={`scenario-bg scenario-bg--${scenario.id}`} />}

      {/* Card content */}
      <div className={`relative z-10 p-5 ${unlocked ? '' : 'opacity-45 grayscale'}`}>
        <div className={
          'flex h-12 w-12 items-center justify-center text-2xl mb-4 rounded-2xl '
          + (isSpecial ? 'border-[2.5px] border-[#C9A84C]/35 bg-[#C9A84C]/08' : 'border-[2.5px] border-[#3D2E0D] bg-[#0D0A04]')
        }>
          {isSpecial ? <CrownIcon /> : <span>{scenario.icon}</span>}
        </div>

        <h3 className="font-display text-sm font-bold mb-1.5 text-[#F5F0E8] tracking-wide leading-snug">
          {scenario.title}
        </h3>
        <p className="font-mono text-xs text-[#6B5535] leading-snug mb-4 min-h-[2.5rem]">
          {scenario.description}
        </p>

        <div className="flex items-center justify-between gap-3">
          <HudProgressBar progress={progress} gold={isSpecial} />
          <span className="font-mono text-[9px] tabular-nums text-[#4A3A15] shrink-0">{progress}%</span>
        </div>
      </div>

      {/* Completed seal — gold coin */}
      {completed && (
        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(201,168,76,0.5)]"
          style={{ background: 'radial-gradient(circle at 35% 30%, #E8C547, #8B6914)' }}
        >
          <span className="text-[#0D0A04] text-[10px] font-bold">✓</span>
        </div>
      )}

      {/* Wax seal for unlocked + not done */}
      {unlocked && !completed && (
        <div
          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full animate-wax-pulse"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #dc2626, #7f1d1d)',
            boxShadow: '0 0 0 1px rgba(139,0,0,0.5)',
          }}
        />
      )}

      {/* Locked overlay */}
      {!unlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0D0A04]/80 z-20">
          <LockIcon className="w-5 h-5 text-[#3D2E0D]" />
          <div className="transform -rotate-8 border border-[#8B0000]/50 px-4 py-1">
            <span className="font-display text-[10px] font-bold tracking-[0.3em] text-[#8B0000] uppercase">
              {isSpecial ? 'Classified' : 'Locked'}
            </span>
          </div>
          {isSpecial && (
            <span className="font-mono text-[8px] text-[#4A2020] tracking-widest text-center px-6">
              Complete all scenarios
            </span>
          )}
        </div>
      )}
    </button>
  )
}

function VocabModal({ scenario, onClose, onStart }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-auto animate-overlay-fade z-20">
      <div className="animate-modal-pop w-[28rem] max-h-[85vh] overflow-y-auto bg-[#0D0B06] rounded-[26px] border-[3px] border-[#C9A84C]/28 p-7 shadow-[0_0_60px_rgba(0,0,0,0.9)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-[#3D2E0D] hover:text-[#C9A84C]/50 transition-colors text-xl leading-none font-bold"
          aria-label="Close"
        >
          &times;
        </button>

        <div className="flex items-center gap-3 mb-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-[2.5px] border-[#C9A84C]/25 bg-[#0A0805] text-2xl">{scenario.special ? '\u{1F451}' : scenario.icon}</span>
          <div>
            <h3 className="font-display text-xl font-bold text-[#F5F0E8] tracking-wide">{scenario.title}</h3>
            <p className="font-mono text-xs text-[#5A4A2A]">{scenario.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 mb-4">
          <div className="flex-1 h-px bg-[#C9A84C]/15" />
          <h4 className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-[#C9A84C]/35">
            Key Vocabulary
          </h4>
          <div className="flex-1 h-px bg-[#C9A84C]/15" />
        </div>

        <ul className="flex flex-col gap-2 mb-6">
          {scenario.vocab.map((word) => (
            <li
              key={word.en}
              className="flex items-center justify-between gap-3 border border-[#3D2E0D]/50 bg-[#0A0805] px-4 py-2.5"
            >
              <span className="font-mono text-xs text-[#8B7355]">{word.en}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-lg font-bold text-[#F5F0E8]">{word.zh}</span>
                <span className="font-mono text-xs text-[#C9A84C]/60 italic">{word.pinyin}</span>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onStart}
          className="btn-chunky w-full py-3 rounded-2xl border-[2.5px] border-[#C9A84C]/50 bg-[#C9A84C]/10 hover:bg-[#C9A84C]/18 font-display font-bold text-[#C9A84C] uppercase tracking-widest"
        >
          Start Scenario
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
        'flex items-center gap-2 bg-[#0D0B06] rounded-2xl border-[2.5px] border-[#C9A84C]/30 pl-2 pr-4 py-1.5 '
        + (justLeveledUp ? 'animate-level-up' : '')
      }
    >
      <SackboyCharacter country={country} size={36} state="wave" className="shrink-0" />
      <span className="font-mono text-sm text-[#8B7355]">
        {character.type}{' '}
        <span className="font-display font-bold text-[#C9A84C]">Lv {level}</span>
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
    <div className="relative w-screen h-screen overflow-y-auto overflow-x-hidden bg-[#0A0A0A] text-[#F5F0E8] font-mono">
      {/* Cartographic grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(201,168,76,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_55%,_rgba(0,0,0,0.6)_100%)]" />

      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-[#C9A84C]/10">
        <button
          type="button"
          onClick={onBack}
          className="btn-chunky flex items-center gap-2 bg-transparent rounded-2xl border-[2.5px] border-[#3D2E0D] hover:border-[#C9A84C]/35 px-4 py-2 font-display font-bold text-sm text-[#5A4A2A] hover:text-[#C9A84C]/60 uppercase tracking-wider"
        >
          <BackIcon />
          <span>Globe</span>
        </button>

        <div className="flex items-center gap-3">
          <SackboyCharacter country={country} size={56} state="wave" className="shrink-0" />
          <div>
            <h1 className="font-display text-2xl font-bold text-[#F5F0E8] tracking-wider">{country}</h1>
            <p className="font-mono text-[9px] text-[#C9A84C]/35 uppercase tracking-[0.3em]">Field Operations</p>
          </div>
        </div>

        <CharacterBadge country={country} progress={progress} />
      </header>

      <main className="relative z-10 px-8 py-8 pb-16">
        {hasScenarios ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
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
                onClick={() => handleCardClick(specialScenario, allCompleted)}
              />
            )}
          </div>
        ) : (
          <div className="max-w-md mx-auto text-center py-24">
            <p className="font-mono text-sm text-[#3D2E0D]">
              Scenarios for {country} are pending clearance.
            </p>
          </div>
        )}
      </main>

      {activeScenario && (
        <VocabModal
          scenario={activeScenario}
          onClose={() => setActiveScenario(null)}
          onStart={handleStartScenario}
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

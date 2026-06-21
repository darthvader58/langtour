import { useState } from 'react'
import MissionBriefing from './components/MissionBriefing'
import { getTheme } from './dynamicTheme'
import { ICON_MAP } from './iconMap'

function LockIcon({ className = 'w-6 h-6' }) {
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



function ProgressBar({ progress, gold, theme }) {
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full ${theme.bgPanel} border-2 ${theme.border}`}>
      <div
        className={`h-full ${gold ? 'bg-[#FFC800]' : theme.bgAccent} transition-all duration-500 ease-out`}
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

function ScenarioCard({ scenario, index, unlocked, progress, completed, onClick, theme }) {
  const isSpecial = Boolean(scenario.special)
  const IconComponent = ICON_MAP[scenario.icon] || ICON_MAP.Crown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        `group relative flex flex-col items-start overflow-hidden rounded-3xl border-2 p-6 text-left transition-all ` +
        (unlocked
          ? `${theme.bgPanel} ${theme.border} ${theme.borderHover} ${theme.glowHover} hover:-translate-y-1 hover:shadow-xl`
          : `bg-black/30 border-[#1a222a] cursor-not-allowed`) +
        (completed ? ` border-[#37464F] opacity-70` : '') +
        (isSpecial && unlocked ? ' animate-country-glow' : '')
      }
    >
      <div className={unlocked ? '' : 'opacity-40 grayscale'}>
        <div
          className={
            'flex h-12 w-12 items-center justify-center rounded-2xl mb-4 ' +
            (isSpecial ? 'bg-[#FFC800]/20 text-[#FFC800]' : 'bg-[#2B4022] text-[#40DF01]')
          }
        >
          <IconComponent className="w-7 h-7" />
        </div>

        <h3 className={`${theme.font} text-lg font-extrabold mb-1.5 ${theme.textPrimary}`}>
          {scenario.title}
        </h3>
        <p className={`text-sm ${theme.textSecondary} font-medium leading-snug mb-4 min-h-[2.5rem]`}>
          {scenario.description}
        </p>

        <div className="flex items-center justify-between gap-3">
          <ProgressBar progress={progress} gold={isSpecial} theme={theme} />
          <span className={`text-[11px] tabular-nums ${theme.textSecondary} font-bold shrink-0`}>{progress}%</span>
        </div>
      </div>

      {completed && (
        <span className={`absolute top-3 right-3 text-[10px] font-extrabold uppercase tracking-wide ${theme.textPrimary} ${theme.bgAccent} rounded-full px-2 py-0.5`}>
          Done
        </span>
      )}

      {!unlocked && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl ${theme.bgPanel}/90 backdrop-blur-sm cursor-not-allowed`}>
          <LockIcon className={'w-7 h-7 ' + (isSpecial ? 'text-[#FFC800]' : 'text-gray-600')} />
          <span
            className={
              'text-[11px] font-extrabold uppercase tracking-widest ' + (isSpecial ? 'text-[#FFC800]' : 'text-gray-600')
            }
          >
            {isSpecial ? 'Complete all scenarios' : 'Locked'}
          </span>
        </div>
      )}
    </button>
  )
}

function LessonModal({ scenario, onClose, onStart, theme }) {
  const IconComponent = ICON_MAP[scenario.icon] || ICON_MAP.Crown;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-auto animate-overlay-fade z-20">
      <div className={`animate-modal-pop w-[28rem] max-h-[85vh] overflow-y-auto rounded-3xl ${theme.bgPanel} border-2 ${theme.border} p-7 shadow-2xl`}>
        <button
          type="button"
          onClick={onClose}
          className={`absolute top-5 right-5 ${theme.textSecondary} hover:${theme.textPrimary} transition-colors text-2xl leading-none font-bold`}
          aria-label="Close"
        >
          &times;
        </button>

        <div className={`flex items-center gap-3 mb-2 ${theme.textPrimary}`}>
          <IconComponent className="w-8 h-8" strokeWidth={1.5} />
          <div>
            <h3 className={`${theme.font} text-xl font-extrabold ${theme.textPrimary}`}>{scenario.title}</h3>
            <p className={`text-xs ${theme.textSecondary} font-medium`}>{scenario.description}</p>
          </div>
        </div>

        <h4 className={`${theme.font} text-xs font-extrabold uppercase tracking-widest ${theme.textSecondary} mt-6 mb-3`}>
          Key Vocabulary
        </h4>
        <ul className="flex flex-col gap-2 mb-6">
          {scenario.vocab.map((word) => (
            <li
              key={word.en}
              className={`flex items-center justify-between gap-3 rounded-2xl bg-black/20 border-2 ${theme.border} px-4 py-2.5`}
            >
              <span className={`text-sm ${theme.textSecondary} font-semibold`}>{word.en}</span>
              <span className="flex items-baseline gap-2">
                <span className={`${theme.font} text-lg font-bold ${theme.textPrimary}`}>{word.zh}</span>
                <span className={`text-xs ${theme.textAccent} font-bold italic`}>{word.pinyin}</span>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onStart}
          className={`flex h-[46px] w-full items-center justify-center rounded-2xl border-2 ${theme.borderAccent} ${theme.bgAccent} ${theme.bgAccentHover} px-4 ${theme.font} text-sm font-extrabold uppercase tracking-widest ${theme.textPrimary} transition-all shadow-md`}
        >
          Start Scenario
        </button>
      </div>
    </div>
  )
}

export default function ScenariosPage({ country = 'China', code = 'cn', completedScenarios = [], scenarios, specialScenario, onBack, onScenarioStart }) {
  const progress = scenarios.map(sc => completedScenarios.includes(sc.id) ? 100 : 0)
  const [activeScenario, setActiveScenario] = useState(null)
  const [missionScenario, setMissionScenario] = useState(null)
  const theme = getTheme(country)

  const allCompleted = progress.every((p) => p >= 100)
  const completedCount = progress.filter((p) => p >= 100).length

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

  function handleAcceptMission(targetWords) {
    const scenario = missionScenario
    setMissionScenario(null)
    onScenarioStart?.(scenario, targetWords)
  }

  return (
    <div className={`relative w-screen h-screen overflow-y-auto overflow-x-hidden ${theme.bgApp} ${theme.textPrimary} ${theme.font}`}>
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <button
          type="button"
          onClick={onBack}
          className={`flex h-[46px] items-center justify-center gap-2 rounded-2xl border-2 ${theme.border} ${theme.bgPanel} hover:bg-black/20 px-4 text-sm font-extrabold uppercase tracking-widest ${theme.textSecondary} transition-all shadow-md`}
        >
          <BackIcon />
          <span>Back to Globe</span>
        </button>

        <div className="flex items-center gap-4">
          <img src={`https://flagcdn.com/${code ?? 'cn'}.svg`} alt={country} className="w-10 rounded shadow-sm" />
          <div>
            <h1 className="text-2xl font-extrabold text-white">{country}</h1>
            <p className={`text-[11px] ${theme.textSecondary} font-bold uppercase tracking-[0.2em]`}>Choose a Scenario</p>
          </div>
        </div>

        <div className={`flex h-[46px] items-center justify-center rounded-2xl border-2 ${theme.border} ${theme.bgPanel} px-4 text-sm font-extrabold uppercase tracking-widest shadow-md tabular-nums`}>
          <span className={`${theme.textAccent} mr-1`}>
            {completedCount}/{scenarios.length}
          </span>
          <span className={theme.textSecondary}>
            COMPLETED
          </span>
        </div>
      </header>

      <main className="relative z-10 px-8 pb-16">
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
                onClick={() => handleCardClick(scenario, unlocked)}
                theme={theme}
              />
            )
          })}
          {specialScenario && (() => {
            const specialDone = completedScenarios.includes(specialScenario.id)
            return (
              <ScenarioCard
                scenario={specialScenario}
                index={scenarios.length}
                unlocked={allCompleted}
                progress={specialDone ? 100 : 0}
                completed={specialDone}
                onClick={() => handleCardClick(specialScenario, allCompleted && !specialDone)}
                theme={theme}
              />
            )
          })()}
        </div>
      </main>

      {activeScenario && (
        <LessonModal
          scenario={activeScenario}
          onClose={() => setActiveScenario(null)}
          onStart={handleStartScenario}
          theme={theme}
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

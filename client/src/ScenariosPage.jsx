import { useState } from 'react'
import ToyIcon from './components/ToyIcon'
import MissionBriefing from './components/MissionBriefing'
import { getCountryThemeStyle } from './countryTheme'

function LockIcon({ className = 'w-6 h-6' }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
}

function BackIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 19-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function ProgressBar({ progress, gold }) {
  return <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/[0.06] bg-[#07101d]"><div className={'h-full rounded-full transition-all duration-500 ' + (gold ? 'bg-[#ffd166]' : 'bg-[var(--accent)]')} style={{ width: `${progress}%` }} /></div>
}

function ScenarioCard({ scenario, unlocked, progress, completed, index, onClick }) {
  const isSpecial = Boolean(scenario.special)
  return (
    <button type="button" onClick={onClick} disabled={!unlocked} style={{ animationDelay: `${index * 70}ms` }} className={'group relative min-h-[15rem] animate-fade-in-up overflow-hidden rounded-[1.5rem] border p-5 text-left shadow-[0_18px_45px_rgba(0,0,0,.22)] transition-all duration-200 sm:min-h-[18rem] sm:rounded-[1.75rem] sm:p-6 ' + (isSpecial ? 'border-[#ffd166]/45 bg-gradient-to-br from-[#312512] to-[#101928] ' + (unlocked ? 'hover:-translate-y-1 hover:border-[#ffd166]/75' : '') : 'bg-gradient-to-br from-[#102239]/95 to-[#0a1626]/95 ' + (unlocked ? 'cursor-pointer border-white/10 hover:-translate-y-1 hover:border-[var(--accent-55)] hover:shadow-[0_24px_60px_rgba(0,0,0,.35)]' : 'cursor-not-allowed border-white/[0.07]'))}>
      <div className={unlocked ? '' : 'opacity-40'}>
        <div className={'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border text-3xl shadow-inner sm:mb-5 sm:h-16 sm:w-16 sm:text-4xl ' + (isSpecial ? 'border-[#ffd166]/30 bg-[#ffd166]/10' : 'border-[var(--accent-25)] bg-[#07101d]')}>
          {isSpecial ? <ToyIcon name="crown" size={36} className="text-[#ffd166]" /> : scenario.icon}
        </div>
        <h3 className="mb-2 font-display text-lg font-extrabold text-white sm:text-xl">{scenario.title}</h3>
        <p className="mb-5 min-h-[3rem] text-sm font-medium leading-relaxed text-slate-400 sm:mb-6 sm:min-h-[3.5rem]">{scenario.description}</p>
        <div className="flex items-center justify-between gap-3"><ProgressBar progress={progress} gold={isSpecial} /><span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500">{progress}%</span></div>
      </div>
      {completed && <span className="absolute right-4 top-4 rounded-full border border-[var(--accent-30)] bg-[var(--accent-15)] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest text-[var(--accent-soft)]">Done</span>}
      {!unlocked && <div className="absolute inset-0 flex cursor-not-allowed flex-col items-center justify-center gap-2 rounded-[1.75rem] bg-[#081422]/88 backdrop-blur-sm"><LockIcon className={'h-7 w-7 ' + (isSpecial ? 'text-[#ffd166]' : 'text-slate-600')} /><span className={'text-[10px] font-extrabold uppercase tracking-[.16em] ' + (isSpecial ? 'text-[#ffd166]' : 'text-slate-600')}>{isSpecial ? 'Complete all scenarios' : 'Locked'}</span></div>}
    </button>
  )
}

function LessonModal({ scenario, onClose, onStart }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#02060d]/75 p-3 pointer-events-auto animate-overlay-fade backdrop-blur-md sm:p-4">
      <div className="relative animate-modal-pop w-full max-w-[30rem] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[1.5rem] border border-white/10 bg-[#0b1727] p-5 shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:max-h-[85vh] sm:rounded-[1.8rem] sm:p-7">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 text-slate-500 transition-colors hover:text-white" aria-label="Close"><ToyIcon name="close" size={22} /></button>
        <div className="mb-2 flex items-center gap-4 pr-8">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--accent-25)] bg-[#07101d] text-3xl">{scenario.special ? <ToyIcon name="crown" size={31} className="text-[#ffd166]" /> : scenario.icon}</span>
          <div><h3 className="font-display text-xl font-extrabold text-white">{scenario.title}</h3><p className="text-xs font-medium text-slate-400">{scenario.description}</p></div>
        </div>
        <h4 className="mb-3 mt-6 font-display text-xs font-extrabold uppercase tracking-widest text-slate-500">Key Vocabulary</h4>
        <ul className="mb-6 flex flex-col gap-2">{scenario.vocab.map((word, index) => <li key={`${word.en}-${index}`} className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-[#07101d] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"><span className="text-sm font-semibold text-slate-300">{word.en}</span><span className="flex flex-wrap items-baseline gap-2"><span className="font-display text-lg font-bold text-white">{word.zh}</span><span className="text-xs font-bold italic text-[#52b9db]">{word.pinyin}</span></span></li>)}</ul>
        <button type="button" onClick={onStart} className="flex h-[50px] w-full items-center justify-center rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] px-4 font-display text-sm font-extrabold uppercase tracking-widest text-[var(--accent-ink)] shadow-md transition-all brightness-100 hover:brightness-110">Start Scenario</button>
      </div>
    </div>
  )
}

export default function ScenariosPage({ country = 'China', code = 'cn', completedScenarios = [], scenarios, specialScenario, onBack, onScenarioStart }) {
  const progress = scenarios.map((scenario) => completedScenarios.includes(scenario.id) ? 100 : 0)
  const [activeScenario, setActiveScenario] = useState(null)
  const [missionScenario, setMissionScenario] = useState(null)
  const allCompleted = progress.every((value) => value >= 100)
  const completedCount = progress.filter((value) => value >= 100).length
  const isUnlocked = (index) => index === 0 || progress[index - 1] >= 100
  const handleCardClick = (scenario, unlocked) => unlocked && setActiveScenario(scenario)
  function handleStartScenario() {
    if (!activeScenario) return
    setMissionScenario(activeScenario)
    setActiveScenario(null)
  }
  function handleAcceptMission() {
    const scenario = missionScenario
    setMissionScenario(null)
    onScenarioStart?.(scenario)
  }

  return (
    <div style={getCountryThemeStyle(country)} className="relative min-h-dvh w-screen overflow-y-auto overflow-x-hidden bg-[#07101d] text-white font-display">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(91,135,170,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.055)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_12%,rgba(32,104,145,.2),transparent_34%),radial-gradient(circle_at_20%_80%,rgba(255,154,77,.08),transparent_30%)]" />
      <header className="relative z-10 mx-3 mt-3 flex max-w-7xl items-center justify-between gap-2 rounded-[1.3rem] border border-white/10 bg-[#0b1727]/85 px-3 py-3 shadow-[0_18px_55px_rgba(0,0,0,.3)] backdrop-blur-xl sm:mx-5 sm:mt-5 sm:gap-3 sm:rounded-[1.6rem] sm:px-6 sm:py-4 xl:mx-auto">
        <button type="button" onClick={onBack} className="flex h-[46px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-xs font-extrabold uppercase tracking-widest text-slate-400 transition-all hover:bg-white/[0.07] max-sm:px-3"><BackIcon /><span className="max-sm:hidden">Back to Globe</span></button>
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--accent-25)] bg-[#07101d] p-2 sm:h-12 sm:w-12"><img src={`https://flagcdn.com/${code ?? 'cn'}.svg`} alt={country} className="w-full rounded-sm shadow-sm" /></span><div className="min-w-0"><h1 className="truncate text-lg font-extrabold text-white sm:text-2xl">{country}</h1><p className="hidden text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 sm:block">Choose a scenario</p></div></div>
        <div className="flex h-[46px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-4 text-xs font-extrabold uppercase tracking-widest tabular-nums max-sm:hidden"><span className="mr-1 text-[var(--accent)]">{completedCount}/{scenarios.length}</span><span className="text-slate-500">Completed</span></div>
      </header>
      <main className="relative z-10 px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-16 sm:pt-6 lg:px-8"><div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
        {scenarios.map((scenario, index) => { const unlocked = isUnlocked(index); return <ScenarioCard key={scenario.id} scenario={scenario} index={index} unlocked={unlocked} progress={progress[index]} completed={progress[index] >= 100} onClick={() => handleCardClick(scenario, unlocked)} /> })}
        {specialScenario && <ScenarioCard scenario={specialScenario} index={scenarios.length} unlocked={allCompleted} progress={completedScenarios.includes(specialScenario.id) ? 100 : 0} completed={completedScenarios.includes(specialScenario.id)} onClick={() => handleCardClick(specialScenario, allCompleted && !completedScenarios.includes(specialScenario.id))} />}
      </div></main>
      {activeScenario && <LessonModal scenario={activeScenario} onClose={() => setActiveScenario(null)} onStart={handleStartScenario} />}
      {missionScenario && <MissionBriefing scenario={missionScenario} country={country} onAccept={handleAcceptMission} onCancel={() => setMissionScenario(null)} />}
    </div>
  )
}

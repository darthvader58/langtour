import { useEffect, useState } from 'react'
import ToyIcon from './components/ToyIcon'
import { getCountryThemeStyle } from './countryTheme'
import { getMissionList } from './missionListApi'
import { buildMissionListViewModel } from './missionListModel'

function BackIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 19-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function ProgressBar({ progress, gold }) {
  return <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/[0.06] bg-[#07101d]"><div className={'h-full rounded-full transition-all duration-500 ' + (gold ? 'bg-[#ffd166]' : 'bg-[var(--accent)]')} style={{ width: `${progress}%` }} /></div>
}

// One generated mission from the chain (docs/contracts/scenario-list.md). All
// missions here already exist server-side, so unlike the old static-tile
// version there's no client-side lock gate — the only "locked" affordance is
// the Next Mission card, gated on `nextAvailable`.
function MissionCard({ mission, index, onClick }) {
  const description = mission.completed
    ? 'This mission is complete — revisit it any time.'
    : `${mission.usedCount}/${mission.targetSize} words used so far.`
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 70}ms` }}
      className="group relative min-h-[15rem] animate-fade-in-up cursor-pointer overflow-hidden rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-[#102239]/95 to-[#0a1626]/95 p-5 text-left shadow-[0_18px_45px_rgba(0,0,0,.22)] transition-all duration-200 hover:-translate-y-1 hover:border-[var(--accent-55)] hover:shadow-[0_24px_60px_rgba(0,0,0,.35)] sm:min-h-[18rem] sm:rounded-[1.75rem] sm:p-6"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--accent-25)] bg-[#07101d] text-3xl shadow-inner sm:mb-5 sm:h-16 sm:w-16 sm:text-4xl">{mission.icon}</div>
      <h3 className="mb-2 font-display text-lg font-extrabold text-white sm:text-xl">{mission.title}</h3>
      <p className="mb-5 min-h-[3rem] text-sm font-medium leading-relaxed text-slate-400 sm:mb-6 sm:min-h-[3.5rem]">{description}</p>
      <div className="flex items-center justify-between gap-3"><ProgressBar progress={mission.progress} /><span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500">{mission.progress}%</span></div>
      {mission.completed && <span className="absolute right-4 top-4 rounded-full border border-[var(--accent-30)] bg-[var(--accent-15)] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest text-[var(--accent-soft)]">Done</span>}
    </button>
  )
}

// The chain hasn't planned this mission yet — it's briefed live once you tap
// in (fits the spy/disguise framing: no spoilers on what's next).
function NextMissionCard({ index, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 70}ms` }}
      className="group relative min-h-[15rem] animate-fade-in-up cursor-pointer overflow-hidden rounded-[1.5rem] border border-[#ffd166]/45 bg-gradient-to-br from-[#312512] to-[#101928] p-5 text-left shadow-[0_18px_45px_rgba(0,0,0,.22)] transition-all duration-200 hover:-translate-y-1 hover:border-[#ffd166]/75 sm:min-h-[18rem] sm:rounded-[1.75rem] sm:p-6"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#ffd166]/30 bg-[#ffd166]/10 shadow-inner sm:mb-5 sm:h-16 sm:w-16">
        <ToyIcon name="compass" size={32} className="text-[#ffd166]" />
      </div>
      <h3 className="mb-2 font-display text-lg font-extrabold text-white sm:text-xl">Next Mission</h3>
      <p className="mb-5 min-h-[3rem] text-sm font-medium leading-relaxed text-slate-400 sm:mb-6 sm:min-h-[3.5rem]">The chain plans your next situation from what you&rsquo;ve just mastered. Tap in to get briefed.</p>
      <div className="flex items-center justify-between gap-3"><ProgressBar progress={0} gold /><span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500">New</span></div>
    </button>
  )
}

export default function ScenariosPage({ country = 'China', code = 'cn', onBack, onScenarioStart }) {
  const [viewModel, setViewModel] = useState(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false

    // setState is deferred into a microtask (matches useUserProfileData.js)
    // so this stays "reacting to a prop change", not a synchronous render-time
    // state write, per the react-hooks set-state-in-effect rule.
    Promise.resolve().then(async () => {
      if (cancelled) return
      setViewModel(null)
      setLoadError('')
      try {
        const data = await getMissionList({ countryCode: code })
        if (!cancelled) setViewModel(buildMissionListViewModel(data))
      } catch (err) {
        if (!cancelled) setLoadError(err.message ?? 'Unable to load missions.')
      }
    })

    return () => { cancelled = true }
  }, [code])

  const handleMissionClick = (mission) => onScenarioStart?.({ id: mission.id, title: mission.title, icon: mission.icon })
  const handleNextMissionClick = () => onScenarioStart?.({})

  return (
    <div style={getCountryThemeStyle(country)} className="relative min-h-dvh w-screen overflow-y-auto overflow-x-hidden bg-[#07101d] text-white font-display">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(91,135,170,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.055)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_12%,rgba(32,104,145,.2),transparent_34%),radial-gradient(circle_at_20%_80%,rgba(255,154,77,.08),transparent_30%)]" />
      <header className="relative z-10 mx-3 mt-3 flex max-w-7xl items-center justify-between gap-2 rounded-[1.3rem] border border-white/10 bg-[#0b1727]/85 px-3 py-3 shadow-[0_18px_55px_rgba(0,0,0,.3)] backdrop-blur-xl sm:mx-5 sm:mt-5 sm:gap-3 sm:rounded-[1.6rem] sm:px-6 sm:py-4 xl:mx-auto">
        <button type="button" onClick={onBack} className="flex h-[46px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-xs font-extrabold uppercase tracking-widest text-slate-400 transition-all hover:bg-white/[0.07] max-sm:px-3"><BackIcon /><span className="max-sm:hidden">Back to Globe</span></button>
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--accent-25)] bg-[#07101d] p-2 sm:h-12 sm:w-12"><img src={`https://flagcdn.com/${code ?? 'cn'}.svg`} alt={country} className="w-full rounded-sm shadow-sm" /></span><div className="min-w-0"><h1 className="truncate text-lg font-extrabold text-white sm:text-2xl">{country}</h1><p className="hidden text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 sm:block">Choose a mission</p></div></div>
        <div className="flex h-[46px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-4 text-xs font-extrabold uppercase tracking-widest tabular-nums max-sm:hidden"><span className="mr-1 text-[var(--accent)]">{viewModel ? `${viewModel.completedCount}/${viewModel.totalCount}` : '—'}</span><span className="text-slate-500">Discovered</span></div>
      </header>
      <main className="relative z-10 px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-16 sm:pt-6 lg:px-8">
        {loadError && (
          <p className="mx-auto mb-4 max-w-7xl rounded-xl border border-[#FF4B4B]/40 bg-[#FF4B4B]/10 px-4 py-3 text-sm font-medium text-[#FF9B9B]">{loadError}</p>
        )}
        {!viewModel && !loadError && (
          <p className="mx-auto max-w-7xl text-sm font-medium text-slate-400">Loading your missions…</p>
        )}
        {viewModel && (
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
            {viewModel.missions.map((mission, index) => (
              <MissionCard key={mission.id} mission={mission} index={index} onClick={() => handleMissionClick(mission)} />
            ))}
            {viewModel.nextAvailable && (
              <NextMissionCard index={viewModel.missions.length} onClick={handleNextMissionClick} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

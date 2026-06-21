import { useEffect, useMemo, useRef, useState } from 'react'
import { CHARACTERS, COUNTRIES } from '../../gameData'
import ProgressNavigator from './ProgressNavigator'
import WordConstellation3D from './WordConstellation3D'
import { useUserProfileData } from '../../profile/useUserProfileData'
import { displayIdentity, formatAccountAge, normalizeCountryCode, normalizeGraph, normalizeProgress } from './profileModel'
import './userProfile.css'

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function profileDate(value) {
  const date = new Date(value)
  return value && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    : ''
}

export default function UserProfileOverlay({
  open,
  onClose,
  user,
  profile,
  tokens = 0,
  level,
  rank,
  unlockedCountries = [],
  completedScenarios = [],
}) {
  const fallback = useMemo(() => ({ profile, unlockedCountries, completedScenarios }), [profile, unlockedCountries, completedScenarios])
  const [selectedCountry, setSelectedCountry] = useState(() => normalizeCountryCode(unlockedCountries[0] ?? COUNTRIES[0]?.code ?? ''))
  const [selectedScenario, setSelectedScenario] = useState(null)
  const shellRef = useRef(null)
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const profileData = useUserProfileData({
    enabled: open && Boolean(user),
    timezone,
    countryCode: selectedCountry,
    scenarioId: selectedScenario,
  })
  const progressState = profileData.progress
  const progress = normalizeProgress(progressState.data ?? {}, fallback)
  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusable = [...(shellRef.current?.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    requestAnimationFrame(() => shellRef.current?.querySelector('.agent-profile__close')?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [open, onClose])

  const graphState = profileData.graph
  const graph = useMemo(() => normalizeGraph(graphState.data ?? {}), [graphState.data])
  const identity = displayIdentity(user)
  const selectedCountryData = progress.countries.find((country) => country.code === selectedCountry)
  const selectedScenarioData = selectedCountryData?.scenarios.find((scenario) => scenario.id === selectedScenario)
  const character = CHARACTERS[selectedCountryData?.name]
  const xp = Number(progress.profile?.experience_points ?? progress.profile?.experiencePoints ?? profile?.experience_points ?? 0)
  const visibleRank = rank?.name ?? progress.profile?.rank?.name ?? 'Recruit'
  const visibleLevel = level?.display_order ?? level?.number ?? progress.profile?.level?.display_order ?? progress.profile?.level?.name ?? Math.max(1, unlockedCountries.length)

  if (!open) return null
  return (
    <div className="agent-profile" role="dialog" aria-modal="true" aria-labelledby="agent-profile-title">
      <div className="agent-profile__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="agent-profile__shell" ref={shellRef}>
        <header className="agent-profile__topbar">
          <div className="agent-profile__brand"><span>LT</span><strong>Field dossier</strong></div>
          <button className="agent-profile__close" type="button" onClick={onClose} aria-label="Close profile"><CloseIcon /></button>
        </header>
        <main className="agent-profile__scroll">
          <section className="agent-profile__hero">
            <div className="agent-profile__avatar">
              {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span>{identity.initials}</span>}
              <i aria-hidden="true" />
            </div>
            <div className="agent-profile__identity">
              <span className="agent-profile__eyebrow">Active field agent</span>
              <h1 id="agent-profile-title">{identity.name}</h1>
              <p>{identity.email} <span aria-hidden="true">·</span> {formatAccountAge(user?.created_at)}</p>
            </div>
            <div className="agent-profile__stats-strip">
              <div><span>Rank</span><strong>{visibleRank}</strong></div>
              <div><span>Level</span><strong>{visibleLevel}</strong></div>
              <div><span>XP</span><strong>{xp.toLocaleString()}</strong></div>
              <div className="agent-profile__coins"><span>LangCoins</span><strong>{Number(tokens).toLocaleString()}</strong></div>
            </div>
          </section>

          {progressState.error && <div className="agent-profile__notice" role="status">Live metrics could not be refreshed. Showing your saved game state.</div>}
          <div className="agent-profile__dashboard">
            <ProgressNavigator
              countries={progress.countries}
              selectedCountry={selectedCountry}
              selectedScenario={selectedScenario}
              onCountryChange={(code) => { setSelectedCountry(code); setSelectedScenario(null) }}
              onScenarioChange={setSelectedScenario}
            />
            <WordConstellation3D
              graph={graph}
              loading={graphState.loading}
              error={graphState.error?.message ?? ''}
              title={selectedScenarioData?.title ?? `${selectedCountryData?.name ?? 'Language'} constellation`}
            />
          </div>
          <section className="agent-profile__panel agent-profile__history" aria-labelledby="history-title">
            <div className="agent-profile__section-heading"><div><span className="agent-profile__eyebrow">Character archive</span><h2 id="history-title">Roles acquired</h2></div></div>
            <div className="agent-profile__role-grid">
              {progress.countries.filter((country) => country.unlocked).map((country) => {
                const role = CHARACTERS[country.name]
                return <article key={country.code}><span className="agent-profile__role-mark">{country.code.toUpperCase()}</span><div><small>{country.flag} {country.name}{country.unlockedAt ? ` · Acquired ${profileDate(country.unlockedAt)}` : ''}</small><strong>{country.character?.type ?? country.character?.name ?? role?.type ?? 'Agent'}</strong><p>{country.character?.story ?? role?.story ?? 'Mission identity acquired.'}</p></div></article>
              })}
              {!progress.countries.some((country) => country.unlocked) && <p className="agent-profile__empty">Your first character will appear here after choosing a country.</p>}
            </div>
          </section>
          {character && <span className="agent-profile__sr-only">Current role: {character.type}</span>}
        </main>
      </div>
    </div>
  )
}

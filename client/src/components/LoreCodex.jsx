import { useEffect, useRef } from 'react'
import { getCountryThemeStyle } from '../countryTheme'
import { buildCodexEntries } from '../loreCodex'

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

// Re-openable, Assassin's-Creed-style codex: one entry per country, each
// rendering the same shared/personaCanon.js beats the arrival popup shows.
// An entry unlocks only when its country code is in the server-provided
// unlockedCountries list (docs/contracts/story-narration.md) — no
// client-trusted flag, no localStorage.
export default function LoreCodex({ open, onClose, unlockedCountries = [] }) {
  const shellRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    requestAnimationFrame(() => shellRef.current?.querySelector('button')?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open) return null
  const entries = buildCodexEntries(unlockedCountries)

  return (
    <div className="fixed inset-0 z-50 text-white" role="dialog" aria-modal="true" aria-label="Lore codex">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={shellRef} className="relative z-10 mx-auto flex h-full max-w-5xl flex-col overflow-y-auto px-4 py-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-[9px] font-extrabold uppercase tracking-[.28em] text-slate-400">Field Dossier</p>
            <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Lore Codex</h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lore codex"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 pb-8 sm:grid-cols-2">
          {entries.map((entry) => (
            <article
              key={entry.country}
              style={entry.unlocked ? getCountryThemeStyle(entry.country) : undefined}
              className={
                'rounded-2xl border p-5 transition-colors ' +
                (entry.unlocked
                  ? 'border-[var(--accent-25)] bg-[var(--surface-card)]'
                  : 'border-white/10 bg-white/[0.03]')
              }
            >
              {entry.unlocked ? (
                <>
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="text-2xl" aria-hidden="true">{entry.flag}</span>
                    <div className="min-w-0">
                      <p className="font-display text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent-soft)]">{entry.country} &middot; {entry.cover.type}</p>
                      <p className="font-display text-sm font-extrabold text-white">{entry.cover.logline}</p>
                    </div>
                  </div>
                  <p className="mb-3 text-xs italic leading-relaxed text-slate-400">{entry.cover.identity}. {entry.cover.stakes}.</p>

                  <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-[var(--accent-25)] bg-[var(--accent-10)] px-3 py-2.5">
                    <span
                      className="h-8 w-8 shrink-0 rounded-full border border-[var(--accent-30)] bg-[image:var(--sidekick-portrait)] bg-cover bg-center"
                      role="img"
                      aria-label={`${entry.sidekick.name} portrait`}
                    />
                    <div>
                      <p className="font-display text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-soft)]">{entry.sidekick.name} &middot; {entry.sidekick.role}</p>
                      <p className="text-xs italic text-slate-300">&ldquo;{entry.sidekick.catchphrase}&rdquo;</p>
                    </div>
                  </div>

                  <ol className="space-y-2 border-t border-[var(--surface-border)] pt-3 text-left text-xs leading-relaxed text-slate-300">
                    {entry.beats.map((beat, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 font-display text-[10px] font-extrabold text-[var(--accent-soft)]">{i + 1}</span>
                        <span>{beat}</span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center opacity-60">
                  <span className="text-3xl" aria-hidden="true">{'\u{1F512}'}</span>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{entry.flag} {entry.country}</p>
                  <p className="text-[11px] text-slate-500">Unlock this country to reveal its dossier.</p>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

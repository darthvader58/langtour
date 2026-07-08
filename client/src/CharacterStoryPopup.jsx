import { useState } from 'react'
import { getCountryThemeStyle } from './countryTheme'
import { CHARACTERS } from './gameData'
import { FRAMING_NARRATIVE, getArrivalStory } from './storyData'

// mode 'intro': the one-time framing narrative shown before any country is
// picked — plays every beat on one page, as it always has. mode 'arrival'
// (default): the per-country backstory introducing that country's disguise +
// sidekick, delivered as tap-to-continue pages — one canon beat per page,
// per docs/contracts/story-narration.md. All copy is catalog data
// (gameData.js / storyData.js / shared/personaCanon.js), never hardcoded
// here, so a new country is a data-only addition.
export default function CharacterStoryPopup({ mode = 'arrival', country, character, onBeginMission }) {
  const isIntro = mode === 'intro'
  const arrival = isIntro ? null : getArrivalStory(country)
  const resolvedCharacter = character ?? CHARACTERS[country] ?? null
  const sidekick = arrival?.sidekick

  const [pageIndex, setPageIndex] = useState(0)

  const eyebrow = isIntro ? FRAMING_NARRATIVE.eyebrow : `${country} — Mission Briefing`
  const icon = isIntro ? FRAMING_NARRATIVE.icon : (resolvedCharacter?.icon ?? '\u{1F9F3}')
  const gradient = resolvedCharacter?.gradient ?? 'from-[#0b1727] via-[#1F2937] to-[#0F1418]'
  const allBeats = isIntro ? FRAMING_NARRATIVE.beats : (arrival?.beats ?? [])
  const isLastPage = isIntro || pageIndex >= allBeats.length - 1
  // Intro still renders every beat together (unchanged framing narrative);
  // arrival renders exactly the current page's beat.
  const visibleBeats = isIntro ? allBeats : allBeats.slice(pageIndex, pageIndex + 1)

  // Word-reveal delays run across the beats currently on screen — the whole
  // cascade for intro, one beat's worth per arrival page — so each tap-to-
  // continue page still reads as one unbroken breath.
  const { paragraphs, wordCount } = visibleBeats.reduce((acc, beat) => {
    const words = beat.split(' ')
    const startIndex = acc.wordCount
    return { paragraphs: [...acc.paragraphs, { words, startIndex }], wordCount: acc.wordCount + words.length }
  }, { paragraphs: [], wordCount: 0 })
  const buttonDelay = 0.7 + wordCount * 0.055 + 0.4

  const handleAdvance = () => {
    if (!isIntro && !isLastPage) {
      setPageIndex((index) => index + 1)
      return
    }
    onBeginMission()
  }

  return (
    <div style={getCountryThemeStyle(isIntro ? undefined : country)} className="relative min-h-dvh w-screen overflow-x-hidden overflow-y-auto text-white font-sans animate-overlay-fade">
      <div className={`absolute inset-0 bg-gradient-to-b ${gradient}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(68,130,166,.22),transparent_28%),radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,.85)_100%)]" />
      <div className="absolute inset-0 bg-[image:var(--motif-texture)]" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-4 py-[max(2rem,env(safe-area-inset-top))] text-center sm:px-8 sm:py-10">
        <div className="mb-3 rounded-full border border-[var(--accent-25)] bg-[var(--accent-10)] px-4 py-1.5 font-display text-[9px] font-extrabold uppercase tracking-[.24em] text-[var(--accent-soft)] animate-fade-in-up sm:mb-5 sm:tracking-[.32em]">{eyebrow}</div>

        {!isIntro && allBeats.length > 1 && (
          <div className="mb-4 flex items-center gap-1.5 animate-fade-in-up" aria-label={`Page ${pageIndex + 1} of ${allBeats.length}`}>
            {allBeats.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === pageIndex ? 'w-6 bg-[var(--accent)]' : 'w-1.5 bg-white/15'}`}
              />
            ))}
          </div>
        )}

        <div
          className="relative mb-4 flex h-28 w-28 rotate-[-2deg] items-center justify-center rounded-[2rem] border border-[var(--accent-30)] bg-gradient-to-br from-[#17304a] to-[#07101d] text-7xl shadow-[0_28px_90px_rgba(0,0,0,.55)] animate-fade-in-up after:absolute after:inset-2 after:rounded-[1.5rem] after:border after:border-white/[.07] sm:mb-7 sm:h-44 sm:w-44 sm:rounded-[2.5rem] sm:text-[6.5rem] sm:after:inset-3 sm:after:rounded-[2rem] [@media(max-height:680px)]:h-24 [@media(max-height:680px)]:w-24 [@media(max-height:680px)]:text-6xl"
          style={{ animationDelay: '0.15s' }}
        >
          <span className="drop-shadow-[0_15px_18px_rgba(0,0,0,.45)]">{icon}</span>
        </div>

        <h2
          className="mb-4 font-display text-3xl font-extrabold text-white animate-fade-in-up sm:mb-7 sm:text-5xl"
          style={{ animationDelay: '0.45s' }}
        >
          {isIntro ? FRAMING_NARRATIVE.title : <>You are a <span className="text-[var(--accent-soft)]">{resolvedCharacter?.type}</span></>}
        </h2>

        <div key={pageIndex} className="mb-6 flex max-w-2xl flex-col gap-3 sm:mb-11">
          {paragraphs.map((paragraph, pIndex) => (
            <p key={pIndex} className="text-sm font-medium leading-relaxed text-slate-300 sm:text-lg">
              {paragraph.words.map((word, i) => (
                <span
                  key={i}
                  className="inline-block animate-word-reveal"
                  style={{ animationDelay: `${0.7 + (paragraph.startIndex + i) * 0.055}s` }}
                >
                  {word}&nbsp;
                </span>
              ))}
            </p>
          ))}
        </div>

        {!isIntro && isLastPage && sidekick && (
          <div
            className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--accent-25)] bg-[var(--surface-card)] px-4 py-3 text-left animate-fade-in-up sm:mb-9"
            style={{ animationDelay: `${buttonDelay - 0.3}s` }}
          >
            <span
              className="h-11 w-11 shrink-0 rounded-full border border-[var(--accent-30)] bg-[image:var(--sidekick-portrait)] bg-cover bg-center"
              role="img"
              aria-label={`${sidekick.name} portrait`}
            />
            <div>
              <p className="font-display text-xs font-extrabold uppercase tracking-wider text-[var(--accent-soft)]">{sidekick.name} &middot; {sidekick.role}</p>
              <p className="text-xs font-medium italic text-slate-400">&ldquo;{sidekick.catchphrase}&rdquo;</p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleAdvance}
          className="animate-fade-in-up w-full max-w-sm rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] px-6 py-3.5 font-display text-sm font-extrabold uppercase tracking-widest text-[var(--accent-ink)] shadow-2xl transition-all hover:brightness-110 active:translate-y-0.5 sm:w-auto sm:px-10 sm:py-4 sm:text-lg"
          style={{ animationDelay: `${buttonDelay}s` }}
        >
          {isIntro ? "Let's Go" : isLastPage ? 'Begin Mission' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

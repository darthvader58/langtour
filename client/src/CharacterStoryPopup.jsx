import { getCountryThemeStyle } from './countryTheme'
import { CHARACTERS } from './gameData'
import { FRAMING_NARRATIVE, getArrivalStory } from './storyData'

// mode 'intro': the one-time framing narrative shown before any country is
// picked. mode 'arrival' (default): the per-country beat introducing that
// country's disguise + sidekick, shown the first time a player visits it.
// All copy is catalog data (gameData.js / storyData.js) — nothing hardcoded
// here, so a new country is a data-only addition.
export default function CharacterStoryPopup({ mode = 'arrival', country, character, onBeginMission }) {
  const isIntro = mode === 'intro'
  const arrival = isIntro ? null : getArrivalStory(country)
  const resolvedCharacter = character ?? CHARACTERS[country] ?? arrival?.character
  const sidekick = arrival?.sidekick

  const eyebrow = isIntro ? FRAMING_NARRATIVE.eyebrow : (arrival?.eyebrow ?? `${country} — Mission Briefing`)
  const icon = isIntro ? FRAMING_NARRATIVE.icon : (resolvedCharacter?.icon ?? '\u{1F9F3}')
  const gradient = resolvedCharacter?.gradient ?? 'from-[#0b1727] via-[#1F2937] to-[#0F1418]'
  const beats = isIntro ? FRAMING_NARRATIVE.beats : (arrival?.beats ?? [resolvedCharacter?.story ?? ''].filter(Boolean))

  // Word-reveal delays run across every beat as one continuous cascade so
  // multi-paragraph arrival copy still feels like one breath, not two resets.
  const { paragraphs, wordCount } = beats.reduce((acc, beat) => {
    const words = beat.split(' ')
    const startIndex = acc.wordCount
    return { paragraphs: [...acc.paragraphs, { words, startIndex }], wordCount: acc.wordCount + words.length }
  }, { paragraphs: [], wordCount: 0 })
  const buttonDelay = 0.7 + wordCount * 0.055 + 0.4

  return (
    <div style={getCountryThemeStyle(isIntro ? undefined : country)} className="relative min-h-dvh w-screen overflow-x-hidden overflow-y-auto text-white font-sans animate-overlay-fade">
      <div className={`absolute inset-0 bg-gradient-to-b ${gradient}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(68,130,166,.22),transparent_28%),radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,.85)_100%)]" />
      <div className="absolute inset-0 bg-[image:var(--motif-texture)]" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-4 py-[max(2rem,env(safe-area-inset-top))] text-center sm:px-8 sm:py-10">
        <div className="mb-3 rounded-full border border-[var(--accent-25)] bg-[var(--accent-10)] px-4 py-1.5 font-display text-[9px] font-extrabold uppercase tracking-[.24em] text-[var(--accent-soft)] animate-fade-in-up sm:mb-5 sm:tracking-[.32em]">{eyebrow}</div>
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

        <div className="mb-6 flex max-w-2xl flex-col gap-3 sm:mb-11">
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

        {!isIntro && sidekick && (
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
              <p className="text-xs font-medium italic text-slate-400">&ldquo;{sidekick.tagline}&rdquo;</p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onBeginMission}
          className="animate-fade-in-up w-full max-w-sm rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] px-6 py-3.5 font-display text-sm font-extrabold uppercase tracking-widest text-[var(--accent-ink)] shadow-2xl transition-all hover:brightness-110 active:translate-y-0.5 sm:w-auto sm:px-10 sm:py-4 sm:text-lg"
          style={{ animationDelay: `${buttonDelay}s` }}
        >
          {isIntro ? "Let's Go" : 'Begin Mission'}
        </button>
      </div>
    </div>
  )
}

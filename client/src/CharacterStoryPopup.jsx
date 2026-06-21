import { getCountryThemeStyle } from './countryTheme'

export default function CharacterStoryPopup({ country, character, onBeginMission }) {
  const words = character.story.split(' ')
  const buttonDelay = 0.7 + words.length * 0.055 + 0.4

  return (
    <div style={getCountryThemeStyle(country)} className="relative min-h-dvh w-screen overflow-x-hidden overflow-y-auto text-white font-sans animate-overlay-fade">
      <div className={`absolute inset-0 bg-gradient-to-b ${character.gradient}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(68,130,166,.22),transparent_28%),radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,.85)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(91,135,170,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(91,135,170,.05)_1px,transparent_1px)] bg-[size:72px_72px]" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-4 py-[max(2rem,env(safe-area-inset-top))] text-center sm:px-8 sm:py-10">
        <div className="mb-3 rounded-full border border-[var(--accent-25)] bg-[var(--accent-10)] px-4 py-1.5 font-display text-[9px] font-extrabold uppercase tracking-[.24em] text-[var(--accent-soft)] animate-fade-in-up sm:mb-5 sm:tracking-[.32em]">Identity assigned</div>
        <div
          className="relative mb-4 flex h-28 w-28 rotate-[-2deg] items-center justify-center rounded-[2rem] border border-[var(--accent-30)] bg-gradient-to-br from-[#17304a] to-[#07101d] text-7xl shadow-[0_28px_90px_rgba(0,0,0,.55)] animate-fade-in-up after:absolute after:inset-2 after:rounded-[1.5rem] after:border after:border-white/[.07] sm:mb-7 sm:h-44 sm:w-44 sm:rounded-[2.5rem] sm:text-[6.5rem] sm:after:inset-3 sm:after:rounded-[2rem] [@media(max-height:680px)]:h-24 [@media(max-height:680px)]:w-24 [@media(max-height:680px)]:text-6xl"
          style={{ animationDelay: '0.15s' }}
        >
          <span className="drop-shadow-[0_15px_18px_rgba(0,0,0,.45)]">{character.icon}</span>
        </div>

        <div
          className="mb-2 font-display text-[9px] font-extrabold uppercase tracking-[0.24em] text-white/40 animate-fade-in-up sm:mb-3 sm:text-[11px] sm:tracking-[0.35em]"
          style={{ animationDelay: '0.3s' }}
        >
          {country} — Mission Briefing
        </div>

        <h2
          className="mb-4 font-display text-3xl font-extrabold text-white animate-fade-in-up sm:mb-7 sm:text-5xl"
          style={{ animationDelay: '0.45s' }}
        >
          You are a <span className="text-[var(--accent-soft)]">{character.type}</span>
        </h2>

        <p className="mb-6 max-w-2xl text-sm font-medium leading-relaxed text-slate-300 sm:mb-11 sm:text-lg">
          {words.map((word, i) => (
            <span
              key={i}
              className="inline-block animate-word-reveal"
              style={{ animationDelay: `${0.7 + i * 0.055}s` }}
            >
              {word}&nbsp;
            </span>
          ))}
        </p>

        <button
          type="button"
          onClick={onBeginMission}
          className="animate-fade-in-up w-full max-w-sm rounded-2xl border border-[var(--accent-30)] bg-[var(--accent)] px-6 py-3.5 font-display text-sm font-extrabold uppercase tracking-widest text-[var(--accent-ink)] shadow-2xl transition-all hover:brightness-110 active:translate-y-0.5 sm:w-auto sm:px-10 sm:py-4 sm:text-lg"
          style={{ animationDelay: `${buttonDelay}s` }}
        >
          Begin Mission
        </button>
      </div>
    </div>
  )
}

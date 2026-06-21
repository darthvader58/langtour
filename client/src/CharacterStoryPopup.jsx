import { ICON_MAP } from './iconMap'

export default function CharacterStoryPopup({ country, character, onBeginMission }) {
  const IconComponent = ICON_MAP[character.icon] || ICON_MAP.Crown;

  const words = character.story.split(' ')
  const buttonDelay = 0.7 + words.length * 0.055 + 0.4

  return (
    <div className="relative w-screen h-screen overflow-hidden text-white font-sans animate-overlay-fade">
      <div className={`absolute inset-0 bg-gradient-to-b ${character.gradient}`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_25%,_rgba(0,0,0,0.78)_100%)]" />

      <div className="relative z-10 flex flex-col items-center justify-center text-center h-full max-w-xl mx-auto px-8">
        <div
          className="flex justify-center mb-6 animate-fade-in-up"
          style={{ animationDelay: '0.15s' }}
        >
          <IconComponent className="w-24 h-24 text-current" strokeWidth={1.5} />
        </div>

        <div
          className="font-display text-[11px] font-extrabold uppercase tracking-[0.35em] text-white/40 mb-3 animate-fade-in-up"
          style={{ animationDelay: '0.3s' }}
        >
          {country} — Mission Briefing
        </div>

        <h2
          className="font-display text-4xl font-extrabold text-white mb-8 animate-fade-in-up"
          style={{ animationDelay: '0.45s' }}
        >
          You are a <span className="text-[#40DF01]">{character.type}</span>
        </h2>

        <p className="text-xl text-gray-300 font-medium leading-relaxed mb-14">
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
          className="animate-fade-in-up px-10 py-4 rounded-2xl bg-[#40DF01] hover:bg-[#61D908] border-2 border-[#46A302] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all text-white font-display font-extrabold text-lg uppercase tracking-widest shadow-2xl"
          style={{ animationDelay: `${buttonDelay}s` }}
        >
          Begin Mission
        </button>
      </div>
    </div>
  )
}

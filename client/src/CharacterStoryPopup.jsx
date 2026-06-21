import { CHARACTERS } from './gameData'
import SackboyCharacter from './components/SackboyCharacter'

export default function CharacterStoryPopup({ country, onBeginMission }) {
  const character = CHARACTERS[country] ?? CHARACTERS.China
  const words = character.story.split(' ')
  const buttonDelay = 0.7 + words.length * 0.055 + 0.4

  return (
    <div className="relative w-screen h-screen overflow-hidden text-[#F5F0E8] font-mono animate-overlay-fade">
      <div className={`absolute inset-0 bg-gradient-to-b ${character.gradient}`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_25%,_rgba(0,0,0,0.82)_100%)]" />

      {/* Grain */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(201,168,76,0.08) 3px, rgba(201,168,76,0.08) 4px)' }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center text-center h-full max-w-xl mx-auto px-8">
        <div className="mb-6 animate-fade-in-up flex justify-center" style={{ animationDelay: '0.15s' }}>
          <SackboyCharacter country={country} size={150} state="wave" />
        </div>

        <div
          className="font-mono text-[10px] font-bold uppercase tracking-[0.4em] text-[#C9A84C]/50 mb-3 animate-fade-in-up"
          style={{ animationDelay: '0.3s' }}
        >
          {country} — Mission Briefing
        </div>

        <h2
          className="font-display text-4xl font-bold text-[#F5F0E8] mb-8 tracking-wider animate-fade-in-up"
          style={{ animationDelay: '0.45s' }}
        >
          You are a <span className="text-[#C9A84C] animate-gold-shimmer">{character.type}</span>
        </h2>

        <p className="text-lg text-[#D4C9A8] font-normal leading-relaxed mb-14">
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
          className="btn-chunky animate-fade-in-up px-10 py-4 rounded-2xl bg-[#C9A84C]/10 border-[3px] border-[#C9A84C]/55 hover:bg-[#C9A84C]/20 hover:border-[#C9A84C]/80 font-display font-bold text-[#C9A84C] text-lg uppercase tracking-widest shadow-[0_0_30px_rgba(201,168,76,0.15)]"
          style={{ animationDelay: `${buttonDelay}s` }}
        >
          Begin Mission
        </button>
      </div>
    </div>
  )
}

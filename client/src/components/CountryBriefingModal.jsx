import { AGENT_AVATARS, CHARACTERS } from '../gameData'

/**
 * CountryBriefingModal — the friendly first-contact card shown when you open a
 * new country on the globe. A bright pop-up that introduces your local guide,
 * matching the Playground / gamified-education theme.
 *
 * Props:
 *   country    - country name (e.g. 'Japan')
 *   guideNote  - short description of that country's guide
 *   briefing   - the intro body text
 *   onAccept   - called when "Let's Go!" is pressed
 *   onClose    - optional; called on the "Not Yet" control
 */

const GUIDE_NOTES = {
  China:  'Your cheerful guide through bustling Shanghai',
  Japan:  'Your calm companion across neon-lit Tokyo',
  France: 'Your stylish friend strolling through Paris',
  Mexico: 'Your lively buddy in sunny Mexico City',
  Egypt:  'Your wise guide among the wonders of Cairo',
  Brazil: 'Your festive pal dancing through Rio',
}

export default function CountryBriefingModal({
  country = 'China',
  guideNote,
  briefing,
  onAccept,
  onClose,
}) {
  const character = CHARACTERS[country] ?? CHARACTERS.China
  const note = guideNote ?? GUIDE_NOTES[country] ?? 'Your friendly local guide'
  const briefText = briefing ?? character.story
  const avatar = AGENT_AVATARS[country]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-overlay-fade">
      {/* dimmed, blurred backdrop over the globe */}
      <div className="absolute inset-0 bg-[#0D1530]/80 backdrop-blur-sm" />

      {/* friendly intro card */}
      <div className="animate-modal-pop relative w-full max-w-lg rounded-[2rem] bg-white border-4 border-slate-300 p-7 pt-12 shadow-[0_8px_0_0_rgba(200,200,200,1)]">
        {/* celebration ribbon */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-6 py-2 rounded-2xl bg-[#FFC93C] border-4 border-white shadow-[0_4px_0_0_#E0A91E]">
          <span className="font-display text-sm font-black uppercase tracking-wide text-[#3A2E0A] whitespace-nowrap">
            🎉 New World Unlocked!
          </span>
        </div>

        <div className="flex flex-col items-center text-center">
          {/* guide portrait */}
          {avatar && (
            <img
              src={avatar}
              alt={`${country} guide`}
              draggable="false"
              className="w-28 h-28 drop-shadow-2xl sackboy-bob mb-2"
            />
          )}
          <h2 className="font-display text-3xl font-black text-slate-800 leading-none">{country}</h2>
          <p className="font-display text-sm font-bold text-[#1CB0F6] mt-1.5">{character.type}</p>
          <p className="font-display text-xs font-semibold text-slate-400 italic mt-0.5">{note}</p>
        </div>

        {/* intro / story */}
        <div className="mt-6 rounded-3xl bg-[#F4F7FF] border-[3px] border-slate-200 p-5">
          <p className="font-display text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">
            📖 Your story
          </p>
          <p className="font-display text-sm font-semibold leading-relaxed text-slate-600">
            {briefText}
          </p>
        </div>

        {/* actions */}
        <div className="flex items-center gap-3 mt-7">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl bg-white border-4 border-slate-300 font-display font-extrabold text-sm uppercase tracking-wide text-slate-500 shadow-[0_4px_0_0_rgba(203,213,225,1)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_1px_0_0_rgba(203,213,225,1)] transition-all"
            >
              Not Yet
            </button>
          )}
          <button
            type="button"
            onClick={onAccept}
            className="flex-[2] py-3.5 rounded-2xl bg-[#58CC02] text-white border-4 border-[#46A302] font-display font-black text-base uppercase tracking-wide shadow-[0_5px_0_0_#3E8E00] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_#3E8E00] transition-all"
          >
            Let's Go! →
          </button>
        </div>
      </div>
    </div>
  )
}

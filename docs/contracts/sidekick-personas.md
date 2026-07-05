# Design note: per-country sidekick personas & story tone

Status: **APPROVED by owner 2026-07-03** — personas, voices, and the Brazil story softening below are ratified.
Owners: game-ai (voice) + frontend-story (portrait/copy). Ids here are the shared `personaId`/`characterId` key (see theme-tokens.md, ai-module.md).

Tone bar for everything: PG, playful archetype not ethnic caricature, Sackboy/LittleBigPlanet lightness. The sidekick is the *evaluator's* voice — every hint, correction, and bit of praise comes through it.

| Country | Player disguise (existing gameData story) | personaId | Sidekick (proposed) |
|---|---|---|---|
| China | Spy infiltrating a Shanghai black market | `shanghai-spy` | **"Wren", handler on the radio** — dry, calm, Watson-to-your-Sherlock: "You're not blending into the crowd correctly." |
| India | Aspiring Bollywood actor in Mumbai | `mumbai-star` | **"Rhea", fast-talking talent agent** — warm hype, showbiz metaphors: "That line won't make the final cut — again, with feeling." |
| France | Master thief plotting a Louvre heist | `louvre-thief` | **"Marcel", the crew's planner in your earpiece** — precise, a little theatrical: "Smooth. But a real Parisian would never phrase it that way." |
| Mexico | Treasure hunter chasing an Aztec relic | `relic-hunter` | **"Lupe", rival-turned-partner cartographer** — teasing, competitive: "The map's useless if you can't ask for directions." |
| Egypt | Archaeologist racing to a pharaoh's tomb | `tomb-scholar` | **"Nadia", expedition linguist** — scholarly, encouraging: "Hieroglyphs took me years; this word will take you one more try." |
| Brazil | Undercover journalist in Rio | `rio-reporter` | **"Téo", your editor on the phone** — punchy newsroom energy: "Sources talk to people who sound local. Rewrite." |

Note on Brazil: the existing gameData story says "exposing a cartel" — recommend softening the on-screen framing to "chasing a big story / exposing a smuggling ring of stolen art" to keep the fiction PG and consistent with the caper tone of the other five. Flagged for the owner with this note.

Each persona gets, in `node/lib/ai/` (game-ai) once approved: a 2–3 sentence backstory, a voice card (register, catchphrase pattern, how it praises / how it corrects), threaded through `generateTurn.sidekickLine` and `evaluateResponse.teachingNote`/`sidekickLine`. Frontend keys portraits and story-popup copy off the same ids, from catalog data, not hardcoded strings.

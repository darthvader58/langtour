# Contract: elaborate story narration & persona backstory canon

Status: **APPROVED by owner 2026-07-08** (sign-off point #3: personas & story tone). Ready for game-ai + frontend-story tickets.
Owners: game-ai (backstory *text* + voice card) + frontend-story (narration UI/sequencing + codex panel). Orchestrator owns this schema.
Builds on: sidekick-personas.md (APPROVED ids/voices), theme-tokens.md, ai-module.md, storyData.js, gameData.js.

## Tone + template sample

**Tone bar (unchanged from sidekick-personas.md):** PG, playful *archetype* not ethnic caricature, Sackboy/LittleBigPlanet toybox lightness — but with real *lore depth* (Clash of Clans / Assassin's Creed "codex" feel): both the player's cover *and* the sidekick get an origin, a motive, and a bond, narrated as sequenced story beats instead of one line. Copy stays in a natural voice, no filler. **The France/Marcel sample below is the approved register template for all six countries.**

**Sample — France (`louvre-thief`, sidekick Marcel), arrival beats as they'd render:**
1. "Paris doesn't fall for tourists. It falls for people who *belong* — and tonight you're going to belong well enough to walk out of the Louvre with something that isn't yours."
2. "Your cover is a restorer with after-hours clearance. The clearance is real. The restorer isn't. The only thing between you and a very French misunderstanding is an accent you haven't earned yet."
3. "Marcel planned this to the second — every guard's coffee break, every squeak in the parquet. He's in your earpiece now, and there's one variable he couldn't rehearse: your mouth."
4. "'Order the coffee like you mean it,' he says. 'A real Parisian would never phrase it the way you just did. Again — smoother.'"

Backstory canon behind it: *origin* — a former opera-house set-dresser who knows every service corridor in Paris; *motive* — in it for an *elegant* job, not the loot; *archetype tie* — the planner to your thief; *bond* — treats you as a promising protégé he can't quite trust with the good silver yet. Marcel's runtime voice (hints/corrections in scenarios) is generated from this same canon, so his earpiece line above and his in-scenario coaching are one character.

## Narrative structure

Three narration surfaces, all driven by catalog data (never hardcoded in the popup):
- **Framing narrative** (`FRAMING_NARRATIVE`, one-time, first launch): the langtourist frame. **Keep as-is.**
- **Per-country arrival popup** (first visit to each country): promoted from today's 2 beats to a **sequenced 3–5 beat backstory** — cover setup → the disguise's stakes → the sidekick's origin/bond → the sidekick's first-contact voice line. Delivered **one beat per page, tap-to-continue** in `CharacterStoryPopup.jsx` (each page keeps the existing word-reveal cascade).
- **Lore codex panel** (re-openable): players re-read each character's full story, Assassin's-Creed-codex style. Renders the same `PERSONA_CANON` beats; a country's codex entry **unlocks when the player first arrives there**. Frontend-story owns this panel and where it opens from (profile/country screen).

## Data contract — single canon, two readers

The hard rule (owner): popup lore and in-scenario sidekick voice **must not diverge.** Since the popup runs in the Vite client and the sidekick voice is generated in `node/`, a single source must be importable by **both** runtimes. Therefore:

**`shared/personaCanon.js`** — a plain, dependency-free ESM module at repo root, the single source of truth, keyed by `characterId` (the shared persona key from sidekick-personas.md):

```js
PERSONA_CANON[characterId] = {
  id, name, role,                    // shared persona key + sidekick identity
  cover: {                           // the PLAYER's disguise — elaborated lore
    type,                            // 'Art Thief' (mirrors CHARACTERS[country].type)
    logline,                         // one-line hook (was CHARACTERS[country].story)
    identity,                        // who you pose as ('a restorer with after-hours clearance')
    stakes,                          // what the cover is for / what's at risk
  },
  sidekick: {                        // the SIDEKICK's own lore
    origin, motivation, archetypeTie, bond,
  },
  beats: [ '…', '…', '…' ],          // ordered narration paragraphs, ONE PER PAGE
                                     // (arrival popup + codex both render these)
  voice: { register, catchphrase,    // runtime voice card
           praise, correct },
}
```

All field values are strings. `beats` is authored so each entry is a self-contained page (tap-to-continue); 3–5 entries per character.

Readers:
- **frontend-story** — `client/src/storyData.js` imports `PERSONA_CANON`; `getArrivalStory` returns `{ beats, sidekick:{name,role,catchphrase}, cover }` for the popup and codex. `FRAMING_NARRATIVE` and the sidekick portrait/theme wiring stay where they are. Both surfaces consume `beats` (array of page strings) + the existing sidekick-card fields — no new content concepts, only paging + a codex view.
- **game-ai** — `node/lib/ai/persona.js` imports the same `PERSONA_CANON`; builds the sidekick system prompt from `cover` + `sidekick` + `voice`, threaded through `generateTurn.sidekickLine` and `evaluateResponse.teachingNote`/`sidekickLine`. Does **not** re-author lore in the prompt file; it references the canon so voice and story stay one.

`gameData.js` `CHARACTERS[country].story` becomes the derived `cover.logline` (kept for the country-select card), not a second copy.

## Ownership seam (precise)

- **game-ai owns the words**: every string value in `PERSONA_CANON` (cover lore, sidekick lore, `beats`, `voice` card) — authored to the France/Marcel register template. Persona-voice consistency is its charter; this copy is what sign-off #3 ratified.
- **frontend-story owns the presentation**: the tap-to-continue arrival popup, the re-openable **lore codex panel** (per-country unlock on arrival), sidekick-card layout, theme-token integration, and the `getArrivalStory` shape it consumes. It renders `beats`; it does not write them.
- **Orchestrator owns the schema**: the field shape above and the `shared/personaCanon.js` location.

Enforcement: one canon, two importers → the two surfaces cannot drift.

## Constraints

- PG; playful archetype, never ethnic caricature; culturally respectful (Parisian sophistication, expedition scholarship, showbiz hustle — as light tropes, not mockery). Brazil stays on the owner-approved softened framing (smuggling ring of stolen art, not a cartel).
- Copy in a natural voice, no self-promo padding, smallest correct output.
- Works with existing theme tokens (theme-tokens.md) — the popup already reads `--accent*`, `--motif-texture`, `--sidekick-portrait`; narration and the codex add no per-component colors.
- No behavioral logic here beyond copy + a pure `getArrivalStory`; any pure selector (paging, codex-unlock derivation) gets a Vitest spec (frontend). Codex-unlock state is derived from the player's server-side unlocked-countries truth — no client-trusted unlock flag. No economy/server mutation surface touched.

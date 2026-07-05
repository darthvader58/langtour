# Contract: character theme tokens

Status: FROZEN (Phase 2). Agreed between frontend-story (owner of countryTheme.js) and game-ai (sidekick identity).

## Shape
`countryTheme.js` grows from `{accent, soft, ink, glow}` to a full token set keyed by **country name** (existing key, kept), each entry carrying its character:

```js
THEMES[country] = {
  characterId,           // e.g. 'shanghai-spy' — must match personaId in sidekick-personas.md
  palette: { accent, soft, ink, glow },   // existing four, unchanged semantics
  surface: { bg, card, border },          // page/card/border tints derived from the archetype
  motif:   { texture, icon },             // CSS background token + emoji/icon slug for headers
  sidekick:{ id, name, portrait },        // portrait = asset path; id/name from sidekick-personas.md
}
```

## CSS variables (the only way components consume theme)
Existing vars stay byte-identical so nothing breaks: `--accent`, `--accent-soft`, `--accent-ink`, `--accent-glow`, `--accent-10/15/20/25/30/40/55`.
Added by `getCountryThemeStyle`: `--surface-bg`, `--surface-card`, `--surface-border`, `--motif-texture`, `--sidekick-portrait` (url()).

Rules: no per-component hardcoded colors; components read vars only. Unknown country falls back to China theme (existing behavior, kept). New countries are data-only additions to `THEMES` + catalog.

## Seam with game-ai
`characterId`/`sidekick.id` is the shared key: game-ai selects persona voice by it (`personaId` in ai-module.md ctx), frontend selects portrait/palette by it. Neither side invents ids — the list lives in sidekick-personas.md.

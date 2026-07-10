// superset -> emoji for scenario headers/cards. The server sends `superset`
// (never an icon) on generate/list responses (docs/contracts/scenario-list.md
// "Header truth"); this is the one place the client maps that string to a
// glyph, so GameplayPhase and the mission list agree on the same icon.
export const SUPERSET_ICONS = {
  'meeting people': '\u{1F91D}', // 🤝
  'food & stuff': '\u{1F35C}', // 🍜
  'getting around': '\u{1F695}', // 🚕
  'money & shopping': '\u{1F6CD}\u{FE0F}', // 🛍️
  'staying somewhere': '\u{1F3E8}', // 🏨
  'help & health': '\u{2695}\u{FE0F}', // ⚕️
}

export const DEFAULT_SCENARIO_ICON = '\u{1F5FA}\u{FE0F}' // 🗺️

export function iconForSuperset(superset) {
  return SUPERSET_ICONS[superset] ?? DEFAULT_SCENARIO_ICON
}

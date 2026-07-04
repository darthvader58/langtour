// Language names shown to Gemini in prompts. Must cover every langCode in the
// game catalog — the old inline maps in scenario.js only had zh/hi/fr/es and
// silently fell back to Mandarin for ar/pt, which is the bug this fixes.
export const LANGUAGE_NAMES = {
  zh: 'Mandarin Chinese',
  hi: 'Hindi',
  fr: 'French',
  es: 'Spanish',
  ar: 'Modern Standard Arabic',
  pt: 'Brazilian Portuguese',
};

export function languageName(langCode) {
  return LANGUAGE_NAMES[langCode] ?? LANGUAGE_NAMES.zh;
}

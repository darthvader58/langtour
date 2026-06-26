import { generateText } from 'ai';
import { getDialogModel } from './model.js';
import { getSidekick } from './sidekick.js';
import { resolveCountry, assertScenarioInCatalog, assertLangMatchesCountry, assertTargetWordsKnown } from './catalog.js';

const LANGUAGE_NAMES = { hi: 'Hindi', fr: 'French', es: 'Spanish', zh: 'Mandarin' };

const FALLBACK_NPC_LINE = {
  zh: '你好！你想买什么？',
  pinyin: 'nǐ hǎo! nǐ xiǎng mǎi shénme?',
  en: 'Hello! What would you like to buy?',
};

const DEFAULT_EXPECTED_INTENT = 'Respond to the NPC using one of the target words in a way that fits the situation.';

// forestSlice can arrive in either shape:
//  - contract 03's idealized { mastered: [{expression,meaning}], dueForResurfacing: [...] }
//  - T-A's actual getForestProfile() return, { static: string[], dynamic: string[] }
// Normalize both down to short label strings for the prompt; never throw on a
// missing/empty slice since forest data is an enrichment, not a requirement.
function summarizeForestSlice(forestSlice) {
  if (!forestSlice || typeof forestSlice !== 'object') return { masteredLabels: [], resurfaceLabels: [] };

  const toLabel = (item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && item.expression) {
      return item.meaning ? `${item.expression} (${item.meaning})` : item.expression;
    }
    return null;
  };

  const masteredSource = Array.isArray(forestSlice.mastered) ? forestSlice.mastered : forestSlice.static;
  const resurfaceSource = Array.isArray(forestSlice.dueForResurfacing) ? forestSlice.dueForResurfacing : forestSlice.dynamic;

  const masteredLabels = (Array.isArray(masteredSource) ? masteredSource : []).map(toLabel).filter(Boolean);
  const resurfaceLabels = (Array.isArray(resurfaceSource) ? resurfaceSource : []).map(toLabel).filter(Boolean);

  return { masteredLabels, resurfaceLabels };
}

/**
 * Generates the next turn of a scenario: the NPC's line, an optional
 * sidekick coach beat, the one-sentence expected intent (the eval anchor),
 * and the authoritative target-word set for this turn.
 *
 * Contract: /Users/shashwatraj/langtour-memory/contracts/03-lib-ai-contract.md
 *
 * @param {{
 *   userId?: string,
 *   countryCode?: string,
 *   scenarioId?: string,
 *   scenarioContext: string,
 *   targetWords: Array<{ id?: number, expression: string, reading?: string, meaning: string }>,
 *   previousTurns?: Array<{ speaker: string, text: string }>,
 *   langCode: string,
 *   forestSlice?: { mastered?: Array, dueForResurfacing?: Array, static?: string[], dynamic?: string[] },
 * }} ctx
 * @param {{ model?: import('ai').LanguageModel, skipCatalogValidation?: boolean }} [opts] -
 *   opts.model lets tests inject a mock model; production callers omit it.
 *   opts.skipCatalogValidation lets callers that have already validated (or
 *   that intentionally omit countryCode/scenarioId — legacy callers pre-dating
 *   contract 03) skip the DB round trip.
 * @returns {Promise<{
 *   npcLine: { zh: string, pinyin: string, en: string },
 *   sidekickLine: string | null,
 *   expectedIntent: string,
 *   targetWords: Array<{ id?: number, expression: string, weight: number }>,
 * }>}
 */
export async function generateTurn(ctx, opts = {}) {
  const { scenarioContext, targetWords, previousTurns, langCode, countryCode, scenarioId, forestSlice, userId } = ctx;

  let sidekickKey = countryCode;
  if (!opts.skipCatalogValidation && (countryCode || scenarioId)) {
    const country = await resolveCountry(countryCode);
    if (scenarioId) await assertScenarioInCatalog(country.dbCode, scenarioId);
    assertLangMatchesCountry(langCode, country.langCode);
    sidekickKey = country.shortCode;
  }
  if (!opts.skipCatalogValidation) {
    await assertTargetWordsKnown(targetWords ?? []);
  }

  const model = opts.model || getDialogModel({ userId, scenarioId });
  const languageName = LANGUAGE_NAMES[langCode] || 'Mandarin';
  const sidekick = getSidekick(sidekickKey);
  const { masteredLabels, resurfaceLabels } = summarizeForestSlice(forestSlice);

  const prompt = `
You are writing ONE short line of NPC dialogue for a tourist-language learning game.
Setting: a ${scenarioContext} scenario. The player is a ${languageName} learner in disguise as a Sherlock-style traveler.
Their coach/sidekick is ${sidekick.name} (${sidekick.role}). ${sidekick.voice}

Write the NEXT NPC line. Rules:
- Under 15 words/characters, natural spoken ${languageName} for a tourist situation.
- On-topic for the scenario only. PG, age-appropriate, no violence/romance/politics.
- It should naturally prompt the player to respond using one of these target words:
  ${(targetWords ?? []).map((w) => `${w.expression} (${w.meaning})`).join(', ')}
${resurfaceLabels.length ? `- If natural, lightly favor a setup that could also use a word the player is rusty on: ${resurfaceLabels.slice(0, 3).join(', ')}.` : ''}
${masteredLabels.length ? `- The player already knows: ${masteredLabels.slice(0, 5).join(', ')} — don't be afraid to assume those.` : ''}

Previous conversation:
${previousTurns?.length ? previousTurns.map((t) => `${t.speaker}: ${t.text}`).join('\n') : 'None — this is the opening line.'}

Also write ONE short English sentence describing exactly what the player should communicate back (the
"expected intent" — this anchors how the player's reply will be graded), and optionally one short
in-character line from ${sidekick.name} coaching the player before they respond (or null if no beat fits here).
${sidekick.name}'s line must match their voice above, stay PG, and must NOT contain the answer sentence verbatim.

Return ONLY a JSON object, no markdown fences:
{
  "zh": "Text in ${languageName}",
  "pinyin": "Pronunciation/romanization of the text",
  "en": "English translation",
  "expectedIntent": "One sentence describing what the player should express",
  "sidekickLine": "In-character coach beat, or null"
}
`;

  const { text } = await generateText({ model, prompt });
  const match = text.match(/\{[\s\S]*\}/);
  const parsed = match ? safeParse(match[0]) : null;

  const npcLine = parsed
    ? { zh: parsed.zh ?? FALLBACK_NPC_LINE.zh, pinyin: parsed.pinyin ?? FALLBACK_NPC_LINE.pinyin, en: parsed.en ?? FALLBACK_NPC_LINE.en }
    : { ...FALLBACK_NPC_LINE };

  const expectedIntent = (parsed && typeof parsed.expectedIntent === 'string' && parsed.expectedIntent.trim())
    || DEFAULT_EXPECTED_INTENT;

  const sidekickLine = parsed && typeof parsed.sidekickLine === 'string' && parsed.sidekickLine.trim()
    ? parsed.sidekickLine.trim()
    : null;

  const weightedTargetWords = (targetWords ?? []).map((w) => ({
    id: w.id,
    expression: w.expression,
    weight: 1,
  }));

  return { npcLine, sidekickLine, expectedIntent, targetWords: weightedTargetWords };
}

function safeParse(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

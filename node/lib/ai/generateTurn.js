import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_API_KEY } from '../config.js';

const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});

const LANGUAGE_NAMES = { hi: 'Hindi', fr: 'French', es: 'Spanish', zh: 'Mandarin' };

const FALLBACK_NPC_LINE = {
  zh: '你好！你想买什么？',
  pinyin: 'nǐ hǎo! nǐ xiǎng mǎi shénme?',
  en: 'Hello! What would you like to buy?',
};

/**
 * Generates the next NPC line of dialogue for a scenario turn.
 *
 * Behavior-preserving lift of the dialog-generation logic that previously
 * lived inline in routes/scenario.js's POST /api/scenario/generate handler.
 * Same prompt, same model, same output shape — this is T-C (extraction);
 * T-D (game-ai) replaces the prompt/eval internals against contract 03
 * without the route layer changing.
 *
 * @param {{
 *   scenarioContext: string,
 *   targetWords: Array<{ expression: string, meaning: string }>,
 *   previousTurns?: Array<{ speaker: string, text: string }>,
 *   langCode: string,
 * }} ctx
 * @param {{ model?: import('ai').LanguageModel }} [opts] - opts.model lets
 *   tests inject a mock model; production callers omit it and get Gemini.
 * @returns {Promise<{ zh: string, pinyin: string, en: string }>}
 */
export async function generateTurn(ctx, opts = {}) {
  const { scenarioContext, targetWords, previousTurns, langCode } = ctx;
  const model = opts.model || google('gemini-2.5-flash'); // or whichever model is active

  const languageName = LANGUAGE_NAMES[langCode] || 'Mandarin';

  const prompt = `
You are an NPC in a ${scenarioContext} scenario. The user is a ${languageName} language learner.
Your goal is to generate the NEXT line of dialogue for the NPC.
Keep it short (under 15 words/characters). It should prompt the user to respond using one of these target words:
${targetWords.map(w => w.expression + ' (' + w.meaning + ')').join(', ')}

Previous conversation:
${previousTurns ? previousTurns.map(t => t.speaker + ': ' + t.text).join('\n') : 'None'}

Return ONLY a JSON object:
{ "zh": "Text in ${languageName}", "pinyin": "Pronunciation/romanization of the text", "en": "English translation" }
`;

  const { text } = await generateText({ model, prompt });

  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : { ...FALLBACK_NPC_LINE };
}

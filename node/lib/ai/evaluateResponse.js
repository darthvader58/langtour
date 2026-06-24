import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_API_KEY } from '../config.js';

const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});

const LANGUAGE_NAMES = { hi: 'Hindi', fr: 'French', es: 'Spanish', zh: 'Mandarin' };

const FALLBACK_RESULT = { status: 'failed', feedback: 'Could not evaluate.', usedWord: null };

/**
 * Evaluates the user's transcribed response against the scenario's target
 * words and returns a pass/fail verdict with feedback.
 *
 * Behavior-preserving lift of the evaluation logic that previously lived
 * inline in routes/scenario.js's POST /api/scenario/evaluate handler. Same
 * prompt, same model, same "at least one target word" pass criterion, same
 * output shape. T-D (game-ai) is responsible for tightening this to the
 * contextual-appropriateness + grammar bar described in contract 03 — this
 * ticket only relocates the existing logic.
 *
 * @param {{
 *   scenarioContext: string,
 *   targetWords: Array<{ expression: string }>,
 *   npcLine: { zh: string, en: string },
 *   userResponse: string,
 *   langCode: string,
 * }} ctx
 * @param {{ model?: import('ai').LanguageModel }} [opts] - opts.model lets
 *   tests inject a mock model; production callers omit it and get Gemini.
 * @returns {Promise<{ status: 'passed' | 'failed', feedback: string, usedWord: string | null }>}
 */
export async function evaluateResponse(ctx, opts = {}) {
  const { scenarioContext, targetWords, npcLine, userResponse, langCode } = ctx;
  const model = opts.model || google('gemini-2.5-flash');

  const languageName = LANGUAGE_NAMES[langCode] || 'Mandarin';

  const prompt = `
You are a strict but helpful ${languageName} teacher.
The user is in a ${scenarioContext} scenario.
The NPC just said: "${npcLine.zh}" (${npcLine.en})
The user responded with: "${userResponse}" (transcribed via Speech-to-Text).

Did the user successfully respond to the NPC appropriately?
CRITICAL RULES:
1. The user ONLY needs to use AT LEAST ONE of the target words correctly. Do NOT require them to use all of them.
2. Be forgiving of minor grammar mistakes or imperfect translations as long as the general meaning is clear and one target word is used correctly.
Target words: ${targetWords.map(w => w.expression).join(', ')}

Return ONLY a JSON object:
{
  "status": "passed" | "failed",
  "feedback": "Short encouraging feedback explaining why they failed or succeeded in English.",
  "usedWord": "The target word they successfully used (or null)"
}
`;

  const { text } = await generateText({ model, prompt });

  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : { ...FALLBACK_RESULT };
}

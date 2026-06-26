import { generateText } from 'ai';
import { getDialogModel } from './model.js';
import { getSidekick } from './sidekick.js';
import { resolveCountry, assertScenarioInCatalog, assertLangMatchesCountry, assertTargetWordsKnown } from './catalog.js';

const LANGUAGE_NAMES = { hi: 'Hindi', fr: 'French', es: 'Spanish', zh: 'Mandarin' };

const VALID_ERROR_KINDS = new Set([
  'wrong_register',
  'wrong_word',
  'broken_grammar',
  'off_topic',
  'incomprehensible_pronunciation',
]);

const FALLBACK_RESULT = {
  pass: false,
  errorKind: 'off_topic',
  teachingNote: "I couldn't quite evaluate that — try answering the NPC again, using one of the highlighted words.",
  sidekickLine: '',
  usedWordIds: [],
  // Legacy mirror fields (contract: route adapts these into the wire shape).
  status: 'failed',
  feedback: "Could not evaluate. Try answering the NPC again, using one of the highlighted words.",
  usedWord: null,
};

const PRONUNCIATION_ACCURACY_FLOOR = 50;

/**
 * Evaluates the user's transcribed response against the scenario's target
 * words and returns a contract-03 EvaluateResult: a server-authoritative
 * pass/fail verdict, the failure category, a teaching note that nudges
 * without handing over the answer, an in-character sidekick beat, and the
 * server-attested subset of target words actually used.
 *
 * Pass requires BOTH:
 *  (a) the utterance is a contextually appropriate reply to npcLine for
 *      expectedIntent — not just "contains a target word", and
 *  (b) the utterance is grammatically sound for the situation.
 * Keyword presence alone never passes; the prompt below says so explicitly
 * and is the fix for the pre-existing keyword-presence bug T-C flagged.
 *
 * Contract: /Users/shashwatraj/langtour-memory/contracts/03-lib-ai-contract.md
 * Speech-scoring interface: /Users/shashwatraj/langtour-memory/contracts/05-speech-scoring-interface.md
 *
 * @param {{
 *   userId?: string,
 *   countryCode?: string,
 *   scenarioId?: string,
 *   scenarioContext: string,
 *   targetWords: Array<{ id?: number, expression: string, meaning?: string }>,
 *   npcLine: { zh: string, en: string },
 *   expectedIntent?: string,
 *   userResponse: string,
 *   langCode: string,
 * }} ctx
 * @param {{ accuracy: number, fluency: number, completeness: number, perWord: Array<{word: string, score: number}> } | null} [pronScore] -
 *   from the speech scorer (contract 05). Optional — omitted/null falls back
 *   to a transcript-only judgment (no incomprehensible_pronunciation verdict).
 * @param {{ model?: import('ai').LanguageModel, skipCatalogValidation?: boolean }} [opts]
 * @returns {Promise<{
 *   pass: boolean,
 *   errorKind: null | 'wrong_register' | 'wrong_word' | 'broken_grammar' | 'off_topic' | 'incomprehensible_pronunciation',
 *   teachingNote: string,
 *   sidekickLine: string,
 *   usedWordIds: Array<number|string>,
 *   status: 'passed' | 'failed',
 *   feedback: string,
 *   usedWord: string | null,
 * }>}
 */
export async function evaluateResponse(ctx, pronScore = null, opts = {}) {
  // Behavior-preserving call-shape note: T-C's evaluateResponse(ctx, opts) had
  // no pronScore arg. Contract 03 adds it as the second positional arg ahead
  // of opts; callers that still pass (ctx, opts) as two args (no pronScore)
  // are detected by opts actually being the pronScore-shaped object missing
  // model/skipCatalogValidation keys — to avoid that ambiguity entirely we
  // require the route to pass null explicitly when it has no score yet.
  const { scenarioContext, targetWords = [], npcLine, expectedIntent, userResponse, langCode, countryCode, scenarioId, userId } = ctx;

  let sidekickKey = countryCode;
  if (!opts.skipCatalogValidation && (countryCode || scenarioId)) {
    const country = await resolveCountry(countryCode);
    if (scenarioId) await assertScenarioInCatalog(country.dbCode, scenarioId);
    assertLangMatchesCountry(langCode, country.langCode);
    sidekickKey = country.shortCode;
  }
  if (!opts.skipCatalogValidation) {
    await assertTargetWordsKnown(targetWords);
  }

  const model = opts.model || getDialogModel({ userId, scenarioId });
  const languageName = LANGUAGE_NAMES[langCode] || 'Mandarin';
  const sidekick = getSidekick(sidekickKey);

  const prompt = buildEvaluationPrompt({ languageName, scenarioContext, npcLine, expectedIntent, targetWords, userResponse, sidekick });

  const { text } = await generateText({ model, prompt });
  const match = text.match(/\{[\s\S]*\}/);
  const parsed = match ? safeParse(match[0]) : null;

  if (!parsed) return { ...FALLBACK_RESULT };

  return shapeResult(parsed, { targetWords, pronScore, sidekick });
}

function buildEvaluationPrompt({ languageName, scenarioContext, npcLine, expectedIntent, targetWords, userResponse, sidekick }) {
  return `
You are ${sidekick.name}, ${sidekick.role} and ${languageName}-speaking coach for a tourist-language learning game.
${sidekick.voice}

Situation: a ${scenarioContext} scenario. The NPC just said: "${npcLine?.zh ?? ''}" (${npcLine?.en ?? ''}).
${expectedIntent ? `What the player should communicate back: ${expectedIntent}` : ''}
The player (speaking ${languageName}) responded, transcribed via speech-to-text as: "${userResponse}"

Target words available this turn: ${targetWords.map((w) => w.expression).join(', ') || '(none)'}

Judge the response. PASS requires BOTH of these — using a target word is NOT enough on its own:
1. The reply is a contextually appropriate answer to the NPC for the stated intent (not off-topic, not the wrong register
   for a tourist talking to a stranger/clerk/vendor).
2. The reply is grammatically sound ${languageName} for this situation (not just a word salad or a translation-shaped
   sentence that no native speaker would say).

If it fails, pick exactly ONE root cause — the first one that applies, in this priority order:
- "off_topic": doesn't answer what the NPC asked / unrelated to the situation.
- "wrong_register": answers the right thing but in a tone/formality that doesn't fit (e.g. too casual/rude for the situation).
- "wrong_word": uses an incorrect or mismatched word for the intended meaning.
- "broken_grammar": right words/topic, but the grammar is broken enough that it doesn't read as a real sentence.
If it passes, errorKind must be null.

Also report which of the target words (by exact expression string from the list above) the player actually used
correctly in a way that fits the sentence — only ones genuinely used, never guess or include one "to be nice".

Write a short teachingNote in English, in ${sidekick.name}'s voice, that:
- names what's off (register / word choice / grammar / topic) when it fails, or briefly praises what worked when it passes,
- nudges the player toward fixing it themselves,
- absolutely must NOT contain the fully corrected target-language sentence — the player has to produce it themselves.

Also write a short sidekickLine: one in-character beat from ${sidekick.name} reacting to this attempt (PG, on-topic, no
caricature, matches the voice above). It may overlap in tone with teachingNote but should read like dialogue, not a rubric.

Return ONLY a JSON object, no markdown fences:
{
  "pass": true | false,
  "errorKind": null | "off_topic" | "wrong_register" | "wrong_word" | "broken_grammar",
  "usedWordExpressions": ["exact expression strings from the target word list that were genuinely used"],
  "teachingNote": "...",
  "sidekickLine": "..."
}
`;
}

// Maps the model's verdict + claimed-used expressions into the contract-03
// result shape, applies the pronunciation-score override from contract 05,
// and derives usedWordIds strictly from ctx.targetWords (never from
// anything the model invents) — this is the unforgeable boundary the route
// forwards into record_scenario_turn.
function shapeResult(parsed, { targetWords, pronScore, sidekick }) {
  const byExpression = new Map(targetWords.map((w) => [w.expression, w]));

  const claimedExpressions = Array.isArray(parsed.usedWordExpressions) ? parsed.usedWordExpressions : [];
  const usedWords = claimedExpressions
    .filter((expr) => byExpression.has(expr))
    .map((expr) => byExpression.get(expr));
  const usedWordIds = usedWords.map((w) => w.id).filter((id) => id !== undefined && id !== null);

  let pass = Boolean(parsed.pass);
  let errorKind = pass ? null : normalizeErrorKind(parsed.errorKind);
  let teachingNote = sanitizeTeachingNote(parsed.teachingNote);
  const sidekickLine = typeof parsed.sidekickLine === 'string' && parsed.sidekickLine.trim()
    ? parsed.sidekickLine.trim()
    : `${sidekick.name}: Keep going — you've got this.`;

  // Contract 05: distinguish "wrong/off-topic reply" from "right reply,
  // unintelligible delivery". Only overrides toward the pronunciation
  // verdict — never used to flip a fail into a pass, since accuracy alone
  // doesn't establish meaning+grammar correctness.
  if (pronScore && typeof pronScore.accuracy === 'number') {
    const targetExpressions = new Set(targetWords.map((w) => w.expression));
    const targetedMisscores = Array.isArray(pronScore.perWord)
      ? pronScore.perWord.filter((pw) => targetExpressions.has(pw.word) && pw.score < PRONUNCIATION_ACCURACY_FLOOR)
      : [];
    if (pronScore.accuracy < PRONUNCIATION_ACCURACY_FLOOR && targetedMisscores.length > 0) {
      pass = false;
      errorKind = 'incomprehensible_pronunciation';
      teachingNote = `${sidekick.name} couldn't quite make out what you said — try saying it again, a little slower and clearer.`;
    }
  }

  // Unintelligible audio shouldn't credit word usage — the server can't
  // actually attest the player said the word if it couldn't be understood.
  const finalUsedWordIds = errorKind === 'incomprehensible_pronunciation' ? [] : usedWordIds;

  return {
    pass,
    errorKind: pass ? null : errorKind,
    teachingNote,
    sidekickLine,
    usedWordIds: finalUsedWordIds,
    // Legacy mirror fields for the route adapter / pre-T-D consumers.
    status: pass ? 'passed' : 'failed',
    feedback: teachingNote,
    usedWord: pass && usedWords.length > 0 ? usedWords[0].expression : null,
  };
}

function normalizeErrorKind(value) {
  return VALID_ERROR_KINDS.has(value) ? value : 'off_topic';
}

// Last-resort fallback if the model returns an empty/non-string teachingNote.
// The "don't hand over the corrected sentence" rule itself is enforced via
// the prompt instruction in buildEvaluationPrompt, not parsed here — there's
// no fixed answer key to diff against (replies are free-form intent
// matches, not a single correct sentence), so this stays a presence check.
function sanitizeTeachingNote(note) {
  const fallback = "That didn't quite land — think about what would actually fit here, then try again.";
  if (typeof note !== 'string' || !note.trim()) return fallback;
  return note.trim();
}

function safeParse(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

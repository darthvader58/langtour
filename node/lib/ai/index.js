// Public seam for the AI dialog/evaluation module — see docs/contracts/ai-module.md.
// The route layer (node/routes/scenario.js, owned by backend-graph) calls
// generateTurn/evaluateResponse and nothing else in here. This module never
// touches the DB or the economy; a pass verdict is the route's cue, not ours.
import { generateStructured as defaultGenerateStructured } from './model.js';
import { getPersona, PERSONAS } from './personas.js';
import { LANGUAGE_NAMES, languageName } from './languages.js';
import { buildTurnPrompt, turnSchema } from './prompts/generate_turn.js';
import {
  buildEvaluationPrompt,
  evaluationSchema,
  ERROR_KINDS,
} from './prompts/evaluate_response.js';

// Strip punctuation/whitespace so "水!" still counts as the bare word 水.
function normalize(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Deterministic pre-check: a transcript that is exactly one target word (or a
// single token) can never be a meaningful reply. Failing it here keeps the
// rubric's floor unfakeable and saves a model call.
function detectBareWord(transcript, targetWords) {
  const norm = normalize(transcript);
  if (!norm) return true;
  if (targetWords.some((w) => normalize(w.expression) === norm)) return true;
  // For space-delimited scripts a single token is a bare word. Chinese writes
  // sentences without spaces, so the token heuristic must not apply there —
  // zh bare words are caught by the exact-target match above or the model.
  if (/\p{Script=Han}/u.test(norm)) return false;
  return !norm.includes(' ');
}

function mapUsedWords(usedExpressions, targetWords) {
  const byExpression = new Map(targetWords.map((w) => [normalize(w.expression), w.id]));
  const ids = [];
  for (const expr of usedExpressions ?? []) {
    const id = byExpression.get(normalize(expr));
    if (id != null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function normalizeErrorKind(raw, pass) {
  if (pass) return null;
  return ERROR_KINDS.includes(raw) ? raw : 'too-vague';
}

// Factory so tests inject a stub model caller; production uses the default
// generateObject-backed one in model.js.
export function createAi({ generateStructured = defaultGenerateStructured } = {}) {
  async function generateTurn(ctx) {
    const persona = getPersona(ctx.personaId);
    const object = await generateStructured({
      schema: turnSchema,
      prompt: buildTurnPrompt(ctx, persona),
    });

    // Model-introduced words have no DB id yet (id: null); the route layer
    // resolves/creates ids before persisting. Never duplicate an existing word.
    const targetWords = [...ctx.targetWords];
    const grown = object.newWord;
    if (
      grown?.expression &&
      !targetWords.some((w) => normalize(w.expression) === normalize(grown.expression))
    ) {
      targetWords.push({ id: null, ...grown });
    }

    return {
      npcLine: {
        text: object.npcText,
        reading: object.npcReading,
        translation: object.npcTranslation,
      },
      sidekickLine: object.sidekickText?.trim() ? { text: object.sidekickText.trim() } : null,
      expectedIntent: object.expectedIntent,
      targetWords,
    };
  }

  async function evaluateResponse(ctx, transcript, pronScore = null) {
    const persona = getPersona(ctx.personaId);

    if (detectBareWord(transcript, ctx.targetWords)) {
      return {
        pass: false,
        errorKind: 'bare-word',
        teachingNote:
          'A single word on its own is not an answer — build a full sentence around it that responds to what was asked.',
        sidekickLine: { text: `${persona.voice.catchphrase} One word won't pass here — give them a whole sentence.` },
        usedWords: [],
      };
    }

    const object = await generateStructured({
      schema: evaluationSchema,
      prompt: buildEvaluationPrompt(ctx, transcript, pronScore, persona),
    });

    const pass = object.pass === true;
    return {
      pass,
      errorKind: normalizeErrorKind(object.errorKind, pass),
      teachingNote: object.teachingNote ?? '',
      sidekickLine: { text: object.sidekickText ?? '' },
      usedWords: pass ? mapUsedWords(object.usedExpressions, ctx.targetWords) : [],
    };
  }

  return { generateTurn, evaluateResponse };
}

const defaultAi = createAi();
export const generateTurn = defaultAi.generateTurn;
export const evaluateResponse = defaultAi.evaluateResponse;

export { PERSONAS, getPersona, LANGUAGE_NAMES, languageName, ERROR_KINDS };

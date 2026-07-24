import { jsonSchema } from 'ai';
import { languageName } from '../languages.js';

export const ERROR_KINDS = [
  'off-topic',
  'too-vague',
  'bare-word',
  'grammar',
  'wrong-word',
  'wrong-register',
  // Set by the route from the server-side pronunciation scorer, not the model:
  // a target word pronounced badly enough to be a real mispronunciation.
  'mispronunciation',
];

// Structured-output schema for the verdict. usedExpressions carries surface
// forms; index.js maps them back to word ids from ctx.targetWords.
export const evaluationSchema = jsonSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    pass: { type: 'boolean' },
    errorKind: {
      type: 'string',
      enum: [...ERROR_KINDS, 'none'],
      description: 'The main problem when pass is false; "none" when pass is true',
    },
    teachingNote: {
      type: 'string',
      description: 'Names the error and nudges toward a fix. Never the full correct sentence.',
    },
    sidekickText: { type: 'string', description: 'In-character verdict line, English' },
    usedExpressions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Target-word expressions the learner used correctly',
    },
  },
  required: ['pass', 'errorKind', 'teachingNote', 'sidekickText', 'usedExpressions'],
});

function pronScoreLines(pronScore) {
  if (!pronScore) return '';
  const weak = (pronScore.perWord ?? [])
    .filter((w) => w.accuracy < 60)
    .map((w) => w.word)
    .join(', ');
  return `\nPronunciation signal (secondary — never the sole reason to fail): accuracy ${pronScore.accuracy}, fluency ${pronScore.fluency}${weak ? `; weakest words: ${weak}` : ''}.`;
}

export function buildEvaluationPrompt(ctx, transcript, pronScore, persona) {
  const lang = languageName(ctx.langCode);
  const lastNpc = [...(ctx.priorTurns ?? [])].reverse().find((t) => t.speaker === 'npc');
  const words = ctx.targetWords
    .map((w) => `${w.expression} (${w.meaning})`)
    .join('; ');

  return `You are a strict ${lang} evaluator inside a PG language-learning game. Scene: "${ctx.situation.title}" in ${persona.country}.
The local person just said: "${lastNpc ? lastNpc.text : ctx.situation.title}"
The learner replied (via speech-to-text, so tolerate minor transcription noise): "${transcript}"
Target words: ${words}${pronScoreLines(pronScore)}

The reply passes ONLY if ALL three hold:
1. It is a meaningful, contextually appropriate answer to what was just asked. A bare word fails (bare-word). A filler or generic sentence that merely contains a target word fails (too-vague). An answer to a different question fails (off-topic).
2. It is grammatically correct ${lang} for this everyday register. Broken structure fails (grammar); wrong formality fails (wrong-register). Tolerate accent and minor STT noise.
3. At least ONE target word that naturally fits this reply is used correctly. A target word that is actually MISused fails (wrong-word). But never fail a reply merely for omitting the other target words — the remaining words are practiced across later turns, one per turn. Do not tell the learner to add a specific missing word, "complete the set", or cram unrelated words into a single sentence.
Weigh context and grammar as heavily as vocabulary — saying the word is not enough, and a relevant, grammatical reply that uses one fitting word is a pass even if other target words are absent.

teachingNote: in English, name what went wrong and nudge toward the fix (e.g. which part to rethink). NEVER write out the full correct sentence. When pass is true, one line on what made it work.

sidekickText: the verdict in the voice of ${persona.name} — ${persona.voice.register}. Praise style: ${persona.voice.praiseStyle}. Correction style: ${persona.voice.correctionStyle}. Keep it PG, playful, one or two short sentences.

usedExpressions: exactly the target-word expressions used correctly (empty if none).
errorKind: the single main problem, or "none" when pass is true.`;
}

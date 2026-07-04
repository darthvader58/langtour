import { jsonSchema } from 'ai';
import { languageName } from '../languages.js';

// Structured-output schema for a dialog turn. Kept flat and small — Gemini's
// structured output works best with simple object shapes, and every property
// here costs tokens on each call.
export const turnSchema = jsonSchema({
  type: 'object',
  properties: {
    npcText: { type: 'string', description: 'NPC line in the target language' },
    npcReading: { type: 'string', description: 'Romanization/reading of the NPC line' },
    npcTranslation: { type: 'string', description: 'English translation of the NPC line' },
    sidekickText: {
      type: 'string',
      description: 'One short in-character coaching aside in English, or empty string for none',
    },
    expectedIntent: {
      type: 'string',
      description: 'One sentence: what a good learner reply accomplishes',
    },
    newWord: {
      type: 'object',
      description: 'A single new target word to introduce, only when the learner is ready',
      properties: {
        expression: { type: 'string' },
        reading: { type: 'string' },
        meaning: { type: 'string' },
      },
      required: ['expression', 'reading', 'meaning'],
    },
  },
  required: ['npcText', 'npcReading', 'npcTranslation', 'sidekickText', 'expectedIntent'],
});

const transcriptLines = (priorTurns) =>
  priorTurns && priorTurns.length
    ? priorTurns.map((t) => `${t.speaker}: ${t.text}`).join('\n')
    : 'None yet — this is the opening line.';

export function buildTurnPrompt(ctx, persona) {
  const lang = languageName(ctx.langCode);
  const words = ctx.targetWords
    .map((w) => `${w.expression} (${w.reading}) = ${w.meaning}`)
    .join('; ');

  return `You write one turn of a PG, family-friendly language-learning game for kids and adults.
Scene: a real-life tourist situation — "${ctx.situation.title}" (${ctx.situation.superset}) in ${persona.country}. The learner is practicing ${lang}.

Write the NEXT line for the in-scene local person (shopkeeper, waiter, passerby...). Rules:
- Short: under 15 words/characters. Natural, everyday ${lang} a tourist would really hear.
- It must invite the learner to answer using one of their target words: ${words}
- Stay strictly on the tourist situation. Never romantic, violent, scary, or off-topic content.

Sidekick aside (sidekickText): the learner's companion is ${persona.name}, ${persona.voice.register}. Backstory: ${persona.backstory} Write one short English aside in that voice hinting what to say — a nudge, not the answer. Use empty string if the scene needs no hint (turn ${ctx.turnIndex}).

expectedIntent: one plain-English sentence describing what a good reply accomplishes.

newWord: only if the conversation so far shows the learner handling the current words well, introduce ONE new beginner-level ${lang} word that fits this situation. Omit it otherwise.

Conversation so far:
${transcriptLines(ctx.priorTurns)}`;
}

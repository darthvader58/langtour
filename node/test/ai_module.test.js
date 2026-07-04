import test from 'node:test';
import assert from 'node:assert/strict';
import { createAi, getPersona, PERSONAS, languageName, LANGUAGE_NAMES } from '../lib/ai/index.js';
import { buildTurnPrompt } from '../lib/ai/prompts/generate_turn.js';
import { buildEvaluationPrompt } from '../lib/ai/prompts/evaluate_response.js';

const CTX = {
  userId: 'user-1',
  langCode: 'zh',
  countryCode: 'cn',
  scenarioId: 'street-market',
  situation: { id: 'street-market', title: 'Street Market', superset: 'food & stuff' },
  personaId: 'shanghai-spy',
  targetWords: [
    { id: 11, expression: '水', reading: 'shuǐ', meaning: 'water' },
    { id: 12, expression: '多少钱', reading: 'duōshǎo qián', meaning: 'how much' },
  ],
  priorTurns: [{ speaker: 'npc', text: '你想买什么？' }],
  turnIndex: 1,
};

// Stub model layer: records calls, returns a queued object. No live API calls.
function stubModel(objects) {
  const queue = Array.isArray(objects) ? [...objects] : [objects];
  const calls = [];
  const generateStructured = async ({ schema, prompt }) => {
    calls.push({ schema, prompt });
    if (!queue.length) throw new Error('stub exhausted');
    return queue.shift();
  };
  return { generateStructured, calls };
}

const PASS_VERDICT = {
  pass: true,
  errorKind: 'none',
  teachingNote: 'Clear question, right word, natural order.',
  sidekickText: 'Smooth work. Nobody looked twice.',
  usedExpressions: ['多少钱'],
};

test('bare word fails deterministically without calling the model', async () => {
  const { generateStructured, calls } = stubModel([]);
  const ai = createAi({ generateStructured });
  const result = await ai.evaluateResponse(CTX, '水');
  assert.equal(result.pass, false);
  assert.equal(result.errorKind, 'bare-word');
  assert.equal(result.usedWords.length, 0);
  assert.match(result.teachingNote, /sentence/i);
  // persona voice threaded into the verdict
  assert.match(result.sidekickLine.text, /blending into the crowd/);
  assert.equal(calls.length, 0);
});

test('bare word with punctuation and a single Latin token both fail as bare-word', async () => {
  const ai = createAi({ generateStructured: stubModel([]).generateStructured });
  assert.equal((await ai.evaluateResponse(CTX, '  水!! ')).errorKind, 'bare-word');
  const frCtx = { ...CTX, langCode: 'fr', personaId: 'louvre-thief', targetWords: [{ id: 3, expression: 'merci', reading: 'mɛʁsi', meaning: 'thank you' }] };
  assert.equal((await ai.evaluateResponse(frCtx, 'Bonjour')).errorKind, 'bare-word');
});

test('a full Chinese sentence is not flagged bare-word and reaches the model', async () => {
  const { generateStructured, calls } = stubModel(PASS_VERDICT);
  const ai = createAi({ generateStructured });
  const result = await ai.evaluateResponse(CTX, '这个多少钱？');
  assert.equal(calls.length, 1);
  assert.equal(result.pass, true);
});

test('vague filler sentence fails with too-vague and no usedWords', async () => {
  const { generateStructured } = stubModel({
    pass: false,
    errorKind: 'too-vague',
    teachingNote: 'The word is there but the sentence says nothing — answer the vendor\'s question.',
    sidekickText: "You're not blending into the crowd correctly. Say what you actually want.",
    usedExpressions: ['水'],
  });
  const ai = createAi({ generateStructured });
  const result = await ai.evaluateResponse(CTX, '我有东西，水，很好');
  assert.equal(result.pass, false);
  assert.equal(result.errorKind, 'too-vague');
  // failed turns never report used words, even if the model listed some
  assert.deepEqual(result.usedWords, []);
  assert.ok(result.teachingNote.length > 0);
});

test('good reply passes and maps usedExpressions to word ids', async () => {
  const { generateStructured } = stubModel(PASS_VERDICT);
  const ai = createAi({ generateStructured });
  const result = await ai.evaluateResponse(CTX, '老板，这个多少钱？');
  assert.equal(result.pass, true);
  assert.equal(result.errorKind, null);
  assert.deepEqual(result.usedWords, [12]);
  assert.equal(result.sidekickLine.text, 'Smooth work. Nobody looked twice.');
});

test('errorKind is normalized: unknown kinds become too-vague, pass forces null', async () => {
  const { generateStructured } = stubModel([
    { pass: false, errorKind: 'something-weird', teachingNote: 'x', sidekickText: 'y', usedExpressions: [] },
    { pass: true, errorKind: 'grammar', teachingNote: 'x', sidekickText: 'y', usedExpressions: ['水'] },
  ]);
  const ai = createAi({ generateStructured });
  const failed = await ai.evaluateResponse(CTX, '我想去那个地方看看');
  assert.equal(failed.errorKind, 'too-vague');
  const passed = await ai.evaluateResponse(CTX, '我想买一瓶水，谢谢');
  assert.equal(passed.errorKind, null);
  assert.deepEqual(passed.usedWords, [11]);
});

test('every documented errorKind is preserved on failure', async () => {
  for (const kind of ['off-topic', 'too-vague', 'grammar', 'wrong-word', 'wrong-register']) {
    const { generateStructured } = stubModel({
      pass: false, errorKind: kind, teachingNote: 'n', sidekickText: 's', usedExpressions: [],
    });
    const ai = createAi({ generateStructured });
    const result = await ai.evaluateResponse(CTX, '我昨天去了很远的地方旅行');
    assert.equal(result.errorKind, kind);
  }
});

test('persona lookup resolves all six ids with name, backstory and voice', () => {
  const ids = ['shanghai-spy', 'mumbai-star', 'louvre-thief', 'relic-hunter', 'tomb-scholar', 'rio-reporter'];
  assert.deepEqual(Object.keys(PERSONAS).sort(), [...ids].sort());
  for (const id of ids) {
    const p = getPersona(id);
    assert.ok(p.name, `${id} has a name`);
    assert.ok(p.backstory.length > 20, `${id} has a backstory`);
    assert.ok(p.voice.register && p.voice.catchphrase, `${id} has a voice card`);
  }
  // unknown id falls back rather than crashing a live scenario
  assert.equal(getPersona('nonexistent').name, getPersona('shanghai-spy').name);
});

test('language map covers ar and pt (old inline map fell back to Mandarin)', () => {
  assert.deepEqual(Object.keys(LANGUAGE_NAMES).sort(), ['ar', 'es', 'fr', 'hi', 'pt', 'zh']);
  assert.match(languageName('ar'), /Arabic/);
  assert.match(languageName('pt'), /Portuguese/);
  // prompts actually carry the right language name through
  const arCtx = { ...CTX, langCode: 'ar', personaId: 'tomb-scholar' };
  assert.match(buildTurnPrompt(arCtx, getPersona('tomb-scholar')), /Arabic/);
  const ptCtx = { ...CTX, langCode: 'pt', personaId: 'rio-reporter' };
  assert.match(buildEvaluationPrompt(ptCtx, 'Quanto custa isso?', null, getPersona('rio-reporter')), /Portuguese/);
});

test('generateTurn returns contract shape and threads persona into the prompt', async () => {
  const { generateStructured, calls } = stubModel({
    npcText: '你要几瓶水？',
    npcReading: 'nǐ yào jǐ píng shuǐ?',
    npcTranslation: 'How many bottles of water do you want?',
    sidekickText: 'Ask the price first. Stay casual.',
    expectedIntent: 'Ask how much the water costs.',
  });
  const ai = createAi({ generateStructured });
  const result = await ai.generateTurn(CTX);
  assert.deepEqual(result.npcLine, {
    text: '你要几瓶水？',
    reading: 'nǐ yào jǐ píng shuǐ?',
    translation: 'How many bottles of water do you want?',
  });
  assert.deepEqual(result.sidekickLine, { text: 'Ask the price first. Stay casual.' });
  assert.equal(result.expectedIntent, 'Ask how much the water costs.');
  assert.deepEqual(result.targetWords, CTX.targetWords);
  assert.match(calls[0].prompt, /Wren/);
  assert.match(calls[0].prompt, /PG/);
});

test('generateTurn grows targetWords with id:null for a new word, never duplicates', async () => {
  const grownTurn = {
    npcText: 'x', npcReading: 'x', npcTranslation: 'x', sidekickText: '', expectedIntent: 'x',
    newWord: { expression: '苹果', reading: 'píngguǒ', meaning: 'apple' },
  };
  const dupTurn = { ...grownTurn, newWord: { expression: '水', reading: 'shuǐ', meaning: 'water' } };
  const { generateStructured } = stubModel([grownTurn, dupTurn]);
  const ai = createAi({ generateStructured });

  const grown = await ai.generateTurn(CTX);
  assert.equal(grown.targetWords.length, 3);
  assert.deepEqual(grown.targetWords.at(-1), { id: null, expression: '苹果', reading: 'píngguǒ', meaning: 'apple' });
  // empty sidekickText → null, per contract
  assert.equal(grown.sidekickLine, null);

  const dup = await ai.generateTurn(CTX);
  assert.equal(dup.targetWords.length, 2);
});

test('evaluateResponse works with a pronScore and surfaces it to the prompt', async () => {
  const { generateStructured, calls } = stubModel(PASS_VERDICT);
  const ai = createAi({ generateStructured });
  const pron = { accuracy: 71, fluency: 64, completeness: 90, perWord: [{ word: '钱', accuracy: 42 }] };
  const result = await ai.evaluateResponse(CTX, '这个多少钱？', pron);
  assert.equal(result.pass, true);
  assert.match(calls[0].prompt, /accuracy 71/);
  assert.match(calls[0].prompt, /钱/);
  assert.match(calls[0].prompt, /secondary/);
});

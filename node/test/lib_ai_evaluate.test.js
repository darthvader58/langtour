// Tests for the real (meaning + grammar) evaluator that replaces the old
// keyword-presence pass bar — the headline change of T-D.
//
// Contract: /Users/shashwatraj/langtour-memory/contracts/03-lib-ai-contract.md
// Speech-scoring interface: /Users/shashwatraj/langtour-memory/contracts/05-speech-scoring-interface.md

import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV3 } from 'ai/test';

afterEach(() => {
  mock.restoreAll();
});

// Same env-before-import requirement as lib_ai_contract.test.js: lib/db/db.js
// throws at module-load time without these, and static imports are hoisted
// ahead of this assignment.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const { evaluateResponse } = await import('../lib/ai/evaluateResponse.js');
const { generateTurn } = await import('../lib/ai/generateTurn.js');
const { getSidekick } = await import('../lib/ai/sidekick.js');

function mockModel(jsonText) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: jsonText }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }),
  });
}

const MARKET_TARGET_WORDS = [
  { id: 101, expression: '你好', meaning: 'hello' },
  { id: 102, expression: '多少钱', meaning: 'how much' },
];

const BASE_CTX = {
  scenarioContext: 'street market',
  targetWords: MARKET_TARGET_WORDS,
  npcLine: { zh: '你好，欢迎光临！', en: 'Hello, welcome!' },
  expectedIntent: 'Greet the vendor back and ask how much the item costs.',
  langCode: 'zh',
};

function withModel(jsonText) {
  return { model: mockModel(jsonText), skipCatalogValidation: true };
}

test('pass requires both contextual appropriateness AND sound grammar — the model says pass', async () => {
  const result = await evaluateResponse(
    { ...BASE_CTX, userResponse: '你好，多少钱？' },
    null,
    withModel(
      '{ "pass": true, "errorKind": null, "usedWordExpressions": ["你好", "多少钱"], "teachingNote": "Great greeting and a clean question.", "sidekickLine": "Wen: textbook exchange." }'
    )
  );
  assert.equal(result.pass, true);
  assert.equal(result.errorKind, null);
  assert.deepEqual(result.usedWordIds.sort(), [101, 102]);
});

test('regression: keyword presence alone does NOT pass when the model judges the sentence incoherent', async () => {
  // This is exactly the old bug: the transcript contains a target word but
  // is not a real sentence ("I said the word but the sentence makes no
  // sense"). The model is the one making this call in production; here we
  // assert the evaluator surfaces that fail verdict untouched.
  const result = await evaluateResponse(
    { ...BASE_CTX, userResponse: '你好 钱 多少 你好 welcome welcome' },
    null,
    withModel(
      '{ "pass": false, "errorKind": "broken_grammar", "usedWordExpressions": ["你好"], "teachingNote": "You used a greeting word, but the rest is not a sentence a person would say here — try forming one clean question.", "sidekickLine": "Wen: words are there, the sentence is not." }'
    )
  );
  assert.equal(result.pass, false);
  assert.equal(result.errorKind, 'broken_grammar');
  // Failing verdicts still report which words were used (for teaching
  // context) but usedWordIds is what the route would forward to the economy
  // RPC, and only on a pass does the route call that RPC at all.
  assert.deepEqual(result.usedWordIds, [101]);
});

for (const errorKind of ['wrong_register', 'wrong_word', 'broken_grammar', 'off_topic']) {
  test(`errorKind "${errorKind}" passes through unmodified from the model's verdict`, async () => {
    const result = await evaluateResponse(
      { ...BASE_CTX, userResponse: 'something not quite right' },
      null,
      withModel(
        JSON.stringify({
          pass: false,
          errorKind,
          usedWordExpressions: [],
          teachingNote: `That has a problem with ${errorKind.replace('_', ' ')}; think about the situation and try again.`,
          sidekickLine: 'Wen: not quite — try once more.',
        })
      )
    );
    assert.equal(result.pass, false);
    assert.equal(result.errorKind, errorKind);
  });
}

test('an invalid/unrecognized errorKind from the model is normalized rather than passed through raw', async () => {
  const result = await evaluateResponse(
    { ...BASE_CTX, userResponse: 'gibberish' },
    null,
    withModel('{ "pass": false, "errorKind": "made_up_kind", "usedWordExpressions": [], "teachingNote": "Not on topic.", "sidekickLine": "Wen: try again." }')
  );
  assert.equal(result.pass, false);
  assert.ok(['wrong_register', 'wrong_word', 'broken_grammar', 'off_topic', 'incomprehensible_pronunciation'].includes(result.errorKind));
});

test('pronScore with low accuracy and a mis-scored target word overrides to incomprehensible_pronunciation', async () => {
  const result = await evaluateResponse(
    { ...BASE_CTX, userResponse: '<mumbling>' },
    {
      accuracy: 22,
      fluency: 30,
      completeness: 40,
      perWord: [{ word: '你好', score: 10 }, { word: '多少钱', score: 15 }],
    },
    withModel(
      '{ "pass": false, "errorKind": "off_topic", "usedWordExpressions": [], "teachingNote": "Could not tell what was said.", "sidekickLine": "Wen: say that again?" }'
    )
  );
  assert.equal(result.pass, false);
  assert.equal(result.errorKind, 'incomprehensible_pronunciation');
  assert.deepEqual(result.usedWordIds, []);
});

test('pronScore with decent accuracy does NOT override a model off_topic verdict', async () => {
  const result = await evaluateResponse(
    { ...BASE_CTX, userResponse: 'I like pizza' },
    { accuracy: 88, fluency: 80, completeness: 90, perWord: [{ word: '你好', score: 85 }] },
    withModel(
      '{ "pass": false, "errorKind": "off_topic", "usedWordExpressions": [], "teachingNote": "That does not answer the vendor.", "sidekickLine": "Wen: stay on topic." }'
    )
  );
  assert.equal(result.pass, false);
  assert.equal(result.errorKind, 'off_topic');
});

test('teachingNote does not contain the NPC line verbatim (no spoon-feeding the answer)', async () => {
  const result = await evaluateResponse(
    { ...BASE_CTX, userResponse: 'wrong reply' },
    null,
    withModel(
      '{ "pass": false, "errorKind": "wrong_word", "usedWordExpressions": [], "teachingNote": "Think about which word actually means \\"how much\\" here, then try once more.", "sidekickLine": "Wen: close, not quite." }'
    )
  );
  assert.equal(result.teachingNote.includes(BASE_CTX.npcLine.zh), false);
});

test('usedWordIds is always a strict subset of ctx.targetWords ids — fabricated expressions are dropped', async () => {
  const result = await evaluateResponse(
    { ...BASE_CTX, userResponse: '你好，多少钱？' },
    null,
    withModel(
      // Model hallucinates a word never offered this turn ("再见"). The
      // evaluator must only credit ids that exist in ctx.targetWords.
      '{ "pass": true, "errorKind": null, "usedWordExpressions": ["你好", "再见", "多少钱"], "teachingNote": "Nice work.", "sidekickLine": "Wen: solid." }'
    )
  );
  const targetIds = new Set(MARKET_TARGET_WORDS.map((w) => w.id));
  assert.ok(result.usedWordIds.every((id) => targetIds.has(id)));
  assert.deepEqual(result.usedWordIds.sort(), [101, 102]);
});

test('sidekick persona name appears in the prompt context (loose voice check via getSidekick)', async () => {
  // The prompt is built from getSidekick(sidekickKey); confirm the registry
  // entry used for 'cn' is the one threaded through, by checking the value
  // generateTurn/evaluateResponse would have read.
  const sidekick = getSidekick('cn');
  assert.equal(sidekick.name, 'Wen');
  assert.match(sidekick.voice, /Wen/);
});

test('evaluateResponse sidekickLine reflects the per-country persona when the model honors the prompt', async () => {
  const result = await evaluateResponse(
    { ...BASE_CTX, countryCode: 'cn', scenarioId: 'street-market', userResponse: '你好，多少钱？' },
    null,
    { ...withModel('{ "pass": true, "errorKind": null, "usedWordExpressions": ["你好"], "teachingNote": "Nice.", "sidekickLine": "Wen: that landed clean." }'), skipCatalogValidation: true }
  );
  assert.match(result.sidekickLine, /Wen/);
});

test('generateTurn sidekickLine reflects the per-country persona', async () => {
  const result = await generateTurn(
    {
      scenarioContext: 'street market',
      targetWords: MARKET_TARGET_WORDS,
      previousTurns: [],
      langCode: 'zh',
      countryCode: 'cn',
    },
    {
      model: mockModel(
        '{ "zh": "你好！", "pinyin": "ni hao", "en": "Hello!", "expectedIntent": "Greet back", "sidekickLine": "Wen: keep it simple." }'
      ),
      skipCatalogValidation: true,
    }
  );
  assert.match(result.sidekickLine, /Wen/);
});

// --- Catalog validation -----------------------------------------------

function fakeDb({ countries = [], scenarios = [], words = [] } = {}) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq(col1, val1) {
              const eqState = { [col1]: val1 };
              return {
                eq(col2, val2) {
                  eqState[col2] = val2;
                  return { maybeSingle: async () => maybeSingleFor(table, eqState) };
                },
                maybeSingle: async () => maybeSingleFor(table, eqState),
              };
            },
            in(col, vals) {
              if (table === 'learning_words') {
                return Promise.resolve({ data: words.filter((w) => vals.includes(w.id)), error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
      };
    },
  };

  function maybeSingleFor(table, eqState) {
    if (table === 'game_countries') {
      const row = countries.find((c) => c.code === eqState.code);
      return { data: row ?? null, error: null };
    }
    if (table === 'scenario_catalog') {
      const row = scenarios.find(
        (s) => s.country_code === eqState.country_code && s.scenario_id === eqState.scenario_id
      );
      return { data: row ?? null, error: null };
    }
    return { data: null, error: null };
  }
}

async function importCatalogWithFakeDb(fixture, suffix) {
  mock.module(new URL('../lib/db/db.js', import.meta.url).href, {
    namedExports: { db: fakeDb(fixture) },
  });
  return import(`../lib/ai/catalog.js?evalTest=${suffix}`);
}

test('resolveCountry rejects an unknown countryCode with a clear error code', async () => {
  const { resolveCountry, CatalogValidationError } = await importCatalogWithFakeDb({ countries: [] }, 1);
  await assert.rejects(
    () => resolveCountry('atlantis'),
    (err) => err instanceof CatalogValidationError && err.code === 'unknown_country_code'
  );
});

test('resolveCountry accepts either the 2-letter or DB full-name namespace', async () => {
  const { resolveCountry } = await importCatalogWithFakeDb({ countries: [{ code: 'china' }] }, 2);
  const byShort = await resolveCountry('cn');
  const byDbName = await resolveCountry('china');
  assert.equal(byShort.dbCode, 'china');
  assert.equal(byDbName.dbCode, 'china');
  assert.equal(byShort.langCode, 'zh');
});

test('assertScenarioInCatalog rejects an unknown scenarioId with a clear error code', async () => {
  const { assertScenarioInCatalog, CatalogValidationError } = await importCatalogWithFakeDb(
    { scenarios: [{ country_code: 'china', scenario_id: 'street-market', is_active: true }] },
    3
  );
  await assert.rejects(
    () => assertScenarioInCatalog('china', 'fake-scenario'),
    (err) => err instanceof CatalogValidationError && err.code === 'unknown_scenario_id'
  );
  await assert.doesNotReject(() => assertScenarioInCatalog('china', 'street-market'));
});

test('assertLangMatchesCountry rejects a langCode that does not match the country', async () => {
  const { assertLangMatchesCountry, CatalogValidationError } = await importCatalogWithFakeDb({}, 4);
  assert.throws(
    () => assertLangMatchesCountry('fr', 'zh'),
    (err) => err instanceof CatalogValidationError && err.code === 'lang_code_mismatch'
  );
  assert.doesNotThrow(() => assertLangMatchesCountry('zh', 'zh'));
});

test('assertTargetWordsKnown rejects an unknown word id with a clear error code', async () => {
  const { assertTargetWordsKnown, CatalogValidationError } = await importCatalogWithFakeDb(
    { words: [{ id: 101 }, { id: 102 }] },
    5
  );
  await assert.rejects(
    () => assertTargetWordsKnown([{ id: 101, expression: '你好' }, { id: 999, expression: 'fake' }]),
    (err) => err instanceof CatalogValidationError && err.code === 'unknown_target_word_id'
  );
  await assert.doesNotReject(() => assertTargetWordsKnown([{ id: 101, expression: '你好' }]));
});

test('assertTargetWordsKnown allows words with no id (legacy callers without DB ids yet)', async () => {
  const { assertTargetWordsKnown } = await importCatalogWithFakeDb({}, 6);
  await assert.doesNotReject(() => assertTargetWordsKnown([{ expression: '你好', meaning: 'hello' }]));
});

test('generateTurn rejects an unknown countryCode end-to-end (catalog validation wired in)', async () => {
  mock.module(new URL('../lib/db/db.js', import.meta.url).href, {
    namedExports: { db: fakeDb({ countries: [] }) },
  });
  const { generateTurn: freshGenerateTurn } = await import('../lib/ai/generateTurn.js?evalTest=7');
  await assert.rejects(
    () =>
      freshGenerateTurn(
        {
          scenarioContext: 'street market',
          targetWords: [],
          langCode: 'zh',
          countryCode: 'narnia',
        },
        { model: mockModel('{}') }
      ),
    /Unknown countryCode/
  );
});

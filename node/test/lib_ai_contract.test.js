import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

// Each HTTP-level test below re-mocks ../lib/auth.js and ../lib/ai/index.js
// with different fixtures; restore between tests so node:test doesn't reject
// a second mock.module() call on the same specifier.
afterEach(() => {
  mock.restoreAll();
});

// Dummy creds so importing routes/scenario.js (which transitively imports
// lib/db/db.js) doesn't throw at module-load time. createClient() does not
// make a network call at construction, so this is safe — no real Supabase
// traffic happens in this file. Set BEFORE any lib/ module is imported:
// static `import` specifiers are hoisted and evaluated before this file's
// own top-level body, so anything under test must be dynamically imported
// (below) rather than statically imported above this assignment.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const { generateTurn } = await import('../lib/ai/generateTurn.js');
const { evaluateResponse } = await import('../lib/ai/evaluateResponse.js');
const { getSidekick } = await import('../lib/ai/sidekick.js');
const barrel = await import('../lib/ai/index.js');

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

test('lib/ai barrel exports generateTurn, evaluateResponse, getSidekick', () => {
  assert.equal(typeof barrel.generateTurn, 'function');
  assert.equal(typeof barrel.evaluateResponse, 'function');
  assert.equal(typeof barrel.getSidekick, 'function');
});

test('generateText sanity check against MockLanguageModelV3 (confirms test harness wiring)', async () => {
  const { text } = await generateText({ model: mockModel('hello'), prompt: 'hi' });
  assert.equal(text, 'hello');
});

test('generateTurn parses a well-formed model response into the npcLine + contract-03 fields', async () => {
  const model = mockModel(
    '{ "zh": "你好", "pinyin": "ni hao", "en": "Hello", "expectedIntent": "Greet the vendor back", "sidekickLine": "Wen: nice and easy." }'
  );
  const result = await generateTurn(
    {
      scenarioContext: 'street market',
      targetWords: [{ expression: '你好', meaning: 'hello' }],
      previousTurns: [],
      langCode: 'zh',
    },
    { model }
  );
  assert.deepEqual(result.npcLine, { zh: '你好', pinyin: 'ni hao', en: 'Hello' });
  assert.equal(result.expectedIntent, 'Greet the vendor back');
  assert.equal(result.sidekickLine, 'Wen: nice and easy.');
  assert.deepEqual(result.targetWords, [{ id: undefined, expression: '你好', weight: 1 }]);
});

test('generateTurn falls back to the default NPC line when the model returns no JSON', async () => {
  const model = mockModel('not json at all');
  const result = await generateTurn(
    { scenarioContext: 'market', targetWords: [{ expression: 'a', meaning: 'b' }], langCode: 'zh' },
    { model }
  );
  assert.equal(result.npcLine.zh, '你好！你想买什么？');
  assert.equal(result.npcLine.en, 'Hello! What would you like to buy?');
  assert.equal(typeof result.expectedIntent, 'string');
  assert.ok(result.expectedIntent.length > 0);
  assert.equal(result.sidekickLine, null);
});

test('evaluateResponse parses a passed verdict from the model (legacy mirror fields included)', async () => {
  const model = mockModel(
    '{ "pass": true, "errorKind": null, "usedWordExpressions": ["你好"], "teachingNote": "Nice greeting!", "sidekickLine": "Wen: that landed well." }'
  );
  const result = await evaluateResponse(
    {
      scenarioContext: 'market',
      targetWords: [{ id: 1, expression: '你好' }],
      npcLine: { zh: '你好', en: 'Hello' },
      expectedIntent: 'Greet the shopkeeper',
      userResponse: 'ni hao',
      langCode: 'zh',
    },
    null,
    { model, skipCatalogValidation: true }
  );
  assert.equal(result.pass, true);
  assert.equal(result.errorKind, null);
  assert.deepEqual(result.usedWordIds, [1]);
  assert.equal(result.status, 'passed');
  assert.equal(result.feedback, 'Nice greeting!');
  assert.equal(result.usedWord, '你好');
});

test('evaluateResponse falls back to a failed verdict when the model returns no JSON', async () => {
  const model = mockModel('garbage');
  const result = await evaluateResponse(
    {
      scenarioContext: 'market',
      targetWords: [{ expression: '你好' }],
      npcLine: { zh: '你好', en: 'Hello' },
      userResponse: 'huh',
      langCode: 'zh',
    },
    null,
    { model }
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.pass, false);
  assert.equal(result.usedWord, null);
  assert.deepEqual(result.usedWordIds, []);
});

test('getSidekick returns the expected shape for a known country code', () => {
  const sidekick = getSidekick('fr');
  assert.equal(typeof sidekick.name, 'string');
  assert.equal(typeof sidekick.role, 'string');
  assert.equal(typeof sidekick.voice, 'string');
});

test('getSidekick is case-insensitive and falls back to a default for unknown codes', () => {
  const upper = getSidekick('FR');
  const lower = getSidekick('fr');
  assert.deepEqual(upper, lower);

  const unknown = getSidekick('zz');
  assert.equal(typeof unknown.name, 'string');
  assert.equal(typeof unknown.role, 'string');
  assert.equal(typeof unknown.voice, 'string');
});

test('route layer has no AI SDK imports — orchestration only', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../routes/scenario.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]ai['"]/);
  assert.doesNotMatch(source, /@ai-sdk\/google/);
  assert.match(source, /from ['"]\.\.\/lib\/ai\/index\.js['"]/);
});

// routes/scenario.js is mounted fresh per HTTP test below with a cache-busting
// query suffix on its specifier. Once ESM caches a module record, re-importing
// the same specifier returns the same record regardless of new mock.module()
// calls on its dependencies — the suffix forces a fresh resolution so each
// test's lib/ai mock actually takes effect in the route it's wired into.
let routeImportCounter = 0;
async function importFreshScenarioRoutes() {
  routeImportCounter += 1;
  return import(`../routes/scenario.js?contractTest=${routeImportCounter}`);
}

test("POST /api/scenario/generate preserves the legacy zh/pinyin/en wire shape (frontend regression)", async () => {
  mock.module(new URL('../lib/auth.js', import.meta.url).href, {
    namedExports: { requireUser: (req, res, next) => { req.userId = 'test-user'; next(); } },
  });
  mock.module(new URL('../lib/ai/index.js', import.meta.url).href, {
    namedExports: {
      generateTurn: async () => ({
        npcLine: { zh: '你好！', pinyin: 'ni hao', en: 'Hello!' },
        sidekickLine: 'Wen: easy does it.',
        expectedIntent: 'Greet the vendor back',
        targetWords: [{ id: 1, expression: '你好', weight: 1 }],
      }),
      evaluateResponse: async () => ({ status: 'failed', feedback: 'unused', usedWord: null, usedWordIds: [] }),
    },
  });

  const express = (await import('express')).default;
  const { mountScenarioRoutes } = await importFreshScenarioRoutes();
  const app = express();
  app.use(express.json());
  mountScenarioRoutes(app);
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/scenario/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'street market',
        targetWords: [{ expression: '你好', meaning: 'hello' }],
        previousTurns: [],
        langCode: 'zh',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    // Legacy keys/types — GameplayPhase.jsx reads data.zh/data.pinyin/data.en directly.
    assert.equal(json.zh, '你好！');
    assert.equal(json.pinyin, 'ni hao');
    assert.equal(json.en, 'Hello!');
    assert.equal(typeof json.zh, 'string');
    assert.equal(typeof json.pinyin, 'string');
    assert.equal(typeof json.en, 'string');
    // Richer fields ride along additively; they must not replace the legacy keys.
    assert.equal(json.sidekickLine, 'Wen: easy does it.');
    assert.equal(json.expectedIntent, 'Greet the vendor back');
  } finally {
    server.close();
  }
});

test("POST /api/scenario/evaluate preserves the legacy status/feedback/usedWord wire shape (failed branch)", async () => {
  mock.module(new URL('../lib/auth.js', import.meta.url).href, {
    namedExports: { requireUser: (req, res, next) => { req.userId = 'test-user'; next(); } },
  });
  mock.module(new URL('../lib/ai/index.js', import.meta.url).href, {
    namedExports: {
      generateTurn: async () => ({ npcLine: { zh: 'unused', pinyin: 'unused', en: 'unused' }, sidekickLine: null, expectedIntent: 'unused', targetWords: [] }),
      evaluateResponse: async () => ({
        pass: false,
        errorKind: 'off_topic',
        teachingNote: 'Try again!',
        sidekickLine: 'Wen: not quite.',
        usedWordIds: [],
        status: 'failed',
        feedback: 'Try again!',
        usedWord: null,
      }),
    },
  });

  const express = (await import('express')).default;
  const { mountScenarioRoutes } = await importFreshScenarioRoutes();
  const app = express();
  app.use(express.json());
  mountScenarioRoutes(app);
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'street market',
        targetWords: [{ expression: '你好' }],
        npcLine: { zh: '你好', en: 'Hello' },
        userResponse: 'huh',
        langCode: 'zh',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    // Legacy keys/types — GameplayPhase.jsx reads result.status/.feedback/.usedWord directly.
    assert.equal(json.status, 'failed');
    assert.equal(json.feedback, 'Try again!');
    assert.equal(json.usedWord, null);
    // Richer fields ride along additively.
    assert.equal(json.errorKind, 'off_topic');
    assert.deepEqual(json.usedWordIds, []);
  } finally {
    server.close();
  }
});

test('POST /api/scenario/evaluate on a pass with an unknown word skips FSRS update without erroring', async () => {
  mock.module(new URL('../lib/auth.js', import.meta.url).href, {
    namedExports: { requireUser: (req, res, next) => { req.userId = 'test-user'; next(); } },
  });
  mock.module(new URL('../lib/ai/index.js', import.meta.url).href, {
    namedExports: {
      generateTurn: async () => ({ npcLine: { zh: 'unused', pinyin: 'unused', en: 'unused' }, sidekickLine: null, expectedIntent: 'unused', targetWords: [] }),
      evaluateResponse: async () => ({
        pass: true,
        errorKind: null,
        teachingNote: 'Great job!',
        sidekickLine: 'Wen: nicely done.',
        usedWordIds: [],
        status: 'passed',
        feedback: 'Great job!',
        usedWord: '你好',
      }),
    },
  });
  // getWordByExpression returns null (word not found) so the route's
  // legacy fallback `if (wordRow)` guard short-circuits before touching
  // FSRS/Supabase. usedWordIds is empty here so the route takes that legacy
  // fallback path on purpose (see lib_ai_evaluate.test.js for the
  // usedWordIds-present path).
  mock.module(new URL('../lib/db/db.js', import.meta.url).href, {
    namedExports: { getWordByExpression: async () => null },
  });

  const express = (await import('express')).default;
  const { mountScenarioRoutes } = await importFreshScenarioRoutes();
  const app = express();
  app.use(express.json());
  mountScenarioRoutes(app);
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'street market',
        targetWords: [{ expression: '你好' }],
        npcLine: { zh: '你好', en: 'Hello' },
        userResponse: 'ni hao',
        langCode: 'zh',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.status, 'passed');
    assert.equal(json.feedback, 'Great job!');
    assert.equal(json.usedWord, '你好');
  } finally {
    server.close();
  }
});

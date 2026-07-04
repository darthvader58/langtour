// Route-layer tests for /api/scenario/*. Every seam is stubbed through the
// injectable deps (node/lib/ai/ and node/lib/memory/ are contracts here, not
// files) — no live model, Supabase, or Supermemory calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mountScenarioRoutes } from '../routes/scenario.js';

function makeWord(id) {
  return { id, expression: `w${id}`, reading: `r${id}`, meaning: `m${id}`, language: 'zh' };
}

function makeDeps(overrides = {}) {
  const calls = {
    fsrs: [],
    mastery: [],
    completions: [],
    situationClears: [],
    progressUpdates: [],
    inserted: [],
  };
  const deps = {
    requireUser: (req, _res, next) => {
      req.userId = 'user-1';
      next();
    },
    ai: {
      generateTurn: async (ctx) => ({
        npcLine: { text: '你想买什么？', reading: 'nǐ xiǎng mǎi shénme', translation: 'What would you like to buy?' },
        sidekickLine: { text: 'Blend in. Ask the price.' },
        expectedIntent: 'Ask how much something costs',
        targetWords: ctx.targetWords,
      }),
      evaluateResponse: async () => ({
        pass: false,
        errorKind: 'too-vague',
        teachingNote: 'Answer the vendor’s question, not the weather.',
        sidekickLine: { text: 'That won’t fool anyone.' },
        usedWords: [],
      }),
    },
    forest: {
      getForestProfile: async () => ({ mastered: [], currentCycle: [], trees: {} }),
      getStaleWords: async () => [],
      recordMasteryEvent: async (userId, event) => calls.mastery.push({ userId, event }),
      recordSituationClear: async (userId, event) => calls.situationClears.push({ userId, event }),
    },
    discovery: {
      getDiscoveryWords: async (_u, _t, _l, limit) => Array.from({ length: limit }, (_, i) => makeWord(10 + i)),
    },
    srs: {
      updateWordFSRS: async (userId, wordId, rating) => calls.fsrs.push({ userId, wordId, rating }),
    },
    words: {
      getWordsByIds: async (ids) => ids.map(makeWord),
      getWordsByExpressions: async () => [],
      resolveOrCreateWords: async (words) => words.map((w, i) => ({ ...w, id: 900 + i })),
    },
    store: {
      insertGeneratedScenario: async (userId, row) => calls.inserted.push({ userId, row }),
      getGeneratedScenario: async () => null,
      listGeneratedScenarios: async () => [],
      updateGeneratedScenarioProgress: async (userId, countryCode, scenarioId, patch) =>
        calls.progressUpdates.push({ userId, countryCode, scenarioId, patch }),
      recordScenarioCompletionAsUser: async (token, countryCode, scenarioId) =>
        calls.completions.push({ token, countryCode, scenarioId }),
    },
  };
  for (const [key, value] of Object.entries(overrides)) {
    deps[key] = { ...deps[key], ...value };
  }
  return { deps, calls };
}

async function startServer(deps) {
  const app = express();
  app.use(express.json());
  mountScenarioRoutes(app, deps);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-jwt' },
      body: JSON.stringify(body),
    });
  return { server, base, post };
}

// A stored row mid-scenario: 4 target words, cap 5, one already used.
function midScenarioRow() {
  return {
    user_id: 'user-1',
    country_code: 'cn',
    scenario_id: 'street-market',
    superset: 'food & stuff',
    position: 1,
    chain_complete: false,
    target_word_ids: [1, 2, 3, 4],
    used_word_ids: [1],
    target_size: 4,
    adaptive_cap: 5,
  };
}

test('generate rejects unknown countryCode with 400', async () => {
  const { deps } = makeDeps();
  const { server, post } = await startServer(deps);
  try {
    const res = await post('/api/scenario/generate', { countryCode: 'zz' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /countryCode/);
  } finally {
    server.close();
  }
});

test('generate without scenarioId chains a new scenario, persists it, and returns growth', async () => {
  const { deps, calls } = makeDeps();
  const { server, post } = await startServer(deps);
  try {
    const res = await post('/api/scenario/generate', { countryCode: 'cn' });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(calls.inserted.length, 1);
    assert.equal(calls.inserted[0].row.position, 0);
    assert.equal(body.scenarioId, calls.inserted[0].row.scenario_id);
    assert.equal(body.personaId, 'shanghai-spy');
    assert.ok(body.npcLine.text);
    assert.ok(body.targetWords.length >= 3 && body.targetWords.length <= 4);
    assert.equal(body.growth.targetSize, body.targetWords.length);
    assert.ok(body.growth.adaptiveCap >= body.growth.targetSize);
    assert.deepEqual(body.growth.usedWordIds, []);
  } finally {
    server.close();
  }
});

test('generate resolves AI-grown id:null words and clamps growth to the cap', async () => {
  const row = midScenarioRow();
  const { deps, calls } = makeDeps({
    store: { getGeneratedScenario: async () => row },
    ai: {
      generateTurn: async (ctx) => ({
        npcLine: { text: 'x', reading: 'x', translation: 'x' },
        sidekickLine: null,
        expectedIntent: 'reply',
        targetWords: [
          ...ctx.targetWords,
          { id: null, expression: '新鲜', reading: 'xīnxiān', meaning: 'fresh' },
          { id: null, expression: '打折', reading: 'dǎzhé', meaning: 'discount' },
        ],
      }),
    },
  });
  const { server, post } = await startServer(deps);
  try {
    const res = await post('/api/scenario/generate', { countryCode: 'cn', scenarioId: 'street-market' });
    const body = await res.json();
    // cap is 5, current 4 → exactly one grown word gets in, with a real id.
    assert.equal(body.targetWords.length, 5);
    const grown = body.targetWords[4];
    assert.equal(typeof grown.id, 'number');
    assert.equal(grown.expression, '新鲜');
    assert.equal(calls.progressUpdates.length, 1);
    assert.deepEqual(calls.progressUpdates[0].patch.target_word_ids, body.targetWords.map((w) => w.id));
    assert.equal(calls.progressUpdates[0].patch.target_size, 5);
  } finally {
    server.close();
  }
});

test('generate with unknown scenarioId is a 400, not a new scenario', async () => {
  const { deps, calls } = makeDeps(); // getGeneratedScenario → null
  const { server, post } = await startServer(deps);
  try {
    const res = await post('/api/scenario/generate', { countryCode: 'cn', scenarioId: 'forged' });
    assert.equal(res.status, 400);
    assert.equal(calls.inserted.length, 0);
  } finally {
    server.close();
  }
});

test('evaluate: a failed verdict never touches FSRS, the forest, or completion', async () => {
  const { deps, calls } = makeDeps({
    store: { getGeneratedScenario: async () => midScenarioRow() },
  });
  const { server, post } = await startServer(deps);
  try {
    const res = await post('/api/scenario/evaluate', {
      countryCode: 'cn',
      scenarioId: 'street-market',
      transcript: '嗯，好的，东西',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pass, false);
    assert.equal(body.errorKind, 'too-vague');
    assert.equal(body.scenarioComplete, false);
    assert.ok(body.teachingNote.length > 0);

    assert.equal(calls.fsrs.length, 0);
    assert.equal(calls.mastery.length, 0);
    assert.equal(calls.completions.length, 0);
    assert.equal(calls.progressUpdates.length, 0);
  } finally {
    server.close();
  }
});

test('evaluate: a mid-scenario pass updates FSRS + forest and grows, but never completes', async () => {
  const { deps, calls } = makeDeps({
    store: { getGeneratedScenario: async () => midScenarioRow() },
    ai: {
      evaluateResponse: async () => ({
        pass: true,
        errorKind: null,
        teachingNote: 'Nice — natural and on-topic.',
        sidekickLine: { text: 'Now you sound like a local.' },
        usedWords: [1, 2, 3], // 1 was already credited
      }),
    },
  });
  const { server, post } = await startServer(deps);
  try {
    const res = await post('/api/scenario/evaluate', {
      countryCode: 'cn',
      scenarioId: 'street-market',
      transcript: '这个多少钱？太贵了！',
    });
    const body = await res.json();
    assert.equal(body.pass, true);
    assert.deepEqual(body.usedWords, [2, 3]); // only newly credited words
    assert.equal(body.scenarioComplete, false); // set not yet grown to cap

    assert.deepEqual(calls.fsrs.map((c) => c.wordId), [2, 3]);
    assert.equal(calls.fsrs[0].rating, 3);
    assert.deepEqual(calls.mastery.map((c) => c.event.wordId), [2, 3]);
    assert.equal(calls.mastery[0].event.superset, 'food & stuff');
    assert.equal(calls.completions.length, 0);
    assert.equal(calls.situationClears.length, 0);

    // 3 of 4 used → grows toward the cap of 5.
    assert.equal(calls.progressUpdates.length, 1);
    assert.deepEqual(calls.progressUpdates[0].patch.used_word_ids, [1, 2, 3]);
    assert.equal(calls.progressUpdates[0].patch.target_size, 5);
    assert.equal(body.growth.grewBy, 1);
  } finally {
    server.close();
  }
});

test('evaluate: pass with the grown-to-cap set fully used triggers exactly one completion', async () => {
  const finalRow = {
    ...midScenarioRow(),
    target_word_ids: [1, 2, 3, 4, 5],
    used_word_ids: [1, 2, 3, 4],
    target_size: 5,
    adaptive_cap: 5,
  };
  const { deps, calls } = makeDeps({
    store: { getGeneratedScenario: async () => finalRow },
    ai: {
      evaluateResponse: async () => ({
        pass: true,
        errorKind: null,
        teachingNote: 'Perfect close.',
        sidekickLine: { text: 'Mission accomplished.' },
        usedWords: [5],
      }),
    },
  });
  const { server, post } = await startServer(deps);
  try {
    const res = await post('/api/scenario/evaluate', {
      countryCode: 'cn',
      scenarioId: 'street-market',
      transcript: '请给我打折，这个太贵了。',
    });
    const body = await res.json();
    assert.equal(body.pass, true);
    assert.equal(body.scenarioComplete, true);

    assert.equal(calls.completions.length, 1);
    assert.deepEqual(calls.completions[0], {
      token: 'test-jwt',
      countryCode: 'cn',
      scenarioId: 'street-market',
    });
    assert.equal(calls.situationClears.length, 1);
    assert.equal(calls.situationClears[0].event.scenarioId, 'street-market');
  } finally {
    server.close();
  }
});

test('evaluate: client-sent flags cannot force completion on a failed turn', async () => {
  const { deps, calls } = makeDeps({
    store: {
      getGeneratedScenario: async () => ({
        ...midScenarioRow(),
        target_word_ids: [1, 2, 3, 4, 5],
        used_word_ids: [1, 2, 3, 4],
        target_size: 5,
        adaptive_cap: 5,
      }),
    },
    // evaluator still fails — whatever the body claims must not matter
  });
  const { server, post } = await startServer(deps);
  try {
    const res = await post('/api/scenario/evaluate', {
      countryCode: 'cn',
      scenarioId: 'street-market',
      transcript: 'blah',
      completed: true,
      pass: true,
      scenarioComplete: true,
      usedWords: [1, 2, 3, 4, 5],
    });
    const body = await res.json();
    assert.equal(body.pass, false);
    assert.equal(body.scenarioComplete, false);
    assert.equal(calls.completions.length, 0);
    assert.equal(calls.fsrs.length, 0);
  } finally {
    server.close();
  }
});

test('evaluate validates inputs: unknown scenario and empty transcript are 400s', async () => {
  const { deps } = makeDeps(); // store returns null
  const { server, post } = await startServer(deps);
  try {
    const unknown = await post('/api/scenario/evaluate', {
      countryCode: 'cn',
      scenarioId: 'not-generated',
      transcript: '你好',
    });
    assert.equal(unknown.status, 400);

    const empty = await post('/api/scenario/evaluate', {
      countryCode: 'cn',
      scenarioId: 'street-market',
      transcript: '   ',
    });
    assert.equal(empty.status, 400);
  } finally {
    server.close();
  }
});

test('discovery validates langCode against the catalog', async () => {
  const { deps } = makeDeps();
  const { server, base } = await startServer(deps);
  try {
    const bad = await fetch(`${base}/api/scenario/discovery?topic=market&langCode=xx`, {
      headers: { authorization: 'Bearer test-jwt' },
    });
    assert.equal(bad.status, 400);

    const ok = await fetch(`${base}/api/scenario/discovery?topic=market&langCode=zh`, {
      headers: { authorization: 'Bearer test-jwt' },
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.words.length, 4);
    assert.equal(body.words[0].zh, body.words[0].expression);
  } finally {
    server.close();
  }
});

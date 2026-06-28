// Tests for the economy closure wired into POST /api/scenario/evaluate (T-E Part A).
//
// Verifies:
//   - record_scenario_turn is called when the eval passes and usedWordIds is non-empty.
//   - turn_index is derived server-side (from scenario_turn_grants), never from
//     the request body — the key anti-cheat invariant for this ticket.
//   - The RPC is NOT called when usedWordIds is empty (nothing to credit).
//   - The RPC is NOT called when the eval fails.
//   - Grant data from the RPC rides alongside the eval result additively.
//   - RPC failure is best-effort: the route still returns 200 with the eval result.
//
// Pattern: matches the node:test + mock.module approach used by lib_ai_contract.test.js.
// Each test gets a fresh route import (cache-busting suffix) so mock.module() takes
// effect inside the route's closure.

import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => {
  mock.restoreAll();
});

// Must be set before any lib/ module is imported (static imports are hoisted
// and createClient in lib/db/db.js throws if these are missing at evaluation time).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

let routeCounter = 0;
async function importFreshRoutes() {
  routeCounter++;
  return import(`../routes/scenario.js?routeWireTest=${routeCounter}`);
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

// Builds a mock Supabase query builder that resolves to `result` regardless
// of which chained methods are called before it (select/eq/in/order/limit etc.).
// Uses the `then` property to make the builder thenable (awaitable).
function mockQuery(result) {
  const b = {
    select: () => b,
    eq: () => b,
    in: () => b,
    order: () => b,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return b;
}

// Builds the full set of named exports expected from lib/db/db.js, capturing
// all calls to userClient(...).rpc() for assertion.
//
// lib/graph/graph.js is statically imported by routes/scenario.js and itself
// imports getAllWordEmbeddings / listUserWords / saveWordEmbedding from db.js.
// The route does NOT call these in the /evaluate handler, but they must be
// present in the mock so graph.js can instantiate without a SyntaxError.
function makeDbMock({ priorTurns = [], rpcResult = null } = {}) {
  const rpcCalls = [];

  const mockDb = {
    from(table) {
      if (table === 'scenario_turn_grants') {
        return mockQuery({ data: priorTurns, error: null });
      }
      // Catch-all for any other table (e.g. tables accessed by code paths we
      // are not directly testing here, such as the FSRS fallback).
      return mockQuery({ data: null, error: null });
    },
  };

  const mockUserClient = (_authHeader) => ({
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve(
        rpcResult ?? {
          data: { tokens: 110, xp: 60, level: 1, rank: 1, xpAwarded: 10, tokensAwarded: 2, awarded: true },
          error: null,
        },
      );
    },
  });

  return {
    db: mockDb,
    userClient: mockUserClient,
    // Used by the route (getWordByExpression for the legacy usedWord fallback).
    getWordByExpression: async () => null,
    // Used by lib/graph/graph.js (statically imported by routes/scenario.js).
    // Not called during /evaluate but must be present for module instantiation.
    getAllWordEmbeddings: async () => [],
    listUserWords: async () => [],
    saveWordEmbedding: async () => null,
    getWordEmbeddingRow: async () => null,
    // Defensive stubs for any other db helpers used transitively.
    getUserWordProgress: async () => ({
      state: 0, stability: 0, difficulty: 0, lapses: 0, reps: 0, last_review_at: null,
    }),
    upsertUserWordProgress: async () => null,
    insertReviewLog: async () => null,
    rpcCalls,
  };
}

// Wires up all the mocks for a single test scenario and boots an in-process
// HTTP server for the evaluate endpoint.  Returns `{ port, rpcCalls, server }`.
async function bootServer(opts = {}) {
  const {
    evalResult,
    priorTurns = [],
    rpcResult = null,
  } = opts;

  const dbMock = makeDbMock({ priorTurns, rpcResult });
  const { rpcCalls } = dbMock;

  mock.module(new URL('../lib/auth.js', import.meta.url).href, {
    namedExports: { requireUser: (req, _res, next) => { req.userId = 'user-1'; next(); } },
  });

  mock.module(new URL('../lib/ai/index.js', import.meta.url).href, {
    namedExports: {
      generateTurn: async () => ({ npcLine: { zh: '', pinyin: '', en: '' }, sidekickLine: null, expectedIntent: '', targetWords: [] }),
      evaluateResponse: async () => evalResult,
    },
  });

  // Prevent the FSRS path from touching any real DB — not what we are testing here.
  mock.module(new URL('../lib/srs/fsrs_update.js', import.meta.url).href, {
    namedExports: { updateWordFSRS: async () => {} },
  });

  mock.module(new URL('../lib/db/db.js', import.meta.url).href, {
    // Spread all stub exports so graph.js (statically imported by the route)
    // can instantiate even though its db functions are not exercised here.
    namedExports: { ...dbMock },
  });

  const express = (await import('express')).default;
  const { mountScenarioRoutes } = await importFreshRoutes();
  const app = express();
  app.use(express.json());
  mountScenarioRoutes(app);
  const server = app.listen(0);

  return { port: server.address().port, rpcCalls, server };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('passing eval with usedWordIds calls record_scenario_turn with server-derived turn_index 0 (no prior turns)', async () => {
  const { port, rpcCalls, server } = await bootServer({
    priorTurns: [], // no prior turns → turnIndex should be 0
    evalResult: {
      pass: true,
      errorKind: null,
      teachingNote: 'Well done!',
      sidekickLine: 'Wen: nice.',
      usedWordIds: [101, 102],
      status: 'passed',
      feedback: 'Well done!',
      usedWord: '你好',
    },
  });

  try {
    const res = await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'street market',
        targetWords: [{ id: 101, expression: '你好' }, { id: 102, expression: '多少钱' }],
        npcLine: { zh: '你好', en: 'Hello' },
        userResponse: '你好，多少钱？',
        langCode: 'zh',
        countryCode: 'china',
        scenarioId: 'street-market',
        // Client deliberately sends turnIndex — the route must ignore it.
        turnIndex: 99,
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(rpcCalls.length, 1, 'RPC must be called exactly once');
    const { name, args } = rpcCalls[0];
    assert.equal(name, 'record_scenario_turn');
    assert.equal(args.p_country_code, 'china');
    assert.equal(args.p_scenario_id, 'street-market');
    // The route must derive 0 from the ledger, NOT echo the client-sent 99.
    assert.equal(args.p_turn_index, 0, 'turn_index must be server-derived (0), not client-sent (99)');
    assert.deepEqual(args.p_used_word_ids, [101, 102]);
  } finally {
    server.close();
  }
});

test('passing eval with prior turn at index 5 produces turn_index 6', async () => {
  const { port, rpcCalls, server } = await bootServer({
    priorTurns: [{ turn_index: 5 }], // highest prior turn is 5 → next should be 6
    evalResult: {
      pass: true,
      errorKind: null,
      teachingNote: 'Nice!',
      sidekickLine: null,
      usedWordIds: [101],
      status: 'passed',
      feedback: 'Nice!',
      usedWord: '你好',
    },
  });

  try {
    const res = await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'restaurant',
        targetWords: [{ id: 101, expression: '你好' }],
        npcLine: { zh: '你好', en: 'Hello' },
        userResponse: '你好',
        langCode: 'zh',
        countryCode: 'china',
        scenarioId: 'restaurant',
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].args.p_turn_index, 6, 'turn_index must be MAX(prior) + 1');
  } finally {
    server.close();
  }
});

test('passing eval with empty usedWordIds does NOT call the RPC', async () => {
  const { port, rpcCalls, server } = await bootServer({
    evalResult: {
      pass: true,
      errorKind: null,
      teachingNote: 'OK',
      sidekickLine: null,
      usedWordIds: [], // empty → no economy credit
      status: 'passed',
      feedback: 'OK',
      usedWord: null,
    },
  });

  try {
    await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'market',
        targetWords: [],
        npcLine: { zh: '', en: '' },
        userResponse: 'hello',
        langCode: 'zh',
        countryCode: 'china',
        scenarioId: 'street-market',
      }),
    });

    assert.equal(rpcCalls.length, 0, 'RPC must NOT be called when usedWordIds is empty');
  } finally {
    server.close();
  }
});

test('failing eval does NOT call the RPC', async () => {
  const { port, rpcCalls, server } = await bootServer({
    evalResult: {
      pass: false,
      errorKind: 'off_topic',
      teachingNote: 'Try again.',
      sidekickLine: 'Wen: not quite.',
      usedWordIds: [101], // non-empty, but pass=false → no economy call
      status: 'failed',
      feedback: 'Try again.',
      usedWord: null,
    },
  });

  try {
    const res = await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'market',
        targetWords: [{ id: 101, expression: '你好' }],
        npcLine: { zh: '', en: '' },
        userResponse: 'wrong',
        langCode: 'zh',
        countryCode: 'china',
        scenarioId: 'street-market',
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(rpcCalls.length, 0, 'RPC must NOT be called on a failing eval');
    const json = await res.json();
    // Legacy keys must still be present.
    assert.equal(json.status, 'failed');
    assert.equal(json.feedback, 'Try again.');
  } finally {
    server.close();
  }
});

test('grant data from RPC is merged additively alongside legacy eval keys', async () => {
  const { port, server } = await bootServer({
    evalResult: {
      pass: true,
      errorKind: null,
      teachingNote: 'Great!',
      sidekickLine: null,
      usedWordIds: [101],
      status: 'passed',
      feedback: 'Great!',
      usedWord: '你好',
    },
    rpcResult: {
      data: { tokens: 115, xp: 65, level: 2, rank: 1, xpAwarded: 5, tokensAwarded: 1, awarded: true },
      error: null,
    },
  });

  try {
    const res = await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'market',
        targetWords: [{ id: 101, expression: '你好' }],
        npcLine: { zh: '你好', en: 'Hello' },
        userResponse: '你好',
        langCode: 'zh',
        countryCode: 'china',
        scenarioId: 'street-market',
      }),
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    // Legacy wire shape — must be present and unchanged.
    assert.equal(json.status, 'passed');
    assert.equal(json.feedback, 'Great!');
    assert.equal(json.usedWord, '你好');
    // Grant fields — must be present alongside legacy fields.
    assert.equal(json.tokens, 115);
    assert.equal(json.xpAwarded, 5);
    assert.equal(json.tokensAwarded, 1);
    assert.equal(json.awarded, true);
    assert.equal(json.level, 2);
  } finally {
    server.close();
  }
});

test('RPC failure is best-effort: route returns 200 with eval result and no grant block', async () => {
  const { port, server } = await bootServer({
    evalResult: {
      pass: true,
      errorKind: null,
      teachingNote: 'Good job.',
      sidekickLine: null,
      usedWordIds: [101],
      status: 'passed',
      feedback: 'Good job.',
      usedWord: '你好',
    },
    rpcResult: { data: null, error: { message: 'Country is not unlocked', code: 'P0001' } },
  });

  try {
    const res = await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'market',
        targetWords: [{ id: 101, expression: '你好' }],
        npcLine: { zh: '你好', en: 'Hello' },
        userResponse: '你好',
        langCode: 'zh',
        countryCode: 'china',
        scenarioId: 'street-market',
      }),
    });

    const json = await res.json();
    assert.equal(res.status, 200, 'route must return 200 even when RPC fails');
    assert.equal(json.status, 'passed');
    assert.equal(json.feedback, 'Good job.');
    // Grant fields must be absent when the RPC failed.
    assert.equal(json.tokens, undefined, 'no grant block on RPC failure');
    assert.equal(json.awarded, undefined);
  } finally {
    server.close();
  }
});

test('missing countryCode or scenarioId skips the RPC silently (no 500)', async () => {
  const { port, rpcCalls, server } = await bootServer({
    evalResult: {
      pass: true,
      errorKind: null,
      teachingNote: 'Nice.',
      sidekickLine: null,
      usedWordIds: [101],
      status: 'passed',
      feedback: 'Nice.',
      usedWord: '你好',
    },
  });

  try {
    const res = await fetch(`http://localhost:${port}/api/scenario/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        scenarioContext: 'market',
        targetWords: [{ id: 101, expression: '你好' }],
        npcLine: { zh: '你好', en: 'Hello' },
        userResponse: '你好',
        langCode: 'zh',
        // Deliberately omit countryCode and scenarioId
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(rpcCalls.length, 0, 'RPC must not be called when countryCode/scenarioId are missing');
    const json = await res.json();
    assert.equal(json.status, 'passed');
  } finally {
    server.close();
  }
});

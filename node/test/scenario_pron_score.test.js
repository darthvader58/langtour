// Tests for server-side pronunciation scoring wired into POST /api/scenario/evaluate (T-L).
//
// Verifies the three paths required by T-L:
//   (a) A client-supplied pronScore in the request body is NOT forwarded to
//       evaluateResponse — the server-computed value from audio_b64 is used instead.
//   (b) When the server-computed pronScore has low accuracy, the eval result
//       reflects it (e.g. errorKind: 'incomprehensible_pronunciation').
//   (c) If scorePronunciation throws, the evaluator still runs (pronScore = null)
//       and the route still returns 200 with the normal eval result.
//   (d) When audio_b64 is absent, scorePronunciation is not called at all and
//       evaluateResponse receives null (transcript-only judgment).
//
// Pattern: follows the economy_route_wire.test.js bootServer/mock.module approach
// to get fresh route imports per test so mocks take effect in each route closure.

import { mock, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => {
  mock.restoreAll();
});

// DB must have these set before any db.js import (createClient throws without them).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

// ---------------------------------------------------------------------------
// Cache-busting fresh route import per test (same pattern as economy_route_wire)
// ---------------------------------------------------------------------------

let routeCounter = 0;
async function importFreshRoutes() {
  routeCounter++;
  return import(`../routes/scenario.js?pronScoreTest=${routeCounter}`);
}

// ---------------------------------------------------------------------------
// Minimal DB stub (no economy assertions needed here; just keep the route alive)
// ---------------------------------------------------------------------------

function makeDbStub() {
  const mockQuery = (result) => {
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
  };

  const db = {
    from: () => mockQuery({ data: [], error: null }),
  };

  const userClient = () => ({
    rpc: () => Promise.resolve({ data: null, error: null }),
  });

  return {
    db,
    userClient,
    getWordByExpression: async () => null,
    getAllWordEmbeddings: async () => [],
    listUserWords: async () => [],
    saveWordEmbedding: async () => null,
    getWordEmbeddingRow: async () => null,
    getUserWordProgress: async () => ({ state: 0, stability: 0, difficulty: 0, lapses: 0, reps: 0, last_review_at: null }),
    upsertUserWordProgress: async () => null,
    insertReviewLog: async () => null,
  };
}

// ---------------------------------------------------------------------------
// Boot an in-process Express server with controllable mocks.
//
// Returns:
//   port            — the OS-assigned port the server is listening on.
//   server          — the HTTP server (caller must call server.close() in finally).
//   getPronScore()  — the pronScore arg that was passed to evaluateResponse.
//   getScoreCalls() — how many times scorePronunciation was called.
// ---------------------------------------------------------------------------

const DUMMY_AUDIO_B64 = Buffer.from('RIFF....WAVEfmt ').toString('base64');

async function bootServer({
  evalResult,
  // Passed as the mock impl for scorePronunciation. Defaults to a function
  // that returns a high-accuracy score (no pronunciation gate triggered).
  scoreImpl = async () => ({ accuracy: 85, fluency: 78, completeness: 92, perWord: [{ word: '你好', score: 85 }] }),
} = {}) {
  // Per-test captured state.
  let capturedPronScore = 'unset';   // 'unset' distinguishes "never called" from null
  let scoreCalls = 0;

  mock.module(new URL('../lib/auth.js', import.meta.url).href, {
    namedExports: {
      requireUser: (req, _res, next) => { req.userId = 'user-1'; next(); },
    },
  });

  // evaluateResponse is mocked so we can capture the pronScore arg it receives.
  // Its return value is the preset evalResult (or a sensible default if omitted).
  const defaultEvalResult = evalResult ?? {
    pass: false,
    errorKind: 'off_topic',
    teachingNote: 'Try again.',
    sidekickLine: 'Keep going.',
    usedWordIds: [],
    status: 'failed',
    feedback: 'Try again.',
    usedWord: null,
  };

  mock.module(new URL('../lib/ai/index.js', import.meta.url).href, {
    namedExports: {
      evaluateResponse: async (_ctx, pronScore) => {
        capturedPronScore = pronScore;
        return defaultEvalResult;
      },
      generateTurn: async () => ({
        npcLine: { zh: '', pinyin: '', en: '' },
        sidekickLine: null,
        expectedIntent: '',
        targetWords: [],
      }),
    },
  });

  // scorePronunciation is mocked so tests control its return value and throw behavior.
  mock.module(new URL('../lib/speech/index.js', import.meta.url).href, {
    namedExports: {
      scorePronunciation: async (audio, lang, targetText, opts) => {
        scoreCalls++;
        return scoreImpl(audio, lang, targetText, opts);
      },
      getScorer: () => ({}),
    },
  });

  mock.module(new URL('../lib/srs/fsrs_update.js', import.meta.url).href, {
    namedExports: { updateWordFSRS: async () => {} },
  });

  mock.module(new URL('../lib/db/db.js', import.meta.url).href, {
    namedExports: makeDbStub(),
  });

  const express = (await import('express')).default;
  const { mountScenarioRoutes } = await importFreshRoutes();
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  mountScenarioRoutes(app);
  const server = app.listen(0);

  return {
    port: server.address().port,
    server,
    getPronScore: () => capturedPronScore,
    getScoreCalls: () => scoreCalls,
  };
}

// Convenience: POST /api/scenario/evaluate with a sensible default body.
function evalBody(overrides = {}) {
  return {
    scenarioContext: 'street market',
    targetWords: [{ id: 101, expression: '你好', meaning: 'hello' }],
    npcLine: { zh: '你好', en: 'Hello' },
    expectedIntent: 'Greet back',
    userResponse: '你好',
    langCode: 'zh',
    ...overrides,
  };
}

async function postEval(port, body) {
  return fetch(`http://localhost:${port}/api/scenario/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// (a) Client-supplied pronScore is NOT forwarded to evaluateResponse
// ---------------------------------------------------------------------------

test('(a) client-sent pronScore is ignored — evaluateResponse receives null when no audio_b64 is present', async () => {
  // A malicious client sends a perfect pronScore without any audio.
  // The route must not pass this value to evaluateResponse.
  const { port, server, getPronScore, getScoreCalls } = await bootServer();

  try {
    const res = await postEval(port, evalBody({
      pronScore: { accuracy: 100, fluency: 100, completeness: 100, perWord: [{ word: '你好', score: 100 }] },
      // No audio_b64 → scorePronunciation must not be called.
    }));

    assert.equal(res.status, 200, 'route returns 200');
    // The route must NOT have called scorePronunciation (no audio to score).
    assert.equal(getScoreCalls(), 0, 'scorePronunciation must not be called when audio_b64 is absent');
    // The value evaluateResponse received must be null, not the client-forged 100/100/100.
    assert.equal(getPronScore(), null, 'evaluateResponse must receive null, not client pronScore');
  } finally {
    server.close();
  }
});

test('(a) client-sent pronScore is ignored even when audio_b64 is also present — server score wins', async () => {
  const SERVER_SCORE = { accuracy: 42, fluency: 35, completeness: 60, perWord: [{ word: '你好', score: 42 }] };

  const { port, server, getPronScore } = await bootServer({
    scoreImpl: async () => SERVER_SCORE,
  });

  try {
    const res = await postEval(port, evalBody({
      audio_b64: DUMMY_AUDIO_B64,
      // Client also sends a forged high score — the server score must override it entirely.
      pronScore: { accuracy: 99, fluency: 99, completeness: 99, perWord: [] },
    }));

    assert.equal(res.status, 200, 'route returns 200');
    // evaluateResponse must see the server-computed score, not the client's 99/99/99.
    const received = getPronScore();
    assert.deepEqual(received, SERVER_SCORE, 'evaluateResponse receives server-computed score');
    assert.notEqual(received?.accuracy, 99, 'client accuracy value must not reach evaluateResponse');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// (b) Eval response reflects pronScore-derived fields the evaluator emits
// ---------------------------------------------------------------------------

test('(b) when server pronScore is low, the eval result reflects incomprehensible_pronunciation errorKind', async () => {
  // The evaluateResponse mock returns 'incomprehensible_pronunciation' to simulate
  // what the real evaluator does when it receives a low pronScore (tested separately
  // in lib_ai_evaluate.test.js).  Here we verify the route passes the server score
  // through and surfaces the evaluator's verdict unchanged.
  const LOW_SCORE = { accuracy: 20, fluency: 15, completeness: 30, perWord: [{ word: '你好', score: 18 }] };

  const { port, server, getPronScore } = await bootServer({
    scoreImpl: async () => LOW_SCORE,
    evalResult: {
      pass: false,
      errorKind: 'incomprehensible_pronunciation',
      teachingNote: 'Try saying it more clearly.',
      sidekickLine: 'Say that again?',
      usedWordIds: [],
      status: 'failed',
      feedback: 'Try saying it more clearly.',
      usedWord: null,
    },
  });

  try {
    const res = await postEval(port, evalBody({ audio_b64: DUMMY_AUDIO_B64 }));

    assert.equal(res.status, 200);
    const json = await res.json();

    // The server-computed score was passed to evaluateResponse.
    assert.deepEqual(getPronScore(), LOW_SCORE, 'route passed server-computed low score to evaluateResponse');

    // The evaluator's verdict (incomprehensible_pronunciation) surfaces in the response.
    assert.equal(json.errorKind, 'incomprehensible_pronunciation');
    assert.equal(json.status, 'failed');
    // usedWordIds must be empty — incomprehensible audio cannot attest word usage.
    assert.deepEqual(json.usedWordIds, []);
  } finally {
    server.close();
  }
});

test('(b) when server pronScore is high, the eval result is unaffected by pronunciation (pass or fail by grammar/meaning only)', async () => {
  const HIGH_SCORE = { accuracy: 90, fluency: 88, completeness: 95, perWord: [{ word: '你好', score: 90 }] };

  const { port, server, getPronScore } = await bootServer({
    scoreImpl: async () => HIGH_SCORE,
    evalResult: {
      pass: true,
      errorKind: null,
      teachingNote: 'Well said!',
      sidekickLine: 'Wen: solid.',
      usedWordIds: [101],
      status: 'passed',
      feedback: 'Well said!',
      usedWord: '你好',
    },
  });

  try {
    const res = await postEval(port, evalBody({ audio_b64: DUMMY_AUDIO_B64 }));

    assert.equal(res.status, 200);
    const json = await res.json();

    assert.deepEqual(getPronScore(), HIGH_SCORE, 'route passed server-computed high score to evaluateResponse');
    assert.equal(json.status, 'passed');
    assert.equal(json.errorKind, null);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// (c) Eval still runs if scorePronunciation throws
// ---------------------------------------------------------------------------

test('(c) scorePronunciation throws → evaluateResponse still runs with pronScore = null', async () => {
  const { port, server, getPronScore, getScoreCalls } = await bootServer({
    scoreImpl: async () => { throw new Error('Azure 500: engine failure'); },
    evalResult: {
      pass: false,
      errorKind: 'off_topic',
      teachingNote: 'Stay on topic.',
      sidekickLine: 'Wen: try again.',
      usedWordIds: [],
      status: 'failed',
      feedback: 'Stay on topic.',
      usedWord: null,
    },
  });

  try {
    const res = await postEval(port, evalBody({ audio_b64: DUMMY_AUDIO_B64 }));

    // Route must not 500 — it degrades gracefully.
    assert.equal(res.status, 200, 'route must return 200 even when scoring throws');
    const json = await res.json();

    // scorePronunciation was called (it threw, but the call was attempted).
    assert.equal(getScoreCalls(), 1, 'scorePronunciation was attempted');
    // evaluateResponse received null (graceful fallback after throw).
    assert.equal(getPronScore(), null, 'evaluateResponse receives null after scoring failure');

    // The eval result is still present in the response (no 500).
    assert.equal(json.status, 'failed');
    assert.equal(json.errorKind, 'off_topic');
    assert.equal(typeof json.teachingNote, 'string');
  } finally {
    server.close();
  }
});

test('(c) scorePronunciation throws auth error → route returns 200, eval runs with null', async () => {
  const { port, server, getPronScore } = await bootServer({
    scoreImpl: async () => { throw new Error('Azure 401: unauthorized'); },
  });

  try {
    const res = await postEval(port, evalBody({ audio_b64: DUMMY_AUDIO_B64 }));

    assert.equal(res.status, 200, '401 auth error from scorer must not propagate as 500');
    assert.equal(getPronScore(), null, 'evaluateResponse receives null on auth error');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// (d) No audio_b64 → scorePronunciation not called, null passed to evaluateResponse
// ---------------------------------------------------------------------------

test('(d) absent audio_b64 → scorePronunciation is not called, eval runs with null pronScore', async () => {
  const { port, server, getPronScore, getScoreCalls } = await bootServer();

  try {
    const res = await postEval(port, evalBody(/* no audio_b64 */));

    assert.equal(res.status, 200);
    assert.equal(getScoreCalls(), 0, 'scorePronunciation must not be called when audio_b64 is absent');
    assert.equal(getPronScore(), null, 'evaluateResponse receives null (transcript-only judgment)');
  } finally {
    server.close();
  }
});

test('(d) empty audio_b64 string → scorePronunciation is not called', async () => {
  const { port, server, getScoreCalls } = await bootServer();

  try {
    const res = await postEval(port, evalBody({ audio_b64: '' }));

    assert.equal(res.status, 200);
    assert.equal(getScoreCalls(), 0, 'empty audio_b64 must not trigger scoring');
  } finally {
    server.close();
  }
});

test('(d) audio_b64 present but userResponse absent → scorePronunciation is not called', async () => {
  // Without userResponse there is no targetText to score against.
  const { port, server, getScoreCalls } = await bootServer();

  try {
    const res = await postEval(port, evalBody({ audio_b64: DUMMY_AUDIO_B64, userResponse: undefined }));

    assert.equal(res.status, 200);
    assert.equal(getScoreCalls(), 0, 'scoring must be skipped when userResponse is absent');
  } finally {
    server.close();
  }
});

test('(d) oversized audio_b64 → scorePronunciation is not called (DoS cap)', async () => {
  // Server caps base64 at ~8 MB encoded (~6 MB decoded). Anything larger is
  // rejected before the Buffer allocation so a forged ~200 MB body cannot
  // burn ~150 MB of RAM per request. Route still returns 200; eval runs with
  // pronScore = null (same as the missing-audio path).
  const { port, server, getScoreCalls } = await bootServer();
  const oversized = 'A'.repeat(8_000_001);

  try {
    const res = await postEval(port, evalBody({ audio_b64: oversized }));

    assert.equal(res.status, 200, 'oversize audio is rejected silently, route still 200s');
    assert.equal(getScoreCalls(), 0, 'oversized audio_b64 must not trigger scoring');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Backward compatibility: /api/voice/score still works (separate endpoint)
// ---------------------------------------------------------------------------

test('backward-compat: route still responds 200 to legacy callers that send no audio_b64', async () => {
  // A client that was built before T-L (sends only the transcript fields) must
  // still get a valid response — no breaking change.
  const { port, server } = await bootServer({
    evalResult: {
      pass: false,
      errorKind: 'broken_grammar',
      teachingNote: 'Fix the grammar.',
      sidekickLine: 'Wen: almost.',
      usedWordIds: [],
      status: 'failed',
      feedback: 'Fix the grammar.',
      usedWord: null,
    },
  });

  try {
    const res = await postEval(port, {
      scenarioContext: 'restaurant',
      targetWords: [{ id: 202, expression: '请', meaning: 'please' }],
      npcLine: { zh: '您好', en: 'Hello' },
      expectedIntent: 'Order food politely',
      userResponse: '请 食物',
      langCode: 'zh',
      // No audio_b64, no pronScore — legacy shape
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'failed');
    assert.equal(typeof json.feedback, 'string');
  } finally {
    server.close();
  }
});

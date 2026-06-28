// Tests for POST /api/voice/score route (contract 05, Part D).
// Uses a real Express instance with mocked auth and scoring layer — no live vendor calls.

import { test, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Set required env vars before any import (config.js and db.js read them at load time).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.AZURE_SPEECH_KEY = 'test-azure-key';
process.env.AZURE_SPEECH_REGION = 'eastus';

// Auth mock: pass if Authorization: Bearer test-token is present, reject otherwise.
// This lets us test both the happy path AND the 401 case in a single mock setup.
await mock.module('../lib/auth.js', {
  namedExports: {
    requireUser: (req, res, next) => {
      const auth = req.headers.authorization || '';
      if (auth === 'Bearer test-token') {
        req.userId = 'test-user-id';
        return next();
      }
      res.status(401).json({ error: 'Invalid token' });
    },
  },
});

const HAPPY_SCORE = Object.freeze({
  accuracy: 85,
  fluency: 78,
  completeness: 92,
  perWord: [{ word: '你好', score: 85 }],
});

// Speech scoring mock — returns HAPPY_SCORE unless it's told to fail.
let scoreShouldThrow = false;
await mock.module('../lib/speech/index.js', {
  namedExports: {
    scorePronunciation: async (_audio, _lang, _text, _opts) => {
      if (scoreShouldThrow) throw new Error('scoring engine failed');
      return HAPPY_SCORE;
    },
    getScorer: () => ({ scorePronunciation: async () => HAPPY_SCORE }),
  },
});

// Import after mocks are in place so voice.js sees them.
const express = (await import('express')).default;
const { mountVoiceRoutes } = await import('../routes/voice.js');

// Stand up a real HTTP server on an OS-assigned port for the duration of this file.
let server;
let BASE;

before(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  mountVoiceRoutes(app, null); // null = skip WebSocket upgrade handler
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address();
  BASE = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

// Convenience helpers
function validBody(overrides = {}) {
  return {
    audio_b64: Buffer.from('RIFF....WAVEfmt ').toString('base64'),
    lang: 'zh',
    targetText: '你好',
    ...overrides,
  };
}

function postScore(body, headers = {}) {
  return fetch(`${BASE}/api/voice/score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('POST /api/voice/score → 200 with correct PronScore shape', async () => {
  scoreShouldThrow = false;
  const res = await postScore(validBody());
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(typeof data.accuracy, 'number');
  assert.equal(typeof data.fluency, 'number');
  assert.equal(typeof data.completeness, 'number');
  assert.ok(Array.isArray(data.perWord));
  assert.deepEqual(data, HAPPY_SCORE);
});

test('POST /api/voice/score → perWord entries have word and score fields', async () => {
  scoreShouldThrow = false;
  const res = await postScore(validBody());
  const { perWord } = await res.json();
  for (const entry of perWord) {
    assert.equal(typeof entry.word, 'string');
    assert.equal(typeof entry.score, 'number');
  }
});

// ---------------------------------------------------------------------------
// 400 on unknown / missing lang
// ---------------------------------------------------------------------------

test('unknown lang → 400', async () => {
  const res = await postScore(validBody({ lang: 'ja' }));
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error.includes('lang'), 'error message should mention lang');
});

test('missing lang → 400', async () => {
  const res = await postScore(validBody({ lang: undefined }));
  assert.equal(res.status, 400);
});

test('empty string lang → 400', async () => {
  const res = await postScore(validBody({ lang: '' }));
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// 400 on missing / malformed body fields
// ---------------------------------------------------------------------------

test('missing audio_b64 → 400', async () => {
  const res = await postScore({ lang: 'zh', targetText: '你好' });
  assert.equal(res.status, 400);
});

test('missing targetText → 400', async () => {
  const res = await postScore({ audio_b64: 'dGVzdA==', lang: 'zh' });
  assert.equal(res.status, 400);
});

test('empty targetText → 400', async () => {
  const res = await postScore(validBody({ targetText: '  ' }));
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// 401 on missing / invalid auth
// ---------------------------------------------------------------------------

test('missing Authorization header → 401', async () => {
  const res = await postScore(validBody(), { Authorization: undefined });
  assert.equal(res.status, 401);
});

test('invalid token → 401', async () => {
  const res = await postScore(validBody(), { Authorization: 'Bearer bad-token' });
  assert.equal(res.status, 401);
});

test('no Bearer prefix → 401', async () => {
  const res = await postScore(validBody(), { Authorization: 'test-token' });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// 500 on scoring engine failure
// ---------------------------------------------------------------------------

test('scoring engine throws → 500 (engine errors are server-side problems)', async () => {
  scoreShouldThrow = true;
  const res = await postScore(validBody());
  assert.equal(res.status, 500);
  const data = await res.json();
  assert.ok(typeof data.error === 'string');
  // Error message must NOT leak key values or internal stack — just a safe message.
  assert.ok(!data.error.includes('test-azure-key'));
  scoreShouldThrow = false;
});

// ---------------------------------------------------------------------------
// All six supported lang codes are accepted
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['zh', 'fr', 'es', 'hi', 'ar', 'pt'];

for (const lang of SUPPORTED_LANGS) {
  test(`lang "${lang}" is accepted → 200`, async () => {
    scoreShouldThrow = false;
    const res = await postScore(validBody({ lang }));
    assert.equal(res.status, 200, `Expected 200 for lang=${lang}`);
  });
}

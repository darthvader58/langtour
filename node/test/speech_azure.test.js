// Tests for the Azure pronunciation assessment adapter (contract 05).
// All network calls are mocked — no live Azure calls in CI.
// REST API: speech/recognition/conversation/cognitiveservices/v1 (version: v1)
// Response shape read from Azure docs 2026-06-28.

import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.AZURE_SPEECH_KEY = 'test-azure-key';
process.env.AZURE_SPEECH_REGION = 'eastus';

// Import the adapter and helpers. azureAdapter uses fetch (global) and execFileSync (for
// WebM→WAV conversion). We mock fetch globally; for WAV input we skip conversion entirely.
const { azureAdapter, LANG_LOCALES, parseAzureResponse } = await import('../lib/speech/azureAdapter.js');

// A minimal fake WAV header so the adapter skips the ffmpeg WebM→WAV conversion path.
// (The first 4 bytes are 'RIFF', not the WebM magic 0x1A 0x45 0xDF 0xA3.)
function fakeWav() {
  const buf = Buffer.alloc(44, 0);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WAVE', 8, 'ascii');
  return buf;
}

// Build a minimal Azure pronunciation assessment response matching the real API shape.
function azureResponse({ accuracy = 92, fluency = 81, completeness = 93, words = [] } = {}) {
  return {
    RecognitionStatus: 'Success',
    DisplayText: 'Good morning.',
    NBest: [
      {
        Confidence: 0.98,
        PronunciationAssessment: { AccuracyScore: accuracy, FluencyScore: fluency, CompletenessScore: completeness },
        Words: words,
      },
    ],
  };
}

function mockFetch(status, body) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

afterEach(() => mock.restoreAll());

// ---------------------------------------------------------------------------
// Happy path — correct PronScore shape and values
// ---------------------------------------------------------------------------

test('200 response → correctly-shaped PronScore with per-word scores', async (t) => {
  const words = [
    { Word: 'good', PronunciationAssessment: { AccuracyScore: 100 } },
    { Word: 'morning', PronunciationAssessment: { AccuracyScore: 84 } },
  ];
  t.mock.method(globalThis, 'fetch', mockFetch(200, azureResponse({ words })));

  const score = await azureAdapter.scorePronunciation({
    audio: fakeWav(),
    lang: 'zh',
    targetText: 'good morning',
  });

  assert.equal(score.accuracy, 92);
  assert.equal(score.fluency, 81);
  assert.equal(score.completeness, 93);
  assert.ok(Array.isArray(score.perWord));
  assert.equal(score.perWord.length, 2);
  assert.deepEqual(score.perWord[0], { word: 'good', score: 100 });
  assert.deepEqual(score.perWord[1], { word: 'morning', score: 84 });
});

test('200 response with no Words → perWord is empty array', async (t) => {
  t.mock.method(globalThis, 'fetch', mockFetch(200, azureResponse()));

  const score = await azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'fr', targetText: 'bonjour' });
  assert.deepEqual(score.perWord, []);
});

test('scores are numbers in the 0-100 range', async (t) => {
  t.mock.method(globalThis, 'fetch', mockFetch(200, azureResponse({ accuracy: 55, fluency: 0, completeness: 100 })));

  const score = await azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'es', targetText: 'hola' });
  assert.equal(score.accuracy, 55);
  assert.equal(score.fluency, 0);
  assert.equal(score.completeness, 100);
});

// ---------------------------------------------------------------------------
// 429 retry behavior
// ---------------------------------------------------------------------------

test('429 on first attempt → retried once → 200 on second attempt returns score', async (t) => {
  let callCount = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    callCount++;
    if (callCount === 1) {
      return { ok: false, status: 429, json: async () => ({}), text: async () => 'rate limited' };
    }
    return {
      ok: true,
      status: 200,
      json: async () => azureResponse({ accuracy: 70 }),
      text: async () => '',
    };
  });

  const score = await azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'hi', targetText: 'नमस्ते' });
  assert.equal(callCount, 2, 'fetch should be called exactly twice');
  assert.equal(score.accuracy, 70);
});

test('429 twice → Engine5xxError thrown', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 429,
    json: async () => ({}),
    text: async () => 'rate limited',
  }));

  const { Engine5xxError } = await import('../lib/speech/errors.js');
  await assert.rejects(
    () => azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'zh', targetText: '你好' }),
    (err) => err instanceof Engine5xxError
  );
});

// ---------------------------------------------------------------------------
// 401 fail-loud (no retry, propagates plain Error, not Engine5xxError)
// ---------------------------------------------------------------------------

test('401 → throws plain Error mentioning auth failure (no retry)', async (t) => {
  let callCount = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    callCount++;
    return { ok: false, status: 401, json: async () => ({}), text: async () => 'Unauthorized' };
  });

  await assert.rejects(
    () => azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'zh', targetText: '你好' }),
    /auth failure/
  );
  assert.equal(callCount, 1, 'should NOT retry on 401');
});

test('403 → throws plain Error mentioning auth failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false, status: 403, json: async () => ({}), text: async () => 'Forbidden',
  }));

  await assert.rejects(
    () => azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'ar', targetText: 'مرحبا' }),
    /auth failure/
  );
});

// ---------------------------------------------------------------------------
// 5xx → Engine5xxError
// ---------------------------------------------------------------------------

test('500 from Azure → Engine5xxError thrown (enables dispatcher fallback)', async (t) => {
  t.mock.method(globalThis, 'fetch', mockFetch(500, { error: 'internal error' }));

  const { Engine5xxError } = await import('../lib/speech/errors.js');
  await assert.rejects(
    () => azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'pt', targetText: 'bom dia' }),
    (err) => err instanceof Engine5xxError
  );
});

// ---------------------------------------------------------------------------
// Locale mapping — all six target languages
// ---------------------------------------------------------------------------

const EXPECTED_LOCALES = {
  zh: 'zh-CN',
  fr: 'fr-FR',
  es: 'es-MX',
  hi: 'hi-IN',
  ar: 'ar-EG',
  pt: 'pt-BR',
};

for (const [langCode, expectedLocale] of Object.entries(EXPECTED_LOCALES)) {
  test(`lang "${langCode}" maps to locale "${expectedLocale}" in the request URL`, async (t) => {
    let capturedUrl = '';
    t.mock.method(globalThis, 'fetch', async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => azureResponse(), text: async () => '' };
    });

    await azureAdapter.scorePronunciation({ audio: fakeWav(), lang: langCode, targetText: 'test' });
    assert.ok(
      capturedUrl.includes(`language=${expectedLocale}`),
      `URL should contain language=${expectedLocale}, got: ${capturedUrl}`
    );
  });
}

test('unsupported lang throws a clear error without making a network call', async (t) => {
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => { called = true; });

  await assert.rejects(
    () => azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'ja', targetText: 'テスト' }),
    /unsupported lang/
  );
  assert.equal(called, false, 'fetch must not be called for unknown lang');
});

// ---------------------------------------------------------------------------
// parseAzureResponse helper — unit tests for the response mapper
// ---------------------------------------------------------------------------

test('parseAzureResponse extracts scores from NBest[0].PronunciationAssessment', () => {
  const data = azureResponse({ accuracy: 90, fluency: 85, completeness: 95, words: [
    { Word: 'hello', PronunciationAssessment: { AccuracyScore: 88 } },
  ]});
  const score = parseAzureResponse(data);
  assert.equal(score.accuracy, 90);
  assert.equal(score.fluency, 85);
  assert.equal(score.completeness, 95);
  assert.deepEqual(score.perWord, [{ word: 'hello', score: 88 }]);
});

test('parseAzureResponse defaults to 0 for missing scores', () => {
  const score = parseAzureResponse({ NBest: [{ PronunciationAssessment: {} }] });
  assert.equal(score.accuracy, 0);
  assert.equal(score.fluency, 0);
  assert.equal(score.completeness, 0);
  assert.deepEqual(score.perWord, []);
});

// ---------------------------------------------------------------------------
// LANG_LOCALES export — shape check
// ---------------------------------------------------------------------------

test('LANG_LOCALES contains all six target languages', () => {
  for (const code of ['zh', 'fr', 'es', 'hi', 'ar', 'pt']) {
    assert.ok(LANG_LOCALES[code], `LANG_LOCALES must contain "${code}"`);
  }
});

// ---------------------------------------------------------------------------
// Missing credentials — fail-loud, no network call
// ---------------------------------------------------------------------------

test('missing AZURE_SPEECH_KEY → throws at call time, no network call', async (t) => {
  const orig = process.env.AZURE_SPEECH_KEY;
  process.env.AZURE_SPEECH_KEY = '';
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => { called = true; });

  await assert.rejects(
    () => azureAdapter.scorePronunciation({ audio: fakeWav(), lang: 'zh', targetText: 'test' }),
    /AZURE_SPEECH_KEY/
  );
  assert.equal(called, false);
  process.env.AZURE_SPEECH_KEY = orig;
});

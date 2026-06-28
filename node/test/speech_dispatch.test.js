// Tests for speech engine dispatch logic (contract 05).
// Verifies: engine selection precedence, 5xx fallback chain, audit logging, unknown-lang rejection.
// No live network calls — adapters are replaced via mock.module before import, then per-test
// methods are overridden with t.mock.method (which mock.restoreAll() undoes after each test).

import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Set env before any import so config.js reads the right values.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.AZURE_SPEECH_KEY = 'test-azure-key';
process.env.AZURE_SPEECH_REGION = 'eastus';
delete process.env.SPEECH_ENGINE; // start from a clean default

const MOCK_SCORE = Object.freeze({ accuracy: 80, fluency: 75, completeness: 90, perWord: [] });

// Mock all three adapters before importing dispatch to avoid real calls.
// mock.module replaces module exports so dispatch.js gets these objects at import time.
await mock.module('../lib/speech/azureAdapter.js', {
  namedExports: {
    azureAdapter: { scorePronunciation: async () => MOCK_SCORE },
    LANG_LOCALES: { zh: 'zh-CN', fr: 'fr-FR', es: 'es-MX', hi: 'hi-IN', ar: 'ar-EG', pt: 'pt-BR' },
    parseAzureResponse: (d) => d,
  },
});
await mock.module('../lib/speech/speechaceAdapter.js', {
  namedExports: {
    speechaceAdapter: { scorePronunciation: async () => MOCK_SCORE },
  },
});
await mock.module('../lib/speech/goptAdapter.js', {
  namedExports: {
    goptAdapter: { scorePronunciation: async () => MOCK_SCORE },
  },
});

// Import dispatch after mocks are in place — it sees the mocked adapter objects.
const { dispatch, getScorer, ADAPTER_MAP, SENTINEL_SCORE, Engine5xxError, NotImplementedError } =
  await import('../lib/speech/dispatch.js');

const FAKE_AUDIO = Buffer.from('fake-audio');
const LANG = 'zh';
const TEXT = '你好';

afterEach(() => {
  // Undo any t.mock.method calls and env mutations from the previous test.
  delete process.env.SPEECH_ENGINE;
  mock.restoreAll();
});

// ---------------------------------------------------------------------------
// Engine selection precedence: opts > env > default
// ---------------------------------------------------------------------------

test('opts.engine overrides SPEECH_ENGINE env', async (t) => {
  process.env.SPEECH_ENGINE = 'gopt';
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));

  await dispatch(FAKE_AUDIO, LANG, TEXT, { engine: 'azure' });
  assert.ok(logs.some((l) => l.includes('engine=azure')), 'should log the opts engine, not gopt');
});

test('SPEECH_ENGINE env used when opts.engine is absent', async (t) => {
  process.env.SPEECH_ENGINE = 'speechace';
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));

  await dispatch(FAKE_AUDIO, LANG, TEXT);
  assert.ok(logs.some((l) => l.includes('engine=speechace')));
});

test('defaults to azure when SPEECH_ENGINE env is unset', async (t) => {
  delete process.env.SPEECH_ENGINE;
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));

  await dispatch(FAKE_AUDIO, LANG, TEXT);
  assert.ok(logs.some((l) => l.includes('engine=azure')));
});

test('getScorer respects opts.engine', () => {
  const scorer = getScorer({ engine: 'speechace' });
  assert.ok(typeof scorer.scorePronunciation === 'function');
});

test('getScorer defaults to azure when env unset', () => {
  delete process.env.SPEECH_ENGINE;
  const scorer = getScorer();
  assert.strictEqual(scorer, ADAPTER_MAP.azure);
});

// ---------------------------------------------------------------------------
// Fallback chain: Engine5xxError from primary → try gopt → if gopt fails → sentinel
// ---------------------------------------------------------------------------

test('Engine5xxError from primary triggers gopt fallback and logs the transition', async (t) => {
  t.mock.method(ADAPTER_MAP.azure, 'scorePronunciation', async () => {
    throw new Engine5xxError('upstream 503');
  });
  // gopt mock returns MOCK_SCORE — fallback succeeds.
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));

  const result = await dispatch(FAKE_AUDIO, LANG, TEXT, { engine: 'azure' });

  assert.deepEqual(result, MOCK_SCORE, 'should return gopt score on fallback');
  assert.ok(warnings.some((w) => w.includes('5xx')), 'should log a 5xx warning');
  assert.ok(warnings.some((w) => w.includes('gopt')), 'should mention gopt in the warning');
});

test('Engine5xxError from primary + gopt also throws → sentinel returned', async (t) => {
  t.mock.method(ADAPTER_MAP.azure, 'scorePronunciation', async () => {
    throw new Engine5xxError('gateway timeout');
  });
  t.mock.method(ADAPTER_MAP.gopt, 'scorePronunciation', async () => {
    throw new NotImplementedError('GOPT not wired');
  });

  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));

  const result = await dispatch(FAKE_AUDIO, LANG, TEXT, { engine: 'azure' });

  assert.deepEqual(result, { accuracy: 0, fluency: 0, completeness: 0, perWord: [] });
  assert.ok(errors.some((e) => e.includes('sentinel')), 'should log sentinel fallback');
});

test('non-5xx error from primary propagates (no fallback)', async (t) => {
  // 401 / config error — should NOT fall through to gopt, must propagate.
  t.mock.method(ADAPTER_MAP.azure, 'scorePronunciation', async () => {
    throw new Error('AZURE_SPEECH_KEY is not configured');
  });

  await assert.rejects(() => dispatch(FAKE_AUDIO, LANG, TEXT, { engine: 'azure' }), /AZURE_SPEECH_KEY/);
});

// ---------------------------------------------------------------------------
// Audit log presence
// ---------------------------------------------------------------------------

test('dispatch logs requestId and engine on every call', async (t) => {
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));

  const rid = 'req-audit-001';
  await dispatch(FAKE_AUDIO, LANG, TEXT, { requestId: rid });

  assert.ok(logs.some((l) => l.includes(rid)), 'requestId must appear in log');
  assert.ok(logs.some((l) => l.includes('engine=')), 'engine name must appear in log');
  assert.ok(logs.some((l) => l.includes('lang=')), 'lang must appear in log');
});

// ---------------------------------------------------------------------------
// Unknown lang — propagated, NOT silently swallowed as sentinel
// ---------------------------------------------------------------------------

test('unknown lang propagates an error (not swallowed as sentinel)', async (t) => {
  // Override azure adapter to simulate the real unknown-lang error.
  t.mock.method(ADAPTER_MAP.azure, 'scorePronunciation', async ({ lang }) => {
    throw new Error(`Azure adapter: unsupported lang "${lang}"`);
  });

  await assert.rejects(
    () => dispatch(FAKE_AUDIO, 'xx', TEXT, { engine: 'azure' }),
    /unsupported lang/
  );
});

// ---------------------------------------------------------------------------
// SENTINEL_SCORE contract shape
// ---------------------------------------------------------------------------

test('SENTINEL_SCORE has the correct contract-05 shape', () => {
  assert.equal(typeof SENTINEL_SCORE.accuracy, 'number');
  assert.equal(typeof SENTINEL_SCORE.fluency, 'number');
  assert.equal(typeof SENTINEL_SCORE.completeness, 'number');
  assert.ok(Array.isArray(SENTINEL_SCORE.perWord));
  assert.equal(SENTINEL_SCORE.accuracy, 0);
  assert.equal(SENTINEL_SCORE.fluency, 0);
  assert.equal(SENTINEL_SCORE.completeness, 0);
});

// ---------------------------------------------------------------------------
// Engine5xxError and NotImplementedError class identities
// ---------------------------------------------------------------------------

test('Engine5xxError is instanceof Error and has correct name', () => {
  const err = new Engine5xxError('test');
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'Engine5xxError');
  assert.equal(err.message, 'test');
});

test('NotImplementedError is instanceof Error and has correct name', () => {
  const err = new NotImplementedError('not wired');
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'NotImplementedError');
});

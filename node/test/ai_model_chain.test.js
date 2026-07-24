import test from 'node:test';
import assert from 'node:assert/strict';
import { APICallError, NoObjectGeneratedError } from 'ai';
import {
  createGenerateStructured,
  isProviderUnavailable,
  buildCallOptions,
} from '../lib/ai/model.js';
import { ModelQuotaError } from '../lib/ai/errors.js';

const SCHEMA = { fake: 'schema' };

function apiError(statusCode, message = 'boom', extra = {}) {
  return new APICallError({
    message,
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode,
    ...extra,
  });
}

// Shape @ai-sdk/cerebras actually parses onto APICallError.data when the
// provider rejects our json_schema request format (see
// node_modules/@ai-sdk/cerebras's cerebrasErrorSchema).
function cerebrasFormatError() {
  return apiError(400, "'additionalProperties' is required to be supplied and set to false.", {
    data: {
      message: "'additionalProperties' is required to be supplied and set to false.",
      type: 'invalid_request_error',
      param: 'response_format',
      code: 'wrong_api_format',
    },
    isRetryable: false,
  });
}

function provider(name, key = 'k') {
  return { name, apiKey: () => key, model: () => `model:${name}` };
}

test('buildCallOptions always sets maxRetries: 0 — the chain is the retry strategy', () => {
  const opts = buildCallOptions({ model: 'm', schema: SCHEMA, prompt: 'p' });
  assert.deepEqual(opts, { model: 'm', schema: SCHEMA, prompt: 'p', maxRetries: 0 });
});

test('isProviderUnavailable: true for 429 and 5xx APICallError, false for other statuses', () => {
  assert.equal(isProviderUnavailable(apiError(429)), true);
  assert.equal(isProviderUnavailable(apiError(500)), true);
  assert.equal(isProviderUnavailable(apiError(503)), true);
  assert.equal(isProviderUnavailable(apiError(400)), false);
  assert.equal(isProviderUnavailable(apiError(401)), false);
});

test('isProviderUnavailable: true for RESOURCE_EXHAUSTED body text even without statusCode 429', () => {
  const e = apiError(200, 'RESOURCE_EXHAUSTED: quota exceeded');
  assert.equal(isProviderUnavailable(e), true);
});

test('isProviderUnavailable: true for network-level errors (no APICallError at all)', () => {
  assert.equal(isProviderUnavailable(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })), true);
  assert.equal(isProviderUnavailable(Object.assign(new TypeError('fetch failed'), {})), true);
  assert.equal(isProviderUnavailable(new Error('totally unrelated')), false);
});

test('isProviderUnavailable: false for schema/validation errors — same bug on every provider', () => {
  const err = new NoObjectGeneratedError({ message: 'could not parse object', cause: new Error('bad json') });
  assert.equal(isProviderUnavailable(err), false);
});

test('isProviderUnavailable: true for a Cerebras-style format-400 (code: wrong_api_format)', () => {
  assert.equal(isProviderUnavailable(cerebrasFormatError()), true);
});

test('isProviderUnavailable: true for a format-400 identified by param: response_format alone', () => {
  const err = apiError(400, 'response_format not supported', { data: { param: 'response_format' } });
  assert.equal(isProviderUnavailable(err), true);
});

test('isProviderUnavailable: still false for an ordinary 400 with no format-rejection data', () => {
  assert.equal(isProviderUnavailable(apiError(400, 'bad request')), false);
  assert.equal(isProviderUnavailable(apiError(400, 'bad request', { data: { code: 'invalid_api_key' } })), false);
  assert.equal(isProviderUnavailable(apiError(400, 'bad request', { data: 'not an object' })), false);
});

test('chain advances to the next provider on a stubbed 429 and returns the successful object', async () => {
  const calls = [];
  const call = async ({ model }) => {
    calls.push(model);
    if (model === 'model:cerebras') throw apiError(429);
    return { ok: true, from: model };
  };
  const generateStructured = createGenerateStructured({
    providers: [provider('cerebras'), provider('groq'), provider('gemini')],
    call,
  });
  const result = await generateStructured({ schema: SCHEMA, prompt: 'p' });
  assert.deepEqual(calls, ['model:cerebras', 'model:groq']);
  assert.deepEqual(result, { ok: true, from: 'model:groq' });
});

test('chain advances through 5xx and network errors too', async () => {
  const calls = [];
  const call = async ({ model }) => {
    calls.push(model);
    if (model === 'model:cerebras') throw apiError(503);
    if (model === 'model:groq') throw Object.assign(new Error('fetch failed'), { cause: { code: 'ETIMEDOUT' } });
    return { ok: true };
  };
  const generateStructured = createGenerateStructured({
    providers: [provider('cerebras'), provider('groq'), provider('gemini')],
    call,
  });
  const result = await generateStructured({ schema: SCHEMA, prompt: 'p' });
  assert.deepEqual(calls, ['model:cerebras', 'model:groq', 'model:gemini']);
  assert.deepEqual(result, { ok: true });
});

test('chain advances past Cerebras on a format-400 and succeeds on the next provider', async () => {
  const calls = [];
  const call = async ({ model }) => {
    calls.push(model);
    if (model === 'model:cerebras') throw cerebrasFormatError();
    return { ok: true, from: model };
  };
  const generateStructured = createGenerateStructured({
    providers: [provider('cerebras'), provider('groq'), provider('gemini')],
    call,
  });
  const result = await generateStructured({ schema: SCHEMA, prompt: 'p' });
  assert.deepEqual(calls, ['model:cerebras', 'model:groq']);
  assert.deepEqual(result, { ok: true, from: 'model:groq' });
});

test('chain does NOT advance on a genuine non-format 400 — rethrows immediately', async () => {
  const calls = [];
  const genuineError = apiError(400, 'bad request', { data: { code: 'invalid_api_key' } });
  const call = async ({ model }) => {
    calls.push(model);
    throw genuineError;
  };
  const generateStructured = createGenerateStructured({
    providers: [provider('cerebras'), provider('groq'), provider('gemini')],
    call,
  });
  await assert.rejects(() => generateStructured({ schema: SCHEMA, prompt: 'p' }), genuineError);
  assert.deepEqual(calls, ['model:cerebras']);
});

test('chain does NOT advance on a schema/validation error — rethrows immediately without trying later providers', async () => {
  const calls = [];
  const validationError = new NoObjectGeneratedError({ message: 'bad schema', cause: new Error('x') });
  const call = async ({ model }) => {
    calls.push(model);
    throw validationError;
  };
  const generateStructured = createGenerateStructured({
    providers: [provider('cerebras'), provider('groq'), provider('gemini')],
    call,
  });
  await assert.rejects(() => generateStructured({ schema: SCHEMA, prompt: 'p' }), validationError);
  assert.deepEqual(calls, ['model:cerebras']);
});

test('a provider with no configured key is skipped silently, never called', async () => {
  const calls = [];
  const call = async ({ model }) => {
    calls.push(model);
    return { ok: true, from: model };
  };
  const generateStructured = createGenerateStructured({
    providers: [provider('cerebras', ''), provider('groq'), provider('gemini')],
    call,
  });
  const result = await generateStructured({ schema: SCHEMA, prompt: 'p' });
  assert.deepEqual(calls, ['model:groq']);
  assert.deepEqual(result, { ok: true, from: 'model:groq' });
});

test('throws ModelQuotaError once every configured provider hits a quota/availability error', async () => {
  const call = async () => {
    throw apiError(429);
  };
  const generateStructured = createGenerateStructured({
    providers: [provider('cerebras'), provider('groq'), provider('gemini')],
    call,
  });
  await assert.rejects(
    () => generateStructured({ schema: SCHEMA, prompt: 'p' }),
    (err) => {
      assert.ok(err instanceof ModelQuotaError);
      assert.equal(err.code, 'model_quota_exhausted');
      assert.deepEqual(err.attempted, ['cerebras', 'groq', 'gemini']);
      return true;
    },
  );
});

test('throws ModelQuotaError immediately (no calls) when no provider is configured at all', async () => {
  const calls = [];
  const call = async ({ model }) => {
    calls.push(model);
    return { ok: true };
  };
  const generateStructured = createGenerateStructured({
    providers: [provider('cerebras', ''), provider('groq', ''), provider('gemini', '')],
    call,
  });
  await assert.rejects(
    () => generateStructured({ schema: SCHEMA, prompt: 'p' }),
    (err) => {
      assert.ok(err instanceof ModelQuotaError);
      assert.match(err.message, /No model provider is configured/);
      return true;
    },
  );
  assert.deepEqual(calls, []);
});

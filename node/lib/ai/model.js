// The single seam to a model — a provider fallback chain, not one call.
//
// Why: Gemini's free tier is 20 req/day for gemini-2.5-flash, and the AI SDK
// retries a 429 up to `maxRetries` times by default, burning quota on the
// same dead request. So: try cheap/high-quota providers first, advance the
// chain only on quota/availability errors (never on a schema bug — that bug
// is the same on every provider), and disable the SDK's own retries because
// the chain below IS the retry strategy. See docs/contracts/ai-module.md for
// the frozen chain order, env keys, and the ModelQuotaError contract.
import { generateObject, APICallError } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createCerebras } from '@ai-sdk/cerebras';
import { createGroq } from '@ai-sdk/groq';
import { GEMINI_API_KEY, CEREBRAS_API_KEY, GROQ_API_KEY } from '../config.js';
import { ModelQuotaError } from './errors.js';

// Lazy per-provider singletons so importing this module (e.g. from tests
// that inject a stub chain) never requires a real key or network access, and
// a provider whose key is missing is never even constructed.
let cerebras = null;
let groq = null;
let google = null;

// Chain order: Cerebras (gpt-oss-120b) and Groq (llama-3.3-70b-versatile)
// both have generous free tiers and confirmed structured-output ("Object
// Generation") support per the AI SDK provider capability tables; Gemini
// (bounded 20 req/day free tier) is the last-resort, most-reliable-quality
// fallback rather than the first call. A provider with no configured key is
// skipped silently — the chain just has fewer links, never a boot crash.
const PROVIDERS = [
  {
    name: 'cerebras',
    apiKey: () => CEREBRAS_API_KEY,
    model: () => (cerebras ??= createCerebras({ apiKey: CEREBRAS_API_KEY }))('gpt-oss-120b'),
  },
  {
    name: 'groq',
    apiKey: () => GROQ_API_KEY,
    model: () => (groq ??= createGroq({ apiKey: GROQ_API_KEY }))('llama-3.3-70b-versatile'),
  },
  {
    name: 'gemini',
    apiKey: () => GEMINI_API_KEY,
    model: () => (google ??= createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY }))('gemini-2.5-flash'),
  },
];

// True only for a 400 that is a provider-specific *request-format*
// rejection — the provider refused the shape of our request (e.g. its
// structured-output/response_format contract), not the content of the
// prompt. Concretely this is Cerebras rejecting a json_schema without
// `additionalProperties: false` on every object node: statusCode 400,
// parsed error body `{ code: 'wrong_api_format', param: 'response_format' }`
// (see @ai-sdk/cerebras's error schema — that body lands on
// APICallError.data). That's a per-provider input-format quirk, identical
// on every retry to that provider, so the chain should skip straight to the
// next provider instead of rethrowing — unlike a genuine prompt/generation
// bug (NoObjectGeneratedError, or any other 4xx), which is the same bug on
// every provider and must fail fast.
function isFormatRejection(error) {
  if (!APICallError.isInstance(error) || error.statusCode !== 400) return false;
  const data = error.data;
  return !!(
    data &&
    typeof data === 'object' &&
    (data.code === 'wrong_api_format' || data.param === 'response_format')
  );
}

// True only for errors that mean "this provider can't serve the request
// right now" — rate-limit/quota, the provider itself being down, or (see
// isFormatRejection above) a provider-specific request-format rejection.
// Schema/validation errors (e.g. AI SDK's NoObjectGeneratedError) and any
// other 4xx mean the prompt itself is broken, which is the same bug on
// every provider in the chain, so they fall through this check and are
// rethrown immediately instead of silently trying (and failing) two more
// providers.
export function isProviderUnavailable(error) {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 429) return true;
    if (typeof status === 'number' && status >= 500) return true;
    if (isFormatRejection(error)) return true;
    return /RESOURCE_EXHAUSTED/i.test(error.message ?? '');
  }
  if (/RESOURCE_EXHAUSTED/i.test(error?.message ?? '')) return true;
  // Network-level failures never reach a provider's HTTP layer, so they
  // never become an APICallError — they surface as a plain Error/TypeError
  // from fetch, optionally with a Node error `code` on `.cause`.
  const code = error?.cause?.code ?? error?.code;
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) return true;
  return error?.name === 'TypeError' && /fetch/i.test(error?.message ?? '');
}

// Pure so tests can assert on it directly without touching the network:
// confirms maxRetries: 0 is always what reaches generateObject.
export function buildCallOptions({ model, schema, prompt }) {
  return { model, schema, prompt, maxRetries: 0 };
}

async function defaultCall({ model, schema, prompt }) {
  const { object } = await generateObject(buildCallOptions({ model, schema, prompt }));
  return object;
}

// Factory so tests inject a stub provider list and a stub `call`; production
// uses the real chain and generateObject via the exported default below.
export function createGenerateStructured({ providers = PROVIDERS, call = defaultCall } = {}) {
  return async function generateStructured({ schema, prompt }) {
    const attempted = [];
    for (const provider of providers) {
      if (!provider.apiKey()) continue;
      try {
        return await call({ model: provider.model(), schema, prompt });
      } catch (error) {
        if (!isProviderUnavailable(error)) throw error;
        attempted.push(provider.name);
      }
    }
    throw new ModelQuotaError(
      attempted.length
        ? `All configured model providers hit quota/availability errors: ${attempted.join(' -> ')}`
        : 'No model provider is configured (missing API keys)',
      { attempted },
    );
  };
}

export const generateStructured = createGenerateStructured();

// Supermemory wiring for Langtour.
//
// Two distinct surfaces, kept separate per CLAUDE.md / contract 01:
//   1. Per-user vocab memory  -> `supermemoryClient()` (raw `supermemory` SDK,
//      used for `profile()` reads) and `memoryTools()` (`@supermemory/ai-sdk`
//      `supermemoryTools`, used for tool-style writes during a turn).
//   2. Infinite Chat proxy in front of the Gemini dialog/eval calls ->
//      `createSupermemoryInfiniteChat()`.
//
// Versions read via Context7 (`/supermemoryai/supermemory`) and confirmed
// against the published npm registry on 2026-06-24:
//   - `@supermemory/ai-sdk@1.0.8` — exports `supermemoryTools`,
//     `searchMemoriesTool`, `addMemoryTool`. NOTE: this package is marked
//     deprecated upstream ("Please use the `@supermemory/tools` package
//     instead") but it is what the ticket/contract name and what is
//     currently pinned here; flips to `@supermemory/tools` are a follow-up,
//     not in scope for this ticket.
//   - `supermemory@4.24.12` — the raw TS client (`new Supermemory({ apiKey })`)
//     that exposes `.profile()` and `.add()`. `@supermemory/ai-sdk` does not
//     re-export `profile()`; the contract's `profile(userTag)` read goes
//     through this client directly (see forest.js).
//   - There is no `createSupermemoryInfiniteChat` export in `@supermemory/ai-sdk`
//     1.0.8 (verified by reading the published package source: only
//     `tools.ts` is exported). The "Infinite Chat" feature documented at
//     docs.supermemory.ai/ai-sdk/infinite-chat.mdx is implemented by pointing
//     a normal AI-SDK provider factory (e.g. `@ai-sdk/google`'s
//     `createGoogleGenerativeAI`) at a Supermemory-proxied `baseURL`
//     (`https://api.supermemory.ai/v3/<upstream-base>`) with
//     `x-supermemory-api-key` / `x-sm-conversation-id` headers. We implement
//     that documented contract ourselves below, under the
//     `createSupermemoryInfiniteChat` name the ticket asks for, so callers
//     get the exact call shape described in the brief regardless of which
//     package ships the helper.

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { supermemoryTools as buildSupermemoryTools } from '@supermemory/ai-sdk';
import Supermemory from 'supermemory';

// Read SUPERMEMORY_API_KEY from process.env at call time (not via the cached
// config.js export) so tests can `delete process.env.SUPERMEMORY_API_KEY`
// to exercise the fail-loud path, and so a missing key surfaces on first use
// rather than at module load. Same pattern as node/lib/speech/azureAdapter.js.

const SUPERMEMORY_PROXY_BASE = 'https://api.supermemory.ai/v3';

const PROVIDER_UPSTREAM_BASE = {
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  groq: 'https://api.groq.com/v1',
};

function requireApiKey(apiKey) {
  const key = apiKey || process.env.SUPERMEMORY_API_KEY || '';
  if (!key) {
    throw new Error(
      'SUPERMEMORY_API_KEY is missing. Set it in node/.env (see CLAUDE.md Supermemory section) before using Supermemory features.'
    );
  }
  return key;
}

/**
 * Raw Supermemory client, used for `.profile()` and `.add()` calls that the
 * `@supermemory/ai-sdk` tools package does not expose.
 * @param {string} [apiKey] - defaults to SUPERMEMORY_API_KEY from env.
 * @returns {Supermemory}
 */
export function supermemoryClient(apiKey) {
  return new Supermemory({ apiKey: requireApiKey(apiKey) });
}

/**
 * Builds the `@supermemory/ai-sdk` tool set (searchMemories, addMemory)
 * scoped to a single containerTag, ready to spread into an `ai` SDK
 * `generateText`/`streamText` `tools` option.
 * @param {string[]} containerTags - e.g. [userTag(userId)]. Never mix tags
 *   from different users in one call — container isolation is anti-cheat.
 * @param {string} [apiKey] - defaults to SUPERMEMORY_API_KEY from env.
 */
export function memoryTools(containerTags, apiKey) {
  if (!Array.isArray(containerTags) || containerTags.length === 0) {
    throw new Error('memoryTools: containerTags must be a non-empty array');
  }
  return buildSupermemoryTools(requireApiKey(apiKey), { containerTags });
}

/**
 * Creates a context-compressing AI-SDK provider that proxies model calls
 * through Supermemory's Infinite Chat endpoint (~90% context-token savings).
 * Drop the returned model factory in front of the existing Gemini dialog/eval
 * calls in place of `createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY })`.
 *
 * @param {string} apiKey - Supermemory API key (SUPERMEMORY_API_KEY).
 * @param {object} opts
 * @param {'google'|'openai'|'anthropic'|'groq'} opts.providerName - upstream
 *   model provider. Only 'google' is wired/tested here (the repo's Gemini
 *   path); other names are accepted for forward compatibility with the
 *   documented contract but are unverified against this repo's stack.
 * @param {string} opts.providerApiKey - the upstream provider's own API key
 *   (e.g. GEMINI_API_KEY).
 * @param {string} [opts.conversationId] - sets `x-sm-conversation-id`; pass a
 *   per-user/per-session id, never a cross-user shared value.
 * @param {Record<string,string>} [opts.headers] - extra headers merged in.
 * @returns {ReturnType<typeof createGoogleGenerativeAI>} a model factory,
 *   e.g. call `infiniteChat('gemini-2.5-flash')` exactly like the plain
 *   `google(...)` factory it replaces.
 */
export function createSupermemoryInfiniteChat(apiKey, opts = {}) {
  const key = requireApiKey(apiKey);
  const { providerName, providerApiKey, conversationId, headers = {} } = opts;

  if (!providerApiKey) {
    throw new Error('createSupermemoryInfiniteChat: opts.providerApiKey is required');
  }
  const upstreamBase = PROVIDER_UPSTREAM_BASE[providerName];
  if (!upstreamBase) {
    throw new Error(
      `createSupermemoryInfiniteChat: unsupported providerName "${providerName}". ` +
      `Supported: ${Object.keys(PROVIDER_UPSTREAM_BASE).join(', ')}`
    );
  }

  const proxyHeaders = {
    'x-supermemory-api-key': key,
    ...(conversationId ? { 'x-sm-conversation-id': conversationId } : {}),
    ...headers,
  };

  // Only the 'google' path is exercised by this repo today (gemini-2.5-flash
  // dialog/eval calls); other provider names would need their matching
  // `@ai-sdk/*` factory wired in here when adopted.
  if (providerName === 'google') {
    return createGoogleGenerativeAI({
      baseURL: `${SUPERMEMORY_PROXY_BASE}/${upstreamBase}`,
      apiKey: providerApiKey,
      headers: proxyHeaders,
    });
  }

  throw new Error(
    `createSupermemoryInfiniteChat: providerName "${providerName}" has no wired @ai-sdk/* factory yet`
  );
}

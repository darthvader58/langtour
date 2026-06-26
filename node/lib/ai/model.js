// Shared model-factory helper for generateTurn/evaluateResponse.
//
// Both Gemini calls go through Supermemory's Infinite Chat proxy
// (createSupermemoryInfiniteChat, T-A: node/lib/supermemory/client.js) for
// context-token compression (~90% savings per contract 01's cost-discipline
// section). `conversationId` is scoped per (userId, scenarioId) so
// Supermemory can compress across turns within one scenario without mixing
// context across different scenarios or different users.
//
// Context7 note: `ai@6.0.208` / `@ai-sdk/google@3.0.83` per node/package.json.
// `createGoogleGenerativeAI({ apiKey, baseURL, headers })` is the same
// factory shape `generateTurn.js`/`evaluateResponse.js` used directly before
// this ticket; createSupermemoryInfiniteChat just points it at the
// Supermemory-proxied baseURL (see lib/supermemory/client.js for the
// documented Infinite Chat contract this implements).

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createSupermemoryInfiniteChat } from '../supermemory/client.js';
import { GEMINI_API_KEY, SUPERMEMORY_API_KEY } from '../config.js';

const MODEL_ID = 'gemini-2.5-flash';

let directGoogle;
function directModel() {
  directGoogle ||= createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
  return directGoogle(MODEL_ID);
}

/**
 * Builds the Gemini model to use for a dialog/eval call, routed through the
 * Supermemory Infinite Chat proxy when a SUPERMEMORY_API_KEY is configured.
 * Falls back to calling Gemini directly (no compression) if the key is
 * missing, so local/dev environments without Supermemory configured don't
 * hard-fail — same fallback posture as the rest of node/lib/supermemory.
 *
 * @param {{ userId: string, scenarioId: string }} scope - used to build a
 *   conversationId stable across turns of the same scenario for the same
 *   user, never shared cross-user.
 * @returns {import('ai').LanguageModel}
 */
export function getDialogModel(scope = {}) {
  if (!SUPERMEMORY_API_KEY) return directModel();

  const { userId, scenarioId } = scope;
  const conversationId = userId && scenarioId ? `${userId}:${scenarioId}` : undefined;

  try {
    const infiniteChat = createSupermemoryInfiniteChat(SUPERMEMORY_API_KEY, {
      providerName: 'google',
      providerApiKey: GEMINI_API_KEY,
      conversationId,
    });
    return infiniteChat(MODEL_ID);
  } catch {
    // Defensive: proxy misconfiguration shouldn't break gameplay.
    return directModel();
  }
}

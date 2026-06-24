// Thin, typed read/write surface over a user's Supermemory vocab-forest.
// No business logic here — forward-chaining, mastery scoring, and stale-word
// detection belong to T-D (backend-graph) / T-F (game-ai). This module only
// shapes calls to the Supermemory SDK per contract 01:
//   /Users/shashwatraj/langtour-memory/contracts/01-supermemory-forest.md
//
// ForestNode shape (see contract for the full field list):
//   { kind, lang, id, parent_id, label, expression?, reading?, meaning?,
//     first_seen_at, last_used_at, mastery, fsrs? }

import { userTag } from './containerTag.js';
import { supermemoryClient, memoryTools } from './client.js';

const VALID_KINDS = new Set(['root', 'superset', 'situation', 'word']);
const VALID_LANGS = new Set(['zh', 'fr', 'es', 'hi']);

function assertNode(node) {
  if (!node || typeof node !== 'object') {
    throw new Error('forest: node must be an object');
  }
  if (!VALID_KINDS.has(node.kind)) {
    throw new Error(`forest: invalid node.kind "${node.kind}"`);
  }
  if (!VALID_LANGS.has(node.lang)) {
    throw new Error(`forest: invalid node.lang "${node.lang}"`);
  }
  if (typeof node.id !== 'string' || !node.id) {
    throw new Error('forest: node.id is required');
  }
  if (node.parent_id !== null && typeof node.parent_id !== 'string') {
    throw new Error('forest: node.parent_id must be a string or null');
  }
}

/**
 * Reads a user's forest profile: mastered/cleared (static) and the current
 * learning cycle + stale-word signal (dynamic), per contract 01.
 *
 * @param {string} userId - Supabase auth.users.id (UUID). Validated and
 *   turned into the containerTag internally; never accept a pre-built tag
 *   from the caller/client.
 * @param {object} [opts]
 * @param {string} [opts.q] - optional search query to also return searchResults.
 * @param {number} [opts.threshold] - relevance threshold (0..1) for opts.q.
 * @param {string} [opts.apiKey] - defaults to SUPERMEMORY_API_KEY from env.
 * @returns {Promise<{static: string[], dynamic: string[], searchResults?: object}>}
 */
export async function getForestProfile(userId, opts = {}) {
  const tag = userTag(userId);
  const client = supermemoryClient(opts.apiKey);
  const { q, threshold } = opts;
  const response = await client.profile({
    containerTag: tag,
    ...(q ? { q } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
  });
  return {
    static: response.profile?.static ?? [],
    dynamic: response.profile?.dynamic ?? [],
    ...(response.searchResults ? { searchResults: response.searchResults } : {}),
  };
}

/**
 * Appends/upserts a single ForestNode into a user's container as a
 * Supermemory document. Idempotent on `node.id` via `customId`.
 *
 * @param {string} userId - Supabase auth.users.id (UUID).
 * @param {object} node - ForestNode (see contract 01 for the full shape).
 * @param {string} [apiKey] - defaults to SUPERMEMORY_API_KEY from env.
 * @returns {Promise<{id: string, status: string}>}
 */
export async function appendForestNode(userId, node, apiKey) {
  assertNode(node);
  const tag = userTag(userId);
  const client = supermemoryClient(apiKey);
  return client.add({
    content: JSON.stringify(node),
    containerTag: tag,
    customId: node.id,
    metadata: {
      kind: node.kind,
      lang: node.lang,
      parent_id: node.parent_id ?? '',
    },
  });
}

/**
 * Appends/upserts a batch of ForestNodes for one user. Use after every
 * server-confirmed scenario completion to write the words actually used
 * this turn plus a situation-coverage note (contract 01, write path).
 *
 * @param {string} userId
 * @param {object[]} nodes - ForestNode[]
 * @param {string} [apiKey]
 * @returns {Promise<Array<{id: string, status: string}>>}
 */
export async function appendForestNodes(userId, nodes, apiKey) {
  if (!Array.isArray(nodes)) {
    throw new Error('forest: nodes must be an array');
  }
  const results = [];
  for (const node of nodes) {
    results.push(await appendForestNode(userId, node, apiKey));
  }
  return results;
}

/**
 * Returns the `@supermemory/ai-sdk` tool set (searchMemories, addMemory)
 * scoped strictly to this user's container — for tool-style writes during a
 * dialog turn (e.g. inside `generateTurn`/`evaluateResponse` in
 * `node/lib/ai/`). Never call with another user's id in the same request.
 *
 * @param {string} userId
 * @param {string} [apiKey]
 */
export function forestTools(userId, apiKey) {
  return memoryTools([userTag(userId)], apiKey);
}

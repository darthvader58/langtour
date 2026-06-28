// Stale-word resurfacing helper for Langtour.
//
// `getDueForResurfacing` surfaces words from the user's Supermemory vocab-forest
// that haven't been used for >= minIdleHours hours, so generateTurn (lib/ai) can
// weave them back lightly into situational dialogue.
//
// Context7 finding (supermemory@4.24.12, read 2026-06-28):
//   profile().profile.dynamic returns string[] with NO per-entry timestamps.
//   To get per-entry timestamps we use client.documents.list() which returns:
//     { documents: [{ id, content, status, metadata, createdAt, updatedAt? }], total }
//   Staleness priority (highest trust wins):
//     1. node.last_used_at from our stored content JSON (the ForestNode field we wrote).
//     2. doc.updatedAt  from the Supermemory API response.
//     3. doc.createdAt  from the Supermemory API response (lower bound).
//   No client-sent timestamp is ever trusted — the Supermemory-returned values
//   are the sole staleness source.

import { userTag } from './containerTag.js';
import { supermemoryClient } from './client.js';

/**
 * @typedef {{ expression: string; meaning: string; lastUsedAt: string }} DueWord
 */

/**
 * Returns words from the user's Supermemory forest that haven't been used for
 * at least `minIdleHours` hours. Results are sorted by `lastUsedAt` ascending
 * (stalest first) and capped at `max`.
 *
 * Best-effort: Supermemory errors are caught, logged, and `[]` is returned so
 * this never blocks dialog generation. Input validation (non-UUID userId) throws
 * before any network call is made — callers must supply a valid user id.
 *
 * @param {string} userId - Supabase auth.users.id (UUID). Validated before any
 *   network call; non-UUID input throws synchronously.
 * @param {{ now?: Date; minIdleHours?: number; max?: number }} [opts]
 * @returns {Promise<DueWord[]>}
 */
export async function getDueForResurfacing(userId, { now = new Date(), minIdleHours = 48, max = 5 } = {}) {
  // Validate userId before touching the network — throws for non-UUIDs.
  const tag = userTag(userId);

  try {
    const client = supermemoryClient();
    const cutoff = new Date(now.getTime() - minIdleHours * 3_600_000);

    // List word-kind nodes sorted oldest-updated-first. Over-fetch so that
    // in-memory cutoff filtering doesn't under-fill the max.
    const response = await client.documents.list({
      containerTags: [tag],
      filters: { AND: [{ key: 'kind', value: 'word', negate: false }] },
      sort: 'updatedAt',
      order: 'asc',
      limit: Math.max(max * 10, 50),
    });

    const documents = response?.documents ?? response?.items ?? [];
    if (!Array.isArray(documents) || documents.length === 0) return [];

    // Collect all candidates first, then sort in-memory as a safety net (the API
    // sorts but we don't want to rely on that for correctness), then cap.
    const candidates = [];
    for (const doc of documents) {
      let node = null;
      if (doc.content && typeof doc.content === 'string') {
        try {
          node = JSON.parse(doc.content);
        } catch {
          // Supermemory may AI-process and transform content; not always raw JSON.
        }
      }

      // Trust source priority: node.last_used_at → API updatedAt → API createdAt.
      const lastUsedRaw = node?.last_used_at ?? doc.updatedAt ?? doc.createdAt ?? null;
      if (!lastUsedRaw) continue;

      const lastUsedDate = new Date(lastUsedRaw);
      if (isNaN(lastUsedDate.getTime())) continue;

      // Only include entries older than the cutoff.
      if (lastUsedDate >= cutoff) continue;

      const expression = node?.expression ?? doc.metadata?.expression ?? null;
      const meaning = node?.meaning ?? doc.metadata?.meaning ?? '';
      if (!expression) continue;

      candidates.push({ expression, meaning, lastUsedAt: lastUsedRaw, _ts: lastUsedDate.getTime() });
    }

    // Sort ascending (stalest first); safety net against API ordering drift.
    candidates.sort((a, b) => a._ts - b._ts);

    return candidates
      .slice(0, max)
      .map(({ expression, meaning, lastUsedAt }) => ({ expression, meaning, lastUsedAt }));
  } catch (err) {
    // Best-effort: resurfacing is a UX nudge, never a correctness gate.
    console.error('[resurface] getDueForResurfacing error:', err?.message ?? err);
    return [];
  }
}

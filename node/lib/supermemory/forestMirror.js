// Forest-edges mirror writer for Langtour.
//
// Syncs the parent→child edge set from a user's Supermemory vocab-forest into
// the postgres `forest_edges` table so `/api/profile/word-graph` can render
// without a Supermemory round-trip. Writes run as the service role; RLS on
// `forest_edges` protects reads (users can only SELECT their own rows).
//
// Migration: supabase/migrations/20260629000001_scenario_turn_grants.sql
// Contract:  /Users/shashwatraj/langtour-memory/contracts/01-supermemory-forest.md
//
// Suggested call sites (wiring is owned by T-E, not this ticket):
//   1. After `appendForestNode(s)` succeeds in the Supermemory write path.
//   2. After `record_scenario_turn` RPC returns a non-empty `usedWordIds[]`
//      in the route handler (node/routes/scenario.js).
// Both are best-effort: failures must not block the user's grant flow.

import { userTag } from './containerTag.js';
import { supermemoryClient } from './client.js';

const VALID_KINDS = new Set(['root', 'superset', 'situation', 'word']);
// One page is enough for v1 (scenario count × word set << 200 per user).
// If forests grow larger, call with increasing offsets until total is reached.
const LIST_LIMIT = 200;

/**
 * Pulls the user's full forest from Supermemory and upserts the parent/child
 * edge set into `forest_edges`. Idempotent on (user_id, parent_id, child_id).
 *
 * Does NOT wipe existing edges on an empty result — empty means "no edges
 * detected this run", not "forest is gone". Destructive sync is a separate,
 * explicit operation that T-E can add if ever needed.
 *
 * @param {string} userId - Supabase auth.users.id (UUID). Non-UUID input throws
 *   synchronously before any I/O.
 * @returns {Promise<{ inserted: number; removed: number }>}
 */
export async function syncForestEdgesForUser(userId) {
  // Validate userId before touching any I/O — throws for non-UUIDs.
  const tag = userTag(userId);

  let allDocuments = [];
  try {
    const client = supermemoryClient();
    // Fetch all nodes for this user. No kind filter — we want the full edge set
    // across root, superset, situation, and word nodes.
    const response = await client.documents.list({
      containerTags: [tag],
      limit: LIST_LIMIT,
      offset: 0,
    });
    allDocuments = response?.documents ?? response?.items ?? [];
  } catch (err) {
    console.error('[forestMirror] Supermemory list error:', err?.message ?? err);
    return { inserted: 0, removed: 0 };
  }

  if (!Array.isArray(allDocuments) || allDocuments.length === 0) {
    return { inserted: 0, removed: 0 };
  }

  // Build the edge set: every node with a non-empty parent_id produces an edge.
  // parent_id comes from metadata (stored during appendForestNode) or falls back
  // to parsing the content JSON.
  const edges = [];
  for (const doc of allDocuments) {
    let parentId = doc.metadata?.parent_id ?? null;
    let kind = doc.metadata?.kind ?? null;
    // customId is our node.id (set via appendForestNode's `customId: node.id`).
    const childId = doc.customId ?? doc.id ?? null;

    // Fall back to parsing content JSON if metadata is sparse.
    if ((!parentId || !kind) && doc.content && typeof doc.content === 'string') {
      try {
        const node = JSON.parse(doc.content);
        parentId = parentId || node.parent_id || null;
        kind = kind || node.kind || null;
      } catch {
        // AI-processed content may not be raw JSON; skip.
      }
    }

    // An edge requires a valid parent, a non-empty child id, and a known kind.
    if (!parentId || parentId === '' || !childId || !kind) continue;
    if (!VALID_KINDS.has(kind)) continue;

    edges.push({ parent_id: parentId, child_id: childId, kind });
  }

  if (edges.length === 0) {
    // No edges found — don't wipe the mirror (destructive). Return cleanly.
    return { inserted: 0, removed: 0 };
  }

  const now = new Date().toISOString();
  const rows = edges.map((e) => ({
    user_id: userId,
    parent_id: e.parent_id,
    child_id: e.child_id,
    kind: e.kind,
    last_seen_at: now,
  }));

  try {
    // Lazy import: avoids db.js top-level env-var check at module-load time,
    // which would break any importer that loads forestMirror.js before env vars
    // are set (e.g. test files that mock db.js per-test). In production the env
    // vars are always set before the server starts, so this is safe.
    const { db } = await import('../db/db.js');
    const { error } = await db
      .from('forest_edges')
      .upsert(rows, { onConflict: 'user_id,parent_id,child_id' });
    if (error) {
      console.error('[forestMirror] DB upsert error:', error.message);
      return { inserted: 0, removed: 0 };
    }
  } catch (err) {
    console.error('[forestMirror] DB error:', err?.message ?? err);
    return { inserted: 0, removed: 0 };
  }

  return { inserted: rows.length, removed: 0 };
}

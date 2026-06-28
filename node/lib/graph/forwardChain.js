// Forward-chaining target-word engine for scenario-level vocabulary progression.
//
// Semantics: "next words" = words from the scenario's static catalog that the
// user has NOT yet attested in this scenario, prioritised by:
//   1. Reachability via forest_edges: children of already-attested words in
//      the user's vocab forest (when forest_edges is populated by T-F).
//   2. Catalog progression order (display_order): fallback when the forest is
//      empty (which is always the case before T-F ships its writer).
//
// K (CHAIN_TARGET_LIMIT): default maximum words returned per call.  Callers
// may override via the `limit` option.  5 is the default — enough to keep a
// turn interesting without overwhelming the player.
//
// Contract: this module DOES NOT yet rewire generateTurn to call it — that
// follows in the T-F / forest-resurfacing ticket once forest_edges is live.
// Build and test it now so the API surface is stable for that pairing.

import { db } from '../db/db.js';
import { COUNTRIES } from '../../../client/src/gameData.js';

export const CHAIN_TARGET_LIMIT = 5;

const LANG_BY_DB_CODE = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.langCode]));
const LANG_BY_SHORT_CODE = new Map(COUNTRIES.map((c) => [c.code.toLowerCase(), c.langCode]));

function resolveLangCode(countryCode) {
  const norm = String(countryCode || '').trim().toLowerCase();
  return LANG_BY_DB_CODE.get(norm) ?? LANG_BY_SHORT_CODE.get(norm) ?? null;
}

/**
 * Returns the next set of growing-target words for a scenario turn.
 *
 * Reads:
 *   - scenario_turn_grants  → which word IDs the user has already attested
 *   - game_scenario_vocabulary + learning_words → the scenario's full catalog
 *   - forest_edges (kind='word') → concept edges for forward chaining
 *
 * The forest_edges table may be empty (T-F populates it later).  In that case
 * the function falls back cleanly to the next K un-attested catalog words in
 * their intended display_order.
 *
 * @param {{
 *   userId: string,
 *   countryCode: string,
 *   scenarioId: string,
 *   limit?: number,
 * }} opts
 * @returns {Promise<Array<{ id: number, expression: string, reading?: string, meaning: string }>>}
 */
export async function getForwardChainTargetWords({ userId, countryCode, scenarioId, limit = CHAIN_TARGET_LIMIT }) {
  // 1. Collect the union of all word IDs the user has already attested across
  //    every recorded turn for this (user, scenario) pair.
  const { data: grantRows, error: grantError } = await db
    .from('scenario_turn_grants')
    .select('used_word_ids')
    .eq('user_id', userId)
    .eq('scenario_id', scenarioId);
  if (grantError) throw new Error(`forwardChain: load grants: ${grantError.message}`);

  const attestedIds = new Set(
    (grantRows ?? []).flatMap((row) => row.used_word_ids ?? [])
  );

  // 2. Load the full ordered catalog for this scenario.
  const { data: vocabRows, error: vocabError } = await db
    .from('game_scenario_vocabulary')
    .select('scenario_id, display_order, english, chinese, pinyin')
    .eq('scenario_id', scenarioId)
    .order('display_order');
  if (vocabError) throw new Error(`forwardChain: load scenario vocab: ${vocabError.message}`);

  if (!vocabRows || vocabRows.length === 0) return [];

  // 3. Resolve each catalog expression to a learning_words row (to get DB ids).
  //    Filter by language if we can determine it from countryCode.
  const langCode = resolveLangCode(countryCode);
  const expressions = vocabRows.map((v) => v.chinese).filter(Boolean);

  let wordsQuery = db
    .from('learning_words')
    .select('id, expression, reading, meaning')
    .in('expression', expressions);
  if (langCode) wordsQuery = wordsQuery.eq('language', langCode);

  const { data: wordRows, error: wordError } = await wordsQuery;
  if (wordError) throw new Error(`forwardChain: load words: ${wordError.message}`);

  const wordByExpression = new Map((wordRows ?? []).map((w) => [w.expression, w]));

  // Build the catalog list preserving display_order, skipping entries with no
  // matching learning_words row (they haven't been seeded yet).
  const catalogWords = vocabRows
    .map((v) => {
      const w = wordByExpression.get(v.chinese);
      if (!w) return null;
      return { id: w.id, expression: w.expression, reading: w.reading ?? undefined, meaning: w.meaning };
    })
    .filter(Boolean);

  // 4. Check whether the user's vocab forest has any word-level edges.
  //    The table is populated by T-F's forest.js writer (not yet shipped).
  //    Handle an empty result gracefully — it is the expected state for now.
  const { data: edgeRows, error: edgeError } = await db
    .from('forest_edges')
    .select('parent_id, child_id')
    .eq('user_id', userId)
    .eq('kind', 'word');
  if (edgeError) throw new Error(`forwardChain: load forest edges: ${edgeError.message}`);

  const forestEmpty = !edgeRows || edgeRows.length === 0;

  if (forestEmpty) {
    // Fallback path: return the first K un-attested catalog words in order.
    // This is the primary path until T-F's writer ships.
    return catalogWords.filter((w) => !attestedIds.has(w.id)).slice(0, limit);
  }

  // 5. Forest traversal: BFS from the set of already-attested word expressions
  //    to find their direct children in the forest.  We only look one hop out
  //    (depth-1 BFS) — deep chaining is handled incrementally across turns.
  const wordById = new Map((wordRows ?? []).map((w) => [w.id, w]));

  // Build parent → Set<child> adjacency for this user's word-level edges.
  const adjacency = new Map();
  for (const edge of edgeRows) {
    if (!adjacency.has(edge.parent_id)) adjacency.set(edge.parent_id, new Set());
    adjacency.get(edge.parent_id).add(edge.child_id);
  }

  // Gather expressions of already-attested words (attested by id).
  const attestedExpressions = new Set(
    [...attestedIds].map((id) => wordById.get(id)?.expression).filter(Boolean)
  );

  // Find child expressions reachable from attested expressions via the forest.
  const reachableExpressions = new Set();
  for (const expr of attestedExpressions) {
    const children = adjacency.get(expr);
    if (children) {
      for (const child of children) {
        reachableExpressions.add(child);
      }
    }
  }

  // Filter the catalog to words that are reachable and not yet attested.
  const byExpression = new Map(catalogWords.map((w) => [w.expression, w]));
  const reachableWords = [...reachableExpressions]
    .map((expr) => byExpression.get(expr))
    .filter((w) => w && !attestedIds.has(w.id));

  if (reachableWords.length > 0) {
    return reachableWords.slice(0, limit);
  }

  // If the forest is populated but no reachable catalog words remain (e.g.
  // the scenario and the forest don't overlap yet), fall back to catalog order.
  return catalogWords.filter((w) => !attestedIds.has(w.id)).slice(0, limit);
}

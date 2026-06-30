// DB-calling wrapper for the growing-target policy.
//
// The pure policy engine (constants + computeGrowingTarget) lives in
// growingTargetPolicy.js with no I/O dependencies so it can be unit-tested
// with a plain static import.  This file re-exports everything from there and
// adds the DB-backed getGrowingTargetState() for use in route handlers.
//
// See growingTargetPolicy.js for the full policy documentation.

export {
  INITIAL_TARGET_SIZE,
  GROW_PER_ATTEST,
  ESSENTIAL_FRACTION,
  computeGrowingTarget,
} from './growingTargetPolicy.js';

import { computeGrowingTarget } from './growingTargetPolicy.js';
import { COUNTRIES } from '../../../client/src/gameData.js';

// `db` is loaded via dynamic import inside getGrowingTargetState so node:test
// `mock.module('../db/db.js', ...)` calls registered after this module's
// initial load still propagate. A top-level static import would capture the
// real `db` at first load and survive later mocking — same class of bug as
// the SUPERMEMORY_API_KEY cache fix in node/lib/supermemory/client.js.

// --- Country-code helper ---

const LANG_BY_DB_CODE = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.langCode]));
const LANG_BY_SHORT_CODE = new Map(COUNTRIES.map((c) => [c.code.toLowerCase(), c.langCode]));

function resolveLangCode(countryCode) {
  const norm = String(countryCode || '').trim().toLowerCase();
  return LANG_BY_DB_CODE.get(norm) ?? LANG_BY_SHORT_CODE.get(norm) ?? null;
}

// --- DB-calling wrapper ---

/**
 * Loads the catalog and attested state for a (user, scenario) pair and
 * delegates to computeGrowingTarget().  Used by route handlers that need
 * the server-authoritative growing target after each turn.
 *
 * @param {{ userId: string, countryCode: string, scenarioId: string }} opts
 * @returns {Promise<{
 *   targetWords: Array<{ id: number, expression: string, reading?: string, meaning: string }>,
 *   scenarioComplete: boolean,
 *   windowSize: number,
 *   essentialCount: number,
 * }>}
 */
export async function getGrowingTargetState({ userId, countryCode, scenarioId }) {
  const { db } = await import('../db/db.js');

  // 1. Collect all word IDs the user has attested across every turn for this scenario.
  const { data: grantRows, error: grantErr } = await db
    .from('scenario_turn_grants')
    .select('used_word_ids')
    .eq('user_id', userId)
    .eq('scenario_id', scenarioId);
  if (grantErr) throw new Error(`growingTarget: load grants: ${grantErr.message}`);

  const attestedIds = new Set(
    (grantRows ?? []).flatMap((r) => r.used_word_ids ?? []),
  );

  // 2. Load the full ordered catalog for this scenario.
  const { data: vocabRows, error: vocabErr } = await db
    .from('game_scenario_vocabulary')
    .select('display_order, english, chinese, pinyin')
    .eq('scenario_id', scenarioId)
    .order('display_order');
  if (vocabErr) throw new Error(`growingTarget: load vocab: ${vocabErr.message}`);

  if (!vocabRows || vocabRows.length === 0) {
    return { targetWords: [], scenarioComplete: false, windowSize: 0, essentialCount: 0 };
  }

  // 3. Resolve catalog expressions to learning_words rows (for DB ids and readings).
  // Reject unknown country codes — learning_words is keyed (expression, language),
  // and without a language filter the query would return same-expression rows from
  // any language and silently feed wrong-language ids into computeGrowingTarget.
  const langCode = resolveLangCode(countryCode);
  if (!langCode) {
    return { targetWords: [], scenarioComplete: false, windowSize: 0, essentialCount: 0 };
  }
  const expressions = vocabRows.map((v) => v.chinese).filter(Boolean);

  const wordsQuery = db
    .from('learning_words')
    .select('id, expression, reading, meaning')
    .in('expression', expressions)
    .eq('language', langCode);

  const { data: wordRows, error: wordErr } = await wordsQuery;
  if (wordErr) throw new Error(`growingTarget: load words: ${wordErr.message}`);

  const wordByExpression = new Map((wordRows ?? []).map((w) => [w.expression, w]));

  // Build the ordered catalog list, preserving display_order and skipping
  // expressions not yet seeded in learning_words.
  const allCatalogWords = vocabRows
    .map((v) => {
      const w = wordByExpression.get(v.chinese);
      if (!w) return null;
      return { id: w.id, expression: w.expression, reading: w.reading ?? undefined, meaning: w.meaning };
    })
    .filter(Boolean);

  return computeGrowingTarget(allCatalogWords, attestedIds);
}

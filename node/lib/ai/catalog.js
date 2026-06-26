// Catalog validation for the lib/ai boundary (T-D).
//
// Pre-existing bug (flagged by T-C): generateTurn/evaluateResponse trusted
// scenarioContext/targetWords/langCode verbatim from the request body, with
// no check against the Postgres catalog. This module is the single point of
// truth for that validation so routes/scenario.js doesn't duplicate it.
//
// Country-code namespaces in this repo are NOT unified (verified against the
// tree, not assumed):
//   - `game_countries.code` / `scenario_catalog.country_code` (DB) are the
//     lowercased full country name, e.g. 'china' (see node/lib/db/db.js
//     initializeDatabase: `code: country.name.toLowerCase()`).
//   - `client/src/gameData.js` COUNTRIES[].code is the 2-letter code used by
//     sidekick.js, e.g. 'cn'.
// `resolveCountry` accepts either spelling and returns both, so callers
// (generateTurn/evaluateResponse/sidekick) can use whichever they need
// without re-deriving the mapping.

import { db } from '../db/db.js';
import { COUNTRIES } from '../../../client/src/gameData.js';

const COUNTRY_BY_DB_CODE = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]));
const COUNTRY_BY_SHORT_CODE = new Map(COUNTRIES.map((c) => [c.code.toLowerCase(), c]));

export class CatalogValidationError extends Error {
  constructor(message, code = 'unknown_catalog_value') {
    super(message);
    this.name = 'CatalogValidationError';
    this.code = code;
  }
}

/**
 * Resolves a country code in either namespace (DB full-name or gameData
 * 2-letter) to a single descriptor. Throws CatalogValidationError if neither
 * namespace recognizes it, or if it isn't also a row in `game_countries`.
 *
 * @param {string} countryCode
 * @returns {Promise<{ dbCode: string, shortCode: string, langCode: string, name: string }>}
 */
export async function resolveCountry(countryCode) {
  const raw = String(countryCode || '').trim().toLowerCase();
  if (!raw) throw new CatalogValidationError('countryCode is required', 'missing_country_code');

  const entry = COUNTRY_BY_DB_CODE.get(raw) || COUNTRY_BY_SHORT_CODE.get(raw);
  if (!entry) {
    throw new CatalogValidationError(`Unknown countryCode "${countryCode}"`, 'unknown_country_code');
  }

  const dbCode = entry.name.toLowerCase();
  const { data, error } = await db.from('game_countries').select('code').eq('code', dbCode).maybeSingle();
  if (error) throw new Error(`resolveCountry: ${error.message}`);
  if (!data) {
    throw new CatalogValidationError(`Unknown countryCode "${countryCode}"`, 'unknown_country_code');
  }

  return { dbCode, shortCode: entry.code.toLowerCase(), langCode: entry.langCode, name: entry.name };
}

/**
 * Validates that a scenario belongs to a country's active catalog.
 * @param {string} dbCountryCode - the lowercased full-name DB code (see resolveCountry).
 * @param {string} scenarioId
 */
export async function assertScenarioInCatalog(dbCountryCode, scenarioId) {
  const id = String(scenarioId || '').trim();
  if (!id) throw new CatalogValidationError('scenarioId is required', 'missing_scenario_id');

  const { data, error } = await db
    .from('scenario_catalog')
    .select('scenario_id,is_active')
    .eq('country_code', dbCountryCode)
    .eq('scenario_id', id)
    .maybeSingle();
  if (error) throw new Error(`assertScenarioInCatalog: ${error.message}`);
  if (!data || !data.is_active) {
    throw new CatalogValidationError(`Unknown scenarioId "${scenarioId}" for country "${dbCountryCode}"`, 'unknown_scenario_id');
  }
}

/**
 * Validates langCode matches the country's catalog language. Rejects mismatches
 * rather than silently coercing, per CLAUDE.md's input-validation invariant.
 * @param {string} langCode
 * @param {string} expectedLangCode - resolveCountry(...).langCode
 */
export function assertLangMatchesCountry(langCode, expectedLangCode) {
  const lang = String(langCode || '').trim().toLowerCase();
  if (!lang) throw new CatalogValidationError('langCode is required', 'missing_lang_code');
  if (expectedLangCode && lang !== String(expectedLangCode).toLowerCase()) {
    throw new CatalogValidationError(
      `langCode "${langCode}" does not match country's language "${expectedLangCode}"`,
      'lang_code_mismatch',
    );
  }
}

/**
 * Validates every targetWords[].id against learning_words (bigint ids).
 * Words without an `id` field are allowed through (legacy callers send plain
 * {expression, meaning} pairs with no DB id yet) — only present ids are
 * checked, so this tightens the boundary without breaking callers that don't
 * have ids to give.
 *
 * @param {Array<{ id?: number|string, expression: string }>} targetWords
 * @returns {Promise<void>}
 */
export async function assertTargetWordsKnown(targetWords) {
  if (!Array.isArray(targetWords)) {
    throw new CatalogValidationError('targetWords must be an array', 'invalid_target_words');
  }
  const ids = targetWords
    .map((w) => w && w.id)
    .filter((id) => id !== undefined && id !== null)
    .map((id) => Number(id));

  if (ids.some((id) => !Number.isInteger(id))) {
    throw new CatalogValidationError('targetWords[].id must be an integer', 'invalid_target_word_id');
  }
  if (ids.length === 0) return;

  const { data, error } = await db.from('learning_words').select('id').in('id', ids);
  if (error) throw new Error(`assertTargetWordsKnown: ${error.message}`);
  const known = new Set((data ?? []).map((row) => row.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new CatalogValidationError(`Unknown targetWords id(s): ${missing.join(', ')}`, 'unknown_target_word_id');
  }
}

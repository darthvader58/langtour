// Invariant: every langCode in the server-side country catalog must have a
// STARTER_VOCAB entry with all three SRS levels populated, or
// initializeDatabase() (node/lib/db/db.js) seeds zero learning_words rows for
// that language and the chain engine's discovery pool comes back empty (the
// bug this test guards against — see the ar/pt gap that shipped with zero
// dictionary rows for Egypt/Brazil).
import test from 'node:test';
import assert from 'node:assert/strict';

import { STARTER_VOCAB, VALID_LEVELS } from '../lib/srs/onboarding_vocab.js';

// COUNTRIES is the server-side catalog (imported the same way node/routes/
// scenario.js derives KNOWN_LANG_CODES) — don't hardcode the language list
// twice. Falls back to the known set only if the catalog can't be imported.
let CATALOG_LANG_CODES;
try {
  const { COUNTRIES } = await import('../../client/src/gameData.js');
  CATALOG_LANG_CODES = [...new Set(COUNTRIES.map((c) => c.langCode))];
} catch {
  // Fallback: the six langCodes the game catalog is known to define.
  CATALOG_LANG_CODES = ['zh', 'hi', 'fr', 'es', 'ar', 'pt'];
}

test('every catalog langCode has a non-empty STARTER_VOCAB entry', () => {
  assert.ok(CATALOG_LANG_CODES.length > 0, 'catalog language list should not be empty');

  for (const langCode of CATALOG_LANG_CODES) {
    const entry = STARTER_VOCAB[langCode];
    assert.ok(entry, `STARTER_VOCAB is missing an entry for langCode "${langCode}"`);

    for (const level of VALID_LEVELS) {
      const words = entry[level];
      assert.ok(
        Array.isArray(words) && words.length > 0,
        `STARTER_VOCAB.${langCode}.${level} must be a non-empty array`,
      );

      for (const row of words) {
        assert.ok(Array.isArray(row) && row.length === 4, `STARTER_VOCAB.${langCode}.${level} row must be a 4-tuple: ${JSON.stringify(row)}`);
        const [expression, , meaning] = row;
        assert.ok(
          typeof expression === 'string' && expression.trim().length > 0,
          `STARTER_VOCAB.${langCode}.${level} row has an empty expression: ${JSON.stringify(row)}`,
        );
        assert.ok(
          typeof meaning === 'string' && meaning.trim().length > 0,
          `STARTER_VOCAB.${langCode}.${level} row has an empty meaning: ${JSON.stringify(row)}`,
        );
      }
    }
  }
});

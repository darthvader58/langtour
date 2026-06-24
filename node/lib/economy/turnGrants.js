// Mirror of public.record_scenario_turn validation + math.
//
// The RPC is the source of truth in production. This module exists so the
// economy contract can be unit-tested without booting Supabase: the same
// predicate set drives both, and the tests catch drift between the two.
//
// The math (per_word_xp / per_word_tokens) is owner-ratified and intentionally
// hard-coded in both places — anyone changing rates has to touch both files,
// which is exactly the audit boundary we want.

export const PER_WORD_XP = 5;
export const PER_WORD_TOKENS = 1;

// Validate a server-side per-turn grant. Returns either
//   { ok: true, award: { xp, tokens, wordCount } }
// or { ok: false, code, message } where code mirrors the SQL errcode the RPC
// would raise. Throwing is reserved for programmer errors (bad arg types).
//
// `state` is the in-memory world the test passes in:
//   {
//     countries:   Set<string>       // valid country codes (catalog)
//     scenarios:   Set<string>       // "<country>::<scenario>" pairs in catalog
//     unlocks:     Set<string>       // "<user>::<country>" pairs unlocked
//     attestedWords: Set<string>     // "<user>::<wordId>" words the user owns
//     grants:      Map<string, {xpAwarded, tokensAwarded}>
//                                    // "<user>::<scenario>::<turn>" -> prior grant
//   }
export function validateTurnGrant(state, input) {
  const { userId, countryCode, scenarioId, turnIndex, usedWordIds } = input;

  if (!userId) return fail('28000', 'Authentication required');
  if (!Number.isInteger(turnIndex) || turnIndex < 0) {
    return fail('22023', 'Turn index must be a non-negative integer');
  }
  const normalizedCountry = typeof countryCode === 'string' ? countryCode.trim().toLowerCase() : '';
  if (!normalizedCountry) return fail('22023', 'Country code is required');
  const normalizedScenario = typeof scenarioId === 'string' ? scenarioId.trim() : '';
  if (!normalizedScenario) return fail('22023', 'Scenario id is required');
  if (!Array.isArray(usedWordIds)) {
    return fail('22023', 'used_word_ids must be an array');
  }

  if (!state.countries.has(normalizedCountry)) {
    return fail('22023', 'Unknown country');
  }
  if (!state.scenarios.has(`${normalizedCountry}::${normalizedScenario}`)) {
    return fail('22023', 'Unknown scenario');
  }
  if (!state.unlocks.has(`${userId}::${normalizedCountry}`)) {
    return fail('P0001', 'Country is not unlocked');
  }

  // Idempotency: prior grant wins, regardless of the new word list.
  const grantKey = `${userId}::${normalizedScenario}::${turnIndex}`;
  const prior = state.grants.get(grantKey);
  if (prior) {
    return {
      ok: true,
      awarded: false,
      award: {
        xp: prior.xpAwarded,
        tokens: prior.tokensAwarded,
        wordCount: prior.wordCount ?? null,
      },
    };
  }

  // Dedupe + null-strip first. The RPC is the trust boundary; passing
  // [101, 101, 101] must not inflate the award. Mirrors the SQL
  // `array_agg(distinct wid) ... where wid is not null` in record_scenario_turn.
  const dedupWordIds = Array.from(new Set(usedWordIds.filter((id) => id != null)));

  // Reject any word the user has not actually attested to. Fabricated IDs and
  // catalog-only IDs both fail here — the user must have a per-user progress
  // row, not just an entry in learning_words.
  for (const wid of dedupWordIds) {
    if (!state.attestedWords.has(`${userId}::${wid}`)) {
      return fail('22023', 'Unknown or unattested word');
    }
  }

  const wordCount = dedupWordIds.length;
  const xp = PER_WORD_XP * wordCount;
  const tokens = PER_WORD_TOKENS * wordCount;

  // Caller is expected to persist the grant on its own; this function only
  // computes and validates. The pattern matches how the RPC's `insert ... on
  // conflict do nothing` is the durable side-effect.
  return {
    ok: true,
    awarded: true,
    award: { xp, tokens, wordCount },
  };
}

function fail(code, message) {
  return { ok: false, code, message };
}

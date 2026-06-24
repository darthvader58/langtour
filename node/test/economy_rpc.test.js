// Unit tests for the per-turn economy contract.
//
// These exercise the Node mirror of record_scenario_turn (lib/economy/turnGrants.js).
// The SQL RPC is the production source of truth; this suite locks the same
// predicates so any drift fails CI before it ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PER_WORD_XP,
  PER_WORD_TOKENS,
  validateTurnGrant,
} from '../lib/economy/turnGrants.js';

const USER = 'user-1';
const COUNTRY = 'china';
const SCENARIO = 'street-market';

function freshState() {
  return {
    countries: new Set([COUNTRY, 'france']),
    scenarios: new Set([
      `${COUNTRY}::${SCENARIO}`,
      `${COUNTRY}::restaurant`,
      'france::street-market',
    ]),
    unlocks: new Set([`${USER}::${COUNTRY}`]),
    attestedWords: new Set([
      `${USER}::101`,
      `${USER}::102`,
      `${USER}::103`,
    ]),
    grants: new Map(),
  };
}

test('per-word rates match the ratified economy', () => {
  // If anyone re-tunes these without owner sign-off, both this assertion and
  // the SQL constants will diverge — by design.
  assert.equal(PER_WORD_XP, 5);
  assert.equal(PER_WORD_TOKENS, 1);
});

test('rejects unauthenticated callers with 28000', () => {
  const result = validateTurnGrant(freshState(), {
    userId: null,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [],
  });
  assert.deepEqual(result, { ok: false, code: '28000', message: 'Authentication required' });
});

test('rejects an unknown country with 22023', () => {
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: 'atlantis',
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [101],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, '22023');
  assert.match(result.message, /Unknown country/);
});

test('rejects an unknown scenario with 22023', () => {
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: 'space-station',
    turnIndex: 0,
    usedWordIds: [101],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, '22023');
  assert.match(result.message, /Unknown scenario/);
});

test('rejects earning from a country the user has not unlocked', () => {
  // Catalog has france, but this user only paid for china.
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: 'france',
    scenarioId: 'street-market',
    turnIndex: 0,
    usedWordIds: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'P0001');
  assert.match(result.message, /not unlocked/);
});

test('rejects fabricated word ids the user never encountered', () => {
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [101, 999], // 999 is in nobody's progress
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, '22023');
  assert.match(result.message, /Unknown or unattested word/);
});

test('rejects another users word even if it is attested somewhere', () => {
  const state = freshState();
  state.attestedWords.add('user-2::555');
  const result = validateTurnGrant(state, {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [555],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, '22023');
});

test('awards zero on an empty word list', () => {
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [],
  });
  assert.deepEqual(result, {
    ok: true,
    awarded: true,
    award: { xp: 0, tokens: 0, wordCount: 0 },
  });
});

test('awards exactly per-word rates for a single word', () => {
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [101],
  });
  assert.equal(result.ok, true);
  assert.equal(result.awarded, true);
  assert.deepEqual(result.award, { xp: 5, tokens: 1, wordCount: 1 });
});

test('awards scale linearly for N words', () => {
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [101, 102, 103],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.award, { xp: 15, tokens: 3, wordCount: 3 });
});

test('awards once per unique word id even if the array repeats', () => {
  // Trust-boundary regression: a caller passing [101, 101, 101] (with 101
  // attested) must be credited 5 XP / 1 token — not 15 / 3. The dedupe lives
  // inside the RPC and its JS mirror; the route layer cannot be trusted to
  // pre-clean the array.
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [101, 101, 101],
  });
  assert.equal(result.ok, true);
  assert.equal(result.awarded, true);
  assert.deepEqual(result.award, { xp: 5, tokens: 1, wordCount: 1 });
});

test('mixed duplicates and nulls collapse to the unique non-null set', () => {
  // Defence in depth: nulls (which the SQL `where wid is not null` strips)
  // and repeats both squash. Expected unique set = {101, 102}.
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [101, 102, 101, null, 102, null],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.award, { xp: 10, tokens: 2, wordCount: 2 });
});

test('duplicate (user, scenario, turn) returns the prior grant and does not re-award', () => {
  const state = freshState();
  const grantKey = `${USER}::${SCENARIO}::0`;
  state.grants.set(grantKey, { xpAwarded: 10, tokensAwarded: 2, wordCount: 2 });

  // Caller sends a wildly different word list — the prior grant wins anyway.
  const result = validateTurnGrant(state, {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [101, 102, 103],
  });

  assert.equal(result.ok, true);
  assert.equal(result.awarded, false, 'must NOT award a second time');
  assert.deepEqual(result.award, { xp: 10, tokens: 2, wordCount: 2 });
});

test('different turn_index on the same scenario is a fresh grant', () => {
  const state = freshState();
  state.grants.set(`${USER}::${SCENARIO}::0`, { xpAwarded: 5, tokensAwarded: 1, wordCount: 1 });

  const result = validateTurnGrant(state, {
    userId: USER,
    countryCode: COUNTRY,
    scenarioId: SCENARIO,
    turnIndex: 1,
    usedWordIds: [101, 102],
  });
  assert.equal(result.ok, true);
  assert.equal(result.awarded, true);
  assert.deepEqual(result.award, { xp: 10, tokens: 2, wordCount: 2 });
});

test('country code is normalised to lower case', () => {
  const result = validateTurnGrant(freshState(), {
    userId: USER,
    countryCode: '  CHINA  ',
    scenarioId: SCENARIO,
    turnIndex: 0,
    usedWordIds: [101],
  });
  assert.equal(result.ok, true);
  assert.equal(result.awarded, true);
});

test('rejects negative or non-integer turn_index', () => {
  for (const turnIndex of [-1, 1.5, '0', null, undefined]) {
    const result = validateTurnGrant(freshState(), {
      userId: USER,
      countryCode: COUNTRY,
      scenarioId: SCENARIO,
      turnIndex,
      usedWordIds: [],
    });
    assert.equal(result.ok, false, `expected rejection for turnIndex=${String(turnIndex)}`);
    assert.equal(result.code, '22023');
  }
});

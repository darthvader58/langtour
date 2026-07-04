import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPERSET_PRIORITY,
  SUPERSET_TREES,
  deriveSeedWords,
  estimatePassRate,
  generateNextScenario,
  planNextScenario,
  situationById,
} from '../lib/graph/chain.js';

const TOTAL_SITUATIONS = Object.values(SUPERSET_TREES).reduce((n, list) => n + list.length, 0);

function rowFor(plan) {
  return { scenario_id: plan.scenarioId, superset: plan.superset, position: plan.position };
}

test('first scenario starts the chain at position 0 in the first priority superset', () => {
  const plan = planNextScenario({ existing: [], forestProfile: { mastered: [], trees: {} } });
  assert.equal(plan.position, 0);
  assert.equal(plan.superset, SUPERSET_PRIORITY[0]);
  assert.equal(plan.chainComplete, false);
  assert.equal(plan.situation.superset, plan.superset);
});

test('scenario N seeds carry over mastery from scenario N-1’s tree', () => {
  const existing = [{ scenario_id: 'greetings', superset: 'meeting people', position: 0 }];
  const forestProfile = {
    mastered: ['bonjour', 'merci', 'gare'],
    trees: { 'meeting people': ['bonjour', 'merci'] },
  };
  const plan = planNextScenario({ existing, forestProfile });
  // Next superset in breadth order, seeded from the previous superset's tree.
  assert.notEqual(plan.superset, 'meeting people');
  assert.deepEqual(plan.seed.carryover, ['bonjour', 'merci']);
});

test('stale words are woven into the seed and deduped against carryover', () => {
  const existing = [{ scenario_id: 'greetings', superset: 'meeting people', position: 0 }];
  const forestProfile = { mastered: ['bonjour'], trees: { 'meeting people': ['bonjour'] } };
  const staleWords = [
    { wordId: 9, expression: 'bonjour' },       // duplicate of carryover — dropped
    { wordId: 10, expression: 'billet' },
    { wordId: 11, expression: 'quai' },
    { wordId: 12, expression: 'retard' },       // beyond maxStale — dropped
  ];
  const plan = planNextScenario({ existing, forestProfile, staleWords });
  assert.deepEqual(plan.seed.carryover, ['bonjour']);
  assert.deepEqual(plan.seed.stale, ['billet', 'quai']);
});

test('deriveSeedWords falls back to overall mastery when the previous tree is empty', () => {
  const seed = deriveSeedWords({
    forestProfile: { mastered: ['uno', 'dos', 'tres'], trees: {} },
    prevSuperset: 'food & stuff',
  });
  assert.deepEqual(seed.carryover, ['dos', 'tres']); // most recent mastery
});

test('chain_complete is set exactly on the scenario that covers the last superset', () => {
  let existing = [];
  const flags = [];
  for (let i = 0; i < SUPERSET_PRIORITY.length; i++) {
    const plan = planNextScenario({ existing, forestProfile: { mastered: [], trees: {} } });
    flags.push(plan.chainComplete);
    existing = [...existing, rowFor(plan)];
  }
  // Six supersets: only the sixth generated scenario closes the chain.
  assert.deepEqual(flags, [false, false, false, false, false, true]);
  // Breadth-first: the first pass covered each superset exactly once.
  assert.equal(new Set(existing.map((r) => r.superset)).size, SUPERSET_PRIORITY.length);
});

test('after basic coverage the chain goes deeper and finally exhausts to null', () => {
  let existing = [];
  for (let i = 0; i < TOTAL_SITUATIONS; i++) {
    const plan = planNextScenario({ existing, forestProfile: { mastered: [], trees: {} } });
    assert.ok(plan, `expected a plan at step ${i}`);
    if (i >= SUPERSET_PRIORITY.length) {
      assert.equal(plan.chainComplete, false, 'depth-phase scenarios never re-flag chain completion');
    }
    existing = [...existing, rowFor(plan)];
  }
  assert.equal(planNextScenario({ existing, forestProfile: { mastered: [], trees: {} } }), null);
  // No situation was generated twice.
  assert.equal(new Set(existing.map((r) => r.scenario_id)).size, TOTAL_SITUATIONS);
});

test('estimatePassRate reflects used/target ratio and clamps to [0,1]', () => {
  assert.equal(estimatePassRate([]), 0);
  assert.equal(estimatePassRate([{ used_word_ids: [1, 2], target_size: 4 }]), 0.5);
  assert.equal(estimatePassRate([{ used_word_ids: [1, 2, 3], target_size: 2 }]), 1);
});

test('situationById resolves catalog entries with their superset', () => {
  assert.deepEqual(situationById('restaurant'), {
    id: 'restaurant',
    title: 'Restaurant',
    superset: 'food & stuff',
  });
  assert.equal(situationById('nope'), null);
});

test('generateNextScenario persists the row and mixes seed + discovered words', async () => {
  const inserted = [];
  const deps = {
    forest: {
      getForestProfile: async () => ({
        mastered: ['nǐ hǎo'],
        trees: { 'meeting people': ['nǐ hǎo'] },
        currentCycle: [],
      }),
      getStaleWords: async () => [{ wordId: 7, expression: 'piào' }],
    },
    store: {
      listGeneratedScenarios: async () => [
        { scenario_id: 'greetings', superset: 'meeting people', position: 0, used_word_ids: [1, 2, 3], target_size: 4 },
      ],
      insertGeneratedScenario: async (userId, row) => inserted.push({ userId, row }),
    },
    words: {
      getWordsByExpressions: async (exprs) =>
        exprs.map((expression, i) => ({ id: 100 + i, expression, reading: 'r', meaning: 'm' })),
    },
    discovery: {
      getDiscoveryWords: async (_u, _topic, _lang, limit) =>
        Array.from({ length: limit }, (_, i) => ({ id: 200 + i, expression: `new${i}`, reading: 'r', meaning: 'm' })),
    },
  };

  const result = await generateNextScenario({ userId: 'u1', countryCode: 'cn', langCode: 'zh', deps });

  assert.equal(result.position, 1);
  assert.ok(result.targetWords.length >= 3 && result.targetWords.length <= 4);
  // Seed carryover made it into the target set alongside discovered words.
  assert.ok(result.targetWords.some((w) => w.id >= 100 && w.id < 200));
  assert.ok(result.targetWords.some((w) => w.id >= 200));

  assert.equal(inserted.length, 1);
  const { row } = inserted[0];
  assert.equal(row.country_code, 'cn');
  assert.equal(row.position, 1);
  assert.deepEqual(row.used_word_ids, []);
  assert.deepEqual(row.target_word_ids, result.targetWords.map((w) => w.id));
  assert.equal(row.target_size, result.targetWords.length);
  assert.ok(row.adaptive_cap >= row.target_size);
});

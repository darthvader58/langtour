// Forward-chaining scenario engine.
//
// A country's scenarios are no longer a fixed list: scenario N is planned from
// what the user mastered in scenario N-1 (read through the forest contract,
// docs/contracts/supermemory-forest.md) plus stale words due for resurfacing.
// Situations hang under "superset" trees (street-market / restaurant / ... under
// "food & stuff"); the chain is complete once every superset has at least one
// generated situation — the basic real-life tourist coverage.
//
// Everything here is pure planning logic except generateNextScenario /
// ensureTargetWords, which orchestrate through injected deps so the route layer
// stays thin and tests can stub the ai/forest/db seams.

import {
  computeAdaptiveCap,
  initialTargetSize,
} from './growth.js';

// Situation catalog. Titles are English framing; the dialog itself is generated
// in the target language, so the catalog stays language-agnostic.
export const SUPERSET_TREES = {
  'meeting people': [
    { id: 'greetings', title: 'Greetings & Small Talk' },
    { id: 'making-plans', title: 'Making Plans with a Local' },
  ],
  'food & stuff': [
    { id: 'street-market', title: 'Street Market' },
    { id: 'restaurant', title: 'Restaurant' },
    { id: 'pastry-shop', title: 'Pastry Shop' },
    { id: 'grocery-store', title: 'Grocery Store' },
  ],
  'getting around': [
    { id: 'taxi-ride', title: 'Taxi Ride' },
    { id: 'train-station', title: 'Train Station' },
    { id: 'asking-directions', title: 'Asking for Directions' },
  ],
  'money & shopping': [
    { id: 'souvenir-shop', title: 'Souvenir Shopping' },
    { id: 'currency-exchange', title: 'Currency Exchange' },
  ],
  'staying somewhere': [
    { id: 'hotel-checkin', title: 'Hotel Check-in' },
    { id: 'hotel-problems', title: 'Reporting a Room Problem' },
  ],
  'help & health': [
    { id: 'pharmacy', title: 'Pharmacy' },
    { id: 'lost-and-found', title: 'Lost & Found' },
  ],
};

// Breadth-first order: cover one situation per superset before going deeper.
export const SUPERSET_PRIORITY = Object.keys(SUPERSET_TREES);

// Roughly how many words a tourist actually needs to survive each situation
// family. Feeds the adaptive per-situation target cap — elementary and
// to-the-point, never a full dictionary.
export const ESSENTIAL_WORDS_BY_SUPERSET = {
  'meeting people': 6,
  'food & stuff': 8,
  'getting around': 7,
  'money & shopping': 6,
  'staying somewhere': 6,
  'help & health': 5,
};

// personaId keys are ratified in docs/contracts/sidekick-personas.md; the ctx
// passed to generateTurn/evaluateResponse carries this so game-ai can voice the
// sidekick without a country lookup of its own.
export const PERSONA_BY_COUNTRY = {
  cn: 'shanghai-spy',
  in: 'mumbai-star',
  fr: 'louvre-thief',
  mx: 'relic-hunter',
  eg: 'tomb-scholar',
  br: 'rio-reporter',
};

// Catalog lookup for a generated row (the DB row stores no title).
export function situationById(scenarioId) {
  for (const [superset, situations] of Object.entries(SUPERSET_TREES)) {
    const found = situations.find((s) => s.id === scenarioId);
    if (found) return { id: found.id, title: found.title, superset };
  }
  return null;
}

export function coveredSupersets(existing = []) {
  return new Set(existing.map((row) => row.superset).filter(Boolean));
}

// Seed vocab for scenario N: mastered carryover from scenario N-1's tree
// (chaining reinforcement) plus stale words due for resurfacing. Expressions
// only — the route resolves them to word rows.
export function deriveSeedWords({
  forestProfile,
  staleWords = [],
  prevSuperset = null,
  maxCarryover = 2,
  maxStale = 2,
} = {}) {
  const trees = forestProfile?.trees ?? {};
  const mastered = (forestProfile?.mastered ?? []).map((entry) =>
    typeof entry === 'string' ? entry : entry?.expression
  ).filter(Boolean);

  // Prefer the previous scenario's tree — that's what "mastered in N-1" means —
  // and fall back to overall mastery for the first scenario of a chain.
  const carrySource = (prevSuperset && trees[prevSuperset]?.length)
    ? trees[prevSuperset]
    : mastered;
  const carryover = carrySource.slice(-maxCarryover);

  const stale = staleWords
    .map((w) => w.expression)
    .filter((expr) => expr && !carryover.includes(expr))
    .slice(0, maxStale);

  return { carryover, stale };
}

// Plan scenario N. Returns null when every situation in the catalog is used.
// chainComplete is true exactly on the scenario whose generation makes every
// superset covered — the flag the reward-claim path checks (economy contract).
export function planNextScenario({ existing = [], forestProfile, staleWords = [] } = {}) {
  const usedIds = new Set(existing.map((row) => row.scenario_id));
  const covered = coveredSupersets(existing);

  let superset = SUPERSET_PRIORITY.find((name) => !covered.has(name));
  let breadthPhase = true;
  if (!superset) {
    // Basics covered — keep growing the forest depth-wise.
    superset = SUPERSET_PRIORITY.find((name) =>
      SUPERSET_TREES[name].some((situation) => !usedIds.has(situation.id))
    );
    breadthPhase = false;
    if (!superset) return null;
  }

  const situation = SUPERSET_TREES[superset].find((s) => !usedIds.has(s.id));
  if (!situation) return null;

  const prev = existing.length > 0 ? existing[existing.length - 1] : null;
  const seed = deriveSeedWords({ forestProfile, staleWords, prevSuperset: prev?.superset ?? null });

  const remainingAfter = SUPERSET_PRIORITY.filter(
    (name) => !covered.has(name) && name !== superset
  );
  const chainComplete = breadthPhase && remainingAfter.length === 0;

  return {
    scenarioId: situation.id,
    situation: { id: situation.id, title: situation.title, superset },
    superset,
    position: existing.length,
    seed,
    chainComplete,
  };
}

// Player pace across the chain so far: how much of each scenario's target set
// they actually used. Drives the adaptive cap — quick players get a slightly
// richer situation, strugglers stay at the elementary floor.
export function estimatePassRate(existing = []) {
  let used = 0;
  let target = 0;
  for (const row of existing) {
    used += (row.used_word_ids ?? []).length;
    target += row.target_size ?? (row.target_word_ids ?? []).length;
  }
  if (target === 0) return 0;
  return Math.min(1, used / target);
}

// Orchestrates one chain step: plan, resolve seeds, fill with discovery,
// persist the generated scenario row (service role, per the economy contract).
// deps: { forest, discovery, store, words } — all injectable for tests.
export async function generateNextScenario({ userId, countryCode, langCode, deps }) {
  const { forest, discovery, store, words } = deps;

  const [forestProfile, staleWords, existing] = await Promise.all([
    forest.getForestProfile(userId),
    forest.getStaleWords(userId, { limit: 4 }),
    store.listGeneratedScenarios(userId, countryCode),
  ]);

  const plan = planNextScenario({ existing, forestProfile, staleWords });
  if (!plan) return null;

  const passRate = estimatePassRate(existing);
  const adaptiveCap = computeAdaptiveCap({
    essentialCount: ESSENTIAL_WORDS_BY_SUPERSET[plan.superset],
    passRate,
  });
  const startSize = initialTargetSize({ adaptiveCap, passRate });

  // Seeds are carryover + stale expressions; keep room for at least two new
  // words so every scenario still teaches something.
  const maxSeeds = Math.max(1, startSize - 2);
  const seedExpressions = [...plan.seed.carryover, ...plan.seed.stale].slice(0, maxSeeds);
  const seedRows = seedExpressions.length > 0
    ? await words.getWordsByExpressions(seedExpressions, langCode)
    : [];

  const newSlots = Math.max(0, startSize - seedRows.length);
  const topic = `${plan.situation.title} (${plan.superset})`;
  const discovered = newSlots > 0
    ? await discovery.getDiscoveryWords(userId, topic, langCode, newSlots)
    : [];

  const seen = new Set();
  const targetWords = [...seedRows, ...discovered].filter((w) => {
    if (!w || seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  }).slice(0, startSize);

  await store.insertGeneratedScenario(userId, {
    country_code: countryCode,
    scenario_id: plan.scenarioId,
    superset: plan.superset,
    position: plan.position,
    chain_complete: plan.chainComplete,
    seed_word_ids: seedRows.map((w) => w.id),
    target_word_ids: targetWords.map((w) => w.id),
    used_word_ids: [],
    target_size: startSize,
    adaptive_cap: adaptiveCap,
  });

  return {
    scenarioId: plan.scenarioId,
    situation: plan.situation,
    position: plan.position,
    chainComplete: plan.chainComplete,
    adaptiveCap,
    targetWords,
    usedWordIds: [],
    targetSize: startSize,
  };
}

// When the evaluator raised target_size past the stored word list (growth),
// fill the gap through discovery and persist, so /generate always serves the
// current grown set. No-op when the set already matches its size.
export async function ensureTargetWords({ userId, langCode, row, deps }) {
  const { discovery, store, words } = deps;
  const targetIds = row.target_word_ids ?? [];
  const targetSize = row.target_size ?? targetIds.length;

  const current = targetIds.length > 0 ? await words.getWordsByIds(targetIds) : [];
  if (current.length >= targetSize) return current;

  // Ask for a full set's worth so overlaps with already-targeted words still
  // leave enough fresh candidates.
  const topic = `${row.scenario_id} (${row.superset})`;
  const extra = await discovery.getDiscoveryWords(userId, topic, langCode, targetSize);
  const have = new Set(current.map((w) => w.id));
  const added = extra.filter((w) => !have.has(w.id)).slice(0, targetSize - current.length);
  const grown = [...current, ...added];

  if (added.length > 0) {
    await store.updateGeneratedScenarioProgress(userId, row.country_code, row.scenario_id, {
      target_word_ids: grown.map((w) => w.id),
    });
  }
  return grown;
}

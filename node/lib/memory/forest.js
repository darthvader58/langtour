import Supermemory from 'supermemory';
import { supermemoryTools } from '@supermemory/ai-sdk';
import { SUPERMEMORY_API_KEY } from '../config.js';

// Per-user word-forest memory: Supermemory is the source of truth for learning
// state, Postgres (learning_user_word_forest) mirrors what the profile/graph
// view needs. Contract: docs/contracts/supermemory-forest.md.
//
// Invariants enforced here:
// - Every Supermemory call is scoped by containerTag = `user_<uuid>`, derived
//   from the userId argument at the call site. There is no unscoped code path.
// - The Postgres mirror write never depends on the Supermemory call: writes to
//   Supermemory are attempted, logged on failure, and never thrown. Reads
//   degrade to mirror-only data so the graph endpoint never blocks on
//   Supermemory.

// Words untouched for this long (and absent from the current learning cycle)
// count as stale and become resurfacing candidates.
const STALE_AFTER_DAYS = 7;
const MAX_SMALLINT = 32767;

function containerTagFor(userId) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new TypeError('userId is required');
  }
  return `user_${userId}`;
}

function requireFields(payload, fields, context) {
  for (const field of fields) {
    if (payload?.[field] === undefined || payload?.[field] === null || payload?.[field] === '') {
      throw new TypeError(`${context}: missing required field "${field}"`);
    }
  }
}

// --- dependency seam -------------------------------------------------------
// Real deps talk to Supermemory and Supabase; tests replace the whole object.
// The DB module is imported lazily because db.js requires Supabase env at
// import time, and pure consumers of this module (and its tests) must not.

let memoryClient = null;
function realClient() {
  if (!memoryClient) {
    memoryClient = new Supermemory({ apiKey: SUPERMEMORY_API_KEY });
  }
  return memoryClient;
}

async function realDb() {
  const { db } = await import('../db/db.js');
  return db;
}

const defaultDeps = {
  getClient: realClient,
  supermemoryTools,
  async upsertForestRow(row) {
    const db = await realDb();
    const result = await db
      .from('learning_user_word_forest')
      .upsert(row, { onConflict: 'user_id,word_id' });
    if (result.error) throw new Error(`Upsert forest row: ${result.error.message}`);
  },
  async getForestTier(userId, wordId) {
    const db = await realDb();
    const result = await db
      .from('learning_user_word_forest')
      .select('mastery_tier')
      .eq('user_id', userId)
      .eq('word_id', wordId)
      .maybeSingle();
    if (result.error) throw new Error(`Load forest tier: ${result.error.message}`);
    return result.data?.mastery_tier ?? null;
  },
  async listForestRows(userId) {
    const db = await realDb();
    const result = await db
      .from('learning_user_word_forest')
      .select('word_id,superset,mastery_tier,last_used_at,learning_words(expression,language)')
      .eq('user_id', userId);
    if (result.error) throw new Error(`Load forest rows: ${result.error.message}`);
    return (result.data ?? []).map((row) => ({
      wordId: row.word_id,
      superset: row.superset,
      masteryTier: row.mastery_tier,
      lastUsed: row.last_used_at,
      expression: row.learning_words?.expression ?? null,
      language: row.learning_words?.language ?? null,
    }));
  },
};

let deps = defaultDeps;

// Test-only seam (node --test stubs Supermemory + DB through this). Not part
// of the forest contract; production code must never call it.
export function __setForestDepsForTests(overrides) {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps;
}

function logMemoryFailure(operation, userId, error) {
  // Graceful degradation is contractual: never let a Supermemory outage break
  // gameplay or the graph endpoint. Log enough to reconcile later.
  console.error(`[forest] supermemory ${operation} failed for ${containerTagFor(userId)}: ${error?.message ?? error}`);
}

async function addMemorySafe(userId, content, metadata) {
  try {
    await deps.getClient().add({
      content,
      containerTag: containerTagFor(userId),
      metadata,
    });
  } catch (error) {
    logMemoryFailure('add', userId, error);
  }
}

async function profileSafe(userId) {
  try {
    return await deps.getClient().profile({ containerTag: containerTagFor(userId) });
  } catch (error) {
    logMemoryFailure('profile', userId, error);
    return { profile: { static: [], dynamic: [] } };
  }
}

// --- contract surface ------------------------------------------------------

export async function recordMasteryEvent(userId, event) {
  const tag = containerTagFor(userId); // validate before any write
  requireFields(event, ['wordId', 'expression', 'language', 'superset', 'scenarioId', 'rating'], 'recordMasteryEvent');
  const { wordId, expression, language, superset, scenarioId, rating } = event;

  // Mirror write first — it must succeed (or throw) regardless of Supermemory.
  // Tier moves one step per evaluator-confirmed event: up on pass (FSRS
  // rating >= 3), down (floor 0) on lapse.
  const currentTier = (await deps.getForestTier(userId, wordId)) ?? 0;
  const nextTier = rating >= 3 ? Math.min(currentTier + 1, MAX_SMALLINT) : Math.max(currentTier - 1, 0);
  const now = new Date().toISOString();
  await deps.upsertForestRow({
    user_id: userId,
    word_id: wordId,
    superset,
    mastery_tier: nextTier,
    last_used_at: now,
    updated_at: now,
  });

  await addMemorySafe(
    userId,
    `Word mastery event: used "${expression}" (${language}) in scenario ${scenarioId}, under the "${superset}" tree. FSRS rating ${rating} (${rating >= 3 ? 'pass' : 'lapse'}), mastery tier now ${nextTier}.`,
    { type: 'mastery_event', wordId, language, superset, scenarioId, rating, containerScope: tag },
  );
}

export async function recordSituationClear(userId, event) {
  const tag = containerTagFor(userId);
  requireFields(event, ['scenarioId', 'superset', 'countryCode'], 'recordSituationClear');
  const { scenarioId, superset, countryCode } = event;

  // Scenario completion truth already lives in Postgres via
  // record_scenario_completion; this memory only enriches the forest, so a
  // Supermemory failure degrades to a log line.
  await addMemorySafe(
    userId,
    `Situation cleared: scenario ${scenarioId} in ${countryCode}, under the "${superset}" tree.`,
    { type: 'situation_clear', scenarioId, superset, countryCode, containerScope: tag },
  );
}

export async function getForestProfile(userId) {
  containerTagFor(userId);
  // Mirror and profile in parallel; the mirror never waits on Supermemory.
  const [rows, response] = await Promise.all([
    deps.listForestRows(userId),
    profileSafe(userId),
  ]);

  const trees = {};
  for (const row of rows) {
    if (!row.expression) continue;
    (trees[row.superset] ??= []).push(row.expression);
  }

  return {
    mastered: response?.profile?.static ?? [],
    currentCycle: response?.profile?.dynamic ?? [],
    trees,
  };
}

export async function getStaleWords(userId, { limit = 10 } = {}) {
  containerTagFor(userId);
  const [rows, response] = await Promise.all([
    deps.listForestRows(userId),
    profileSafe(userId),
  ]);
  const dynamic = response?.profile?.dynamic ?? [];
  const cutoff = Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;

  // Stale = not part of the current learning cycle (absent from
  // profile().dynamic) AND not exercised recently per the mirror. Rows with a
  // null last_used_at were planted but never used — the stalest of all.
  return rows
    .filter((row) => {
      if (!row.expression) return false;
      const inCurrentCycle = dynamic.some((memory) => memory.includes(row.expression));
      if (inCurrentCycle) return false;
      return row.lastUsed === null || Date.parse(row.lastUsed) < cutoff;
    })
    .sort((a, b) => {
      const aTime = a.lastUsed === null ? -Infinity : Date.parse(a.lastUsed);
      const bTime = b.lastUsed === null ? -Infinity : Date.parse(b.lastUsed);
      return aTime - bTime;
    })
    .slice(0, limit)
    .map((row) => ({
      wordId: row.wordId,
      expression: row.expression,
      language: row.language,
      lastUsed: row.lastUsed,
    }));
}

// Scoped Supermemory tools (searchMemories/addMemory) for in-dialog use by the
// game-ai layer with `ai` + `@ai-sdk/google`. Scoping to the caller's user is
// mandatory — never hand these tools to a request for a different user.
export function getMemoryTools(userId) {
  return deps.supermemoryTools(SUPERMEMORY_API_KEY, {
    containerTags: [containerTagFor(userId)],
  });
}

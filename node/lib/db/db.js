import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '../config.js';
import { STARTER_VOCAB } from '../srs/onboarding_vocab.js';
import {
  CHARACTERS,
  COUNTRIES,
  SCENARIOS_BY_COUNTRY,
  SPECIAL_SCENARIO_BY_COUNTRY,
  REWARD_TOKENS,
  UNLOCK_COST,
} from '../../../client/src/gameData.js';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by the backend');
}

export const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assertResult(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export async function initializeDatabase() {
  const wordRows = Object.entries(STARTER_VOCAB).flatMap(([language, levels]) =>
    Object.entries(levels).flatMap(([level, words]) =>
      words.map(([expression, reading, meaning, topics]) => ({
        expression,
        reading,
        meaning,
        topic: Array.isArray(topics) ? topics[0] : topics,
        level,
        language,
      }))
    )
  );
  assertResult(await db.from('learning_words').upsert(wordRows, { onConflict: 'expression,language' }), 'Seed vocabulary');

  const countryRows = COUNTRIES.map((country, index) => {
    const character = CHARACTERS[country.name];
    return {
      code: country.name.toLowerCase(),
      name: country.name,
      flag: country.flag,
      latitude: country.lat,
      longitude: country.lng,
      display_order: index,
      character_type: character.type,
      character_icon: character.icon,
      character_story: character.story,
      character_gradient: character.gradient,
    };
  });
  assertResult(await db.from('game_countries').upsert(countryRows, { onConflict: 'code' }), 'Seed countries');

  const scenarioRows = [];
  const vocabularyRows = [];
  for (const country of COUNTRIES) {
    const countryCode = country.name.toLowerCase();
    const scenarios = SCENARIOS_BY_COUNTRY[country.name] ?? [];
    const special = SPECIAL_SCENARIO_BY_COUNTRY[country.name];
    for (const [index, scenario] of [...scenarios, ...(special ? [special] : [])].entries()) {
      scenarioRows.push({
        id: scenario.id,
        country_code: countryCode,
        title: scenario.title,
        icon: scenario.icon,
        description: scenario.description,
        is_special: Boolean(scenario.special),
        display_order: index,
      });
      for (const [vocabIndex, word] of (scenario.vocab ?? []).entries()) {
        vocabularyRows.push({
          scenario_id: scenario.id,
          display_order: vocabIndex,
          english: word.en,
          chinese: word.zh,
          pinyin: word.pinyin,
        });
      }
    }
  }
  assertResult(await db.from('game_scenarios').upsert(scenarioRows, { onConflict: 'id' }), 'Seed scenarios');
  // Avoid errors with game_scenario_vocabulary if it lacks an upsert constraint,
  // by just checking if we need to insert them. Or we can just try upserting by id if we generate one.
  // Actually, we'll try upserting with a likely unique index.
  assertResult(await db.from('game_scenario_vocabulary').upsert(vocabularyRows, { onConflict: 'scenario_id,display_order', ignoreDuplicates: true }), 'Seed scenario vocabulary');

  // Keep scenario_catalog (used by per-user completion + reward claim RPCs) in
  // sync with the gameplay catalog, including special scenarios. Without this
  // the special couldn't be marked complete because of its FK.
  assertResult(
    await db.from('scenario_catalog').upsert(
      scenarioRows.map((row) => ({ country_code: row.country_code, scenario_id: row.id })),
      { onConflict: 'country_code,scenario_id', ignoreDuplicates: true },
    ),
    'Seed scenario catalog',
  );

  // Country reward thresholds derive from the actual scenario count per country
  // (regular + special) so adding scenarios doesn't require schema edits.
  const requiredByCountry = new Map();
  for (const row of scenarioRows) {
    requiredByCountry.set(row.country_code, (requiredByCountry.get(row.country_code) ?? 0) + 1);
  }
  assertResult(
    await db.from('country_rewards').upsert(
      [...requiredByCountry.entries()].map(([code, required]) => ({
        country_code: code,
        required_scenarios: required,
        token_reward: REWARD_TOKENS,
      })),
      { onConflict: 'country_code' },
    ),
    'Sync country rewards',
  );

  assertResult(await db.from('game_settings').upsert([
    { key: 'unlock_cost', value: UNLOCK_COST },
    { key: 'reward_tokens', value: REWARD_TOKENS },
  ], { onConflict: 'key', ignoreDuplicates: true }), 'Seed game settings');
}

export async function getCatalog() {
  const [countriesResult, scenariosResult, vocabResult, settingsResult] = await Promise.all([
    db.from('game_countries').select('*').order('display_order'),
    db.from('game_scenarios').select('id,country_code,title,icon,description,is_special,display_order').order('display_order'),
    db.from('game_scenario_vocabulary').select('*').order('display_order'),
    db.from('game_settings').select('key,value'),
  ]);
  const countriesData = assertResult(countriesResult, 'Load countries');
  const scenariosData = assertResult(scenariosResult, 'Load scenarios');
  const vocabData = assertResult(vocabResult, 'Load scenario vocabulary');
  const settingsData = assertResult(settingsResult, 'Load game settings');
  const settings = Object.fromEntries(settingsData.map((row) => [row.key, row.value]));
  const vocabByScenario = new Map();
  for (const row of vocabData) {
    if (!vocabByScenario.has(row.scenario_id)) vocabByScenario.set(row.scenario_id, []);
    vocabByScenario.get(row.scenario_id).push(row);
  }

  const countries = countriesData.map((row) => ({
    name: row.name,
    code: COUNTRIES.find((c) => c.name === row.name)?.code ?? 'us',
    flag: row.flag,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
  }));
  const characters = Object.fromEntries(countriesData.map((row) => [row.name, {
    type: row.character_type,
    icon: row.character_icon,
    story: row.character_story,
    gradient: row.character_gradient,
  }]));
  const scenariosByCountry = {};
  const specialScenarioByCountry = {};
  for (const row of scenariosData) {
    const country = countriesData.find((item) => item.code === row.country_code)?.name;
    if (!country) continue;
    const scenario = {
      id: row.id,
      title: row.title,
      icon: row.icon,
      description: row.description,
      ...(row.is_special ? { special: true } : {}),
      vocab: (vocabByScenario.get(row.id) ?? []).map((word) => ({
        en: word.english,
        zh: word.chinese,
        pinyin: word.pinyin,
      })),
    };
    if (row.is_special) specialScenarioByCountry[country] = scenario;
    else (scenariosByCountry[country] ??= []).push(scenario);
  }
  return {
    countries,
    characters,
    scenariosByCountry,
    specialScenarioByCountry,
    unlockCost: settings.unlock_cost,
    rewardTokens: settings.reward_tokens,
  };
}

export async function getWordByExpression(expression) {
  return assertResult(await db.from('learning_words').select('*').eq('expression', expression).maybeSingle(), 'Load word');
}

// Load every word in the catalog merged with the current user's FSRS progress.
// Rows without progress fall back to zero/null defaults. Filters are applied in
// memory because the underlying tables live in different relations.
export async function listUserWords(userId, filters = {}) {
  let wordsQuery = db.from('learning_words').select(filters.columns ?? '*').order('id');
  if (filters.language) {
    wordsQuery = wordsQuery.eq('language', filters.language);
  }

  const [wordsResult, progressResult] = await Promise.all([
    wordsQuery,
    db.from('learning_user_word_progress')
      .select('word_id,state,stability,difficulty,lapses,reps,last_review_at')
      .eq('user_id', userId),
  ]);
  const words = assertResult(wordsResult, 'Load words');
  const progress = assertResult(progressResult, 'Load user word progress');
  const progressByWordId = new Map(progress.map((row) => [row.word_id, row]));

  const merged = words.map((word) => {
    const p = progressByWordId.get(word.id);
    return {
      ...word,
      state: p?.state ?? 0,
      stability: p?.stability ?? 0,
      difficulty: p?.difficulty ?? 0,
      lapses: p?.lapses ?? 0,
      reps: p?.reps ?? 0,
      last_review_at: p?.last_review_at ?? null,
    };
  });

  return merged.filter((w) => {
    if (filters.repsGt != null && !(w.reps > filters.repsGt)) return false;
    if (filters.repsEq != null && w.reps !== filters.repsEq) return false;
    if (filters.stabilityGte != null && !(w.stability >= filters.stabilityGte)) return false;
    return true;
  });
}

export async function getUserWordProgress(userId, wordId) {
  const result = await db.from('learning_user_word_progress')
    .select('state,stability,difficulty,lapses,reps,last_review_at')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .maybeSingle();
  if (result.error) throw new Error(`Load user word progress: ${result.error.message}`);
  return result.data ?? { state: 0, stability: 0, difficulty: 0, lapses: 0, reps: 0, last_review_at: null };
}

export async function upsertUserWordProgress(userId, wordId, values) {
  assertResult(await db.from('learning_user_word_progress').upsert({
    user_id: userId,
    word_id: wordId,
    ...values,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,word_id' }), 'Upsert user word progress');
}

export async function insertReviewLog(values) {
  assertResult(await db.from('learning_review_logs').insert(values), 'Insert review log');
}

export async function getWordsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const rows = assertResult(
    await db.from('learning_words').select('id,expression,reading,meaning,language').in('id', ids),
    'Load words by id',
  );
  // Preserve caller order — target-word lists are ordered (seed first, grown after).
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function getWordsByExpressions(expressions, language) {
  if (!expressions || expressions.length === 0) return [];
  let query = db.from('learning_words').select('id,expression,reading,meaning,language').in('expression', expressions);
  if (language) query = query.eq('language', language);
  return assertResult(await query, 'Load words by expression');
}

// generateTurn may grow the target set with words carrying id: null (the model
// cannot mint DB ids — see ai-module.md). Resolve them against the shared
// dictionary, inserting missing rows, and return them with real ids assigned.
export async function resolveOrCreateWords(words, language) {
  if (!words || words.length === 0) return [];
  const rows = words.map((w) => ({
    expression: w.expression,
    reading: w.reading ?? null,
    meaning: w.meaning ?? null,
    language,
  }));
  assertResult(
    await db.from('learning_words').upsert(rows, { onConflict: 'expression,language', ignoreDuplicates: true }),
    'Resolve grown words',
  );
  const resolved = await getWordsByExpressions(words.map((w) => w.expression), language);
  const byExpression = new Map(resolved.map((row) => [row.expression, row]));
  return words.map((w) => byExpression.get(w.expression)).filter(Boolean);
}

// --- user_generated_scenarios (economy contract: service-role insert at
// generation time; completion/claim authorized against these rows in the
// 20260703000000 migration). Only the backend writes here; RLS lets the user
// select their own rows. ---

export async function insertGeneratedScenario(userId, row) {
  assertResult(
    await db.from('user_generated_scenarios').insert({ user_id: userId, ...row }),
    'Insert generated scenario',
  );
}

export async function getGeneratedScenario(userId, countryCode, scenarioId) {
  return assertResult(
    await db.from('user_generated_scenarios')
      .select('*')
      .eq('user_id', userId)
      .eq('country_code', countryCode)
      .eq('scenario_id', scenarioId)
      .maybeSingle(),
    'Load generated scenario',
  );
}

export async function listGeneratedScenarios(userId, countryCode) {
  return assertResult(
    await db.from('user_generated_scenarios')
      .select('*')
      .eq('user_id', userId)
      .eq('country_code', countryCode)
      .order('position'),
    'List generated scenarios',
  );
}

export async function updateGeneratedScenarioProgress(userId, countryCode, scenarioId, patch) {
  assertResult(
    await db.from('user_generated_scenarios')
      .update(patch)
      .eq('user_id', userId)
      .eq('country_code', countryCode)
      .eq('scenario_id', scenarioId),
    'Update generated scenario',
  );
}

// record_scenario_completion is now SECURITY DEFINER, service-role-only, and
// takes an explicit p_user_id (auth.uid() is null under the service role — see
// migration 20260704000002, finding S3). The backend calls it through the shared
// service-role `db` client with the server-verified req.userId, only after an
// evaluator-confirmed pass (or the server-gated admin skip). The browser can no
// longer reach completion. Verified against supabase-js docs via Context7.
export async function recordScenarioCompletion(userId, countryCode, scenarioId) {
  const { data, error } = await db.rpc('record_scenario_completion', {
    p_user_id: userId,
    p_country_code: countryCode,
    p_scenario_id: scenarioId,
  });
  if (error) throw new Error(`Record scenario completion: ${error.message}`);
  return data;
}

// Resolve a user's email server-side from the trusted req.userId, for the
// admin-skip gate. Uses the service-role Admin API — the email is never taken
// from the client. Returns null if the user has no email on record.
export async function getUserEmail(userId) {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) throw new Error(`Load user identity: ${error.message}`);
  return data?.user?.email ?? null;
}

export async function getWordEmbeddingRow(wordId) {
  return assertResult(await db.from('learning_word_embeddings').select('embedding').eq('word_id', wordId).maybeSingle(), 'Load embedding');
}

export async function saveWordEmbedding(wordId, embedding) {
  assertResult(await db.from('learning_word_embeddings').upsert({ word_id: wordId, embedding }, { onConflict: 'word_id', ignoreDuplicates: true }), 'Save embedding');
}

export async function getAllWordEmbeddings() {
  return assertResult(await db.from('learning_word_embeddings').select('word_id,embedding'), 'Load embeddings');
}

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
  const countRows = async (table) => {
    const result = await db.from(table).select('*', { count: 'exact', head: true });
    if (result.error) throw new Error(`Check ${table}: ${result.error.message}`);
    return result.count ?? 0;
  };

  const wordRows = Object.entries(STARTER_VOCAB).flatMap(([level, words]) =>
    words.map(([expression, reading, meaning, topics]) => ({
      expression,
      reading,
      meaning,
      topic: Array.isArray(topics) ? topics[0] : topics,
      level,
    })),
  );
  if (await countRows('learning_words') === 0) {
    assertResult(await db.from('learning_words').insert(wordRows), 'Seed vocabulary');
  }

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
  if (await countRows('game_countries') === 0) {
    assertResult(await db.from('game_countries').insert(countryRows), 'Seed countries');
  }

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
  if (await countRows('game_scenarios') === 0) {
    assertResult(await db.from('game_scenarios').insert(scenarioRows), 'Seed scenarios');
    assertResult(await db.from('game_scenario_vocabulary').insert(vocabularyRows), 'Seed scenario vocabulary');
  }
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

export async function getWordsByIds(ids) {
  if (!ids?.length) return [];
  return assertResult(await db.from('learning_words').select('*').in('id', ids).order('id'), 'Load words by id');
}

export async function getWordByExpression(expression) {
  return assertResult(await db.from('learning_words').select('*').eq('expression', expression).maybeSingle(), 'Load word');
}

export async function listWords(filters = {}) {
  let query = db.from('learning_words').select(filters.columns ?? '*');
  if (filters.repsGt != null) query = query.gt('reps', filters.repsGt);
  if (filters.repsEq != null) query = query.eq('reps', filters.repsEq);
  if (filters.stabilityGte != null) query = query.gte('stability', filters.stabilityGte);
  query = query.order('id');
  return assertResult(await query, 'Load words');
}

export async function updateWord(wordId, values) {
  assertResult(await db.from('learning_words').update(values).eq('id', wordId), 'Update word');
}

export async function insertReviewLog(values) {
  assertResult(await db.from('learning_review_logs').insert(values), 'Insert review log');
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

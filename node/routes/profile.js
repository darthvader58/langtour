import { requireUser } from '../lib/auth.js';
import { db } from '../lib/db/db.js';
import { assertTimeZone, buildProgressMetrics } from '../lib/profile/metrics.js';
import { shapeProfileHistory } from '../lib/profile/history.js';
import {
  buildWordGraph,
  filterWordsForScenario,
  languageForCountry,
} from '../lib/profile/wordGraph.js';

const COUNTRY_CANONICAL = Object.freeze({
  china: 'china', cn: 'china',
  india: 'india', in: 'india',
  france: 'france', fr: 'france',
  mexico: 'mexico', mx: 'mexico',
  egypt: 'egypt', eg: 'egypt',
  brazil: 'brazil', br: 'brazil',
});

function resultData(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data ?? [];
}

async function readAll(buildQuery, context, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = resultData(await buildQuery().range(from, from + pageSize - 1), context);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function invalidRequest(res, message) {
  res.status(400).json({ error: message });
}

async function loadUserProgress(userId) {
  return readAll(
    () => db.from('learning_user_word_progress')
      .select('word_id,state,stability,difficulty,lapses,reps,last_review_at')
      .eq('user_id', userId)
      .order('word_id'),
    'Load profile word progress',
  );
}

async function loadWords() {
  return readAll(
    () => db.from('learning_words').select('id,expression,reading,meaning,language').order('id'),
    'Load profile words',
  );
}

async function loadReviews(userId) {
  return readAll(
    () => db.from('learning_review_logs')
      .select('word_id,rating,state,review_datetime')
      .eq('user_id', userId)
      .order('review_datetime', { ascending: false }),
    'Load profile reviews',
  );
}

async function loadProfileHistory(userId) {
  const [
    authResult,
    profileResult,
    levelsResult,
    ranksResult,
    unlocksResult,
    countriesResult,
    completionsResult,
    scenariosResult,
    claimsResult,
  ] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from('profiles').select('user_id,tokens,experience_points,level_id,rank_id,created_at,updated_at').eq('user_id', userId).maybeSingle(),
    db.from('levels').select('id,code,name,minimum_xp').eq('is_active', true).order('display_order'),
    db.from('ranks').select('id,code,name,minimum_xp').eq('is_active', true).order('display_order'),
    db.from('country_unlocks').select('country_code,unlocked_at').eq('user_id', userId).order('unlocked_at'),
    db.from('game_countries').select('code,name,flag,character_type,character_icon,character_story,character_gradient').order('display_order'),
    db.from('scenario_completions').select('country_code,scenario_id,completed_at').eq('user_id', userId).order('completed_at', { ascending: false }),
    db.from('game_scenarios').select('id,country_code,title,icon,description,is_special,display_order').order('display_order'),
    db.from('country_reward_claims').select('country_code,claimed_at').eq('user_id', userId).order('claimed_at', { ascending: false }),
  ]);
  if (authResult.error) throw new Error(`Load profile identity: ${authResult.error.message}`);
  if (profileResult.error) throw new Error(`Load profile: ${profileResult.error.message}`);
  return shapeProfileHistory({
    authUser: authResult.data.user,
    profile: profileResult.data,
    levels: resultData(levelsResult, 'Load levels'),
    ranks: resultData(ranksResult, 'Load ranks'),
    unlocks: resultData(unlocksResult, 'Load country unlocks'),
    countryCatalog: resultData(countriesResult, 'Load country catalog'),
    completions: resultData(completionsResult, 'Load scenario completions'),
    scenarioCatalog: resultData(scenariosResult, 'Load scenario catalog'),
    rewardClaims: resultData(claimsResult, 'Load country reward claims'),
  });
}

async function progressResponse(userId, timeZone) {
  const [progress, words, reviews, history] = await Promise.all([
    loadUserProgress(userId),
    loadWords(),
    loadReviews(userId),
    loadProfileHistory(userId),
  ]);
  const wordById = new Map(words.map((word) => [Number(word.id), word]));
  const merged = progress.map((row) => ({ ...wordById.get(Number(row.word_id)), ...row }))
    .filter((word) => word.id != null);
  const reviewsWithLanguage = reviews.map((review) => ({
    ...review,
    language: wordById.get(Number(review.word_id))?.language ?? null,
  }));
  const metrics = buildProgressMetrics(merged, reviewsWithLanguage, { timeZone });
  const recentReviews = reviews.slice(0, 20).map((review) => {
    const word = wordById.get(Number(review.word_id));
    return {
      wordId: Number(review.word_id),
      expression: word?.expression ?? '',
      reading: word?.reading ?? '',
      meaning: word?.meaning ?? '',
      language: word?.language ?? null,
      rating: Number(review.rating),
      reviewedAt: review.review_datetime,
    };
  });
  return { ...history, ...metrics, recentReviews };
}

async function graphResponse(userId, rawCountryCode, scenarioId) {
  const key = String(rawCountryCode).trim().toLowerCase();
  const countryCode = COUNTRY_CANONICAL[key];
  const language = languageForCountry(key);
  if (!countryCode || !language) throw new TypeError('Unknown countryCode');

  const [progress, words, embeddings] = await Promise.all([
    loadUserProgress(userId),
    loadWords(),
    readAll(
      () => db.from('learning_word_embeddings').select('word_id,embedding').order('word_id'),
      'Load profile word embeddings',
    ),
  ]);
  const progressById = new Map(progress.filter((row) => Number(row.reps) > 0).map((row) => [Number(row.word_id), row]));
  let encountered = words
    .filter((word) => word.language === language && progressById.has(Number(word.id)))
    .map((word) => ({ ...word, ...progressById.get(Number(word.id)) }));

  if (scenarioId) {
    const scenarioResult = await db.from('game_scenarios')
      .select('id,country_code')
      .eq('id', scenarioId)
      .eq('country_code', countryCode)
      .maybeSingle();
    if (scenarioResult.error) throw new Error(`Load graph scenario: ${scenarioResult.error.message}`);
    if (!scenarioResult.data) throw new TypeError('Unknown scenarioId for country');
    const vocabulary = resultData(await db.from('game_scenario_vocabulary')
      .select('english,chinese,pinyin')
      .eq('scenario_id', scenarioId)
      .order('display_order'), 'Load graph scenario vocabulary');
    encountered = filterWordsForScenario(encountered, vocabulary);
  }

  return {
    countryCode,
    language,
    scenarioId: scenarioId || null,
    ...buildWordGraph(encountered, embeddings),
  };
}

export function mountProfileRoutes(app) {
  app.get('/api/profile/progress', requireUser, async (req, res) => {
    try {
      const timeZone = assertTimeZone(String(req.query.timezone || 'UTC'));
      res.json(await progressResponse(req.userId, timeZone));
    } catch (error) {
      if (error instanceof TypeError) return invalidRequest(res, error.message);
      console.error('[Profile progress]', error);
      res.status(500).json({ error: 'Unable to load profile progress' });
    }
  });

  app.get('/api/profile/word-graph', requireUser, async (req, res) => {
    try {
      if (!req.query.countryCode) return invalidRequest(res, 'countryCode is required');
      res.json(await graphResponse(req.userId, req.query.countryCode, req.query.scenarioId));
    } catch (error) {
      if (error instanceof TypeError) return invalidRequest(res, error.message);
      console.error('[Profile word graph]', error);
      res.status(500).json({ error: 'Unable to load word graph' });
    }
  });
}

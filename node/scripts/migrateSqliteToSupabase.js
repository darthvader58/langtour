import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, initializeDatabase } from '../lib/db/db.js';

const sqlitePath = resolve(process.cwd(), '..', 'db', 'langtour.db');
if (!existsSync(sqlitePath)) {
  throw new Error(`SQLite database not found at ${sqlitePath}`);
}

await initializeDatabase();
const sqlite = new Database(sqlitePath, { readonly: true });

const localWords = sqlite.prepare('select * from words').all();
const remoteWordsResult = await db.from('learning_words').select('id,expression');
if (remoteWordsResult.error) throw remoteWordsResult.error;
const remoteIdByExpression = new Map(remoteWordsResult.data.map((word) => [word.expression, word.id]));
const expressionByLocalId = new Map(localWords.map((word) => [word.id, word.expression]));

for (const word of localWords) {
  const remoteId = remoteIdByExpression.get(word.expression);
  if (!remoteId) throw new Error(`Remote vocabulary is missing ${word.expression}`);
  const { error } = await db.from('learning_words').update({
    reading: word.reading,
    meaning: word.meaning,
    topic: word.topic,
    level: word.level,
    state: word.state,
    stability: word.stability,
    difficulty: word.difficulty,
    lapses: word.lapses,
    reps: word.reps,
    last_review_at: word.last_review_at,
    created_at: word.created_at,
  }).eq('id', remoteId);
  if (error) throw error;
}

await db.from('learning_review_logs').delete().gte('id', 0);
const reviewLogs = sqlite.prepare('select * from review_logs order by id').all().map((log) => ({
  word_id: remoteIdByExpression.get(expressionByLocalId.get(log.word_id)),
  rating: log.rating,
  state: log.state,
  elapsed_ms: log.elapsed_ms,
  review_datetime: log.review_datetime,
}));
if (reviewLogs.length) {
  const { error } = await db.from('learning_review_logs').insert(reviewLogs);
  if (error) throw error;
}

await db.from('learning_word_embeddings').delete().gte('word_id', 0);
const embeddings = sqlite.prepare('select * from word_embeddings').all().map((row) => ({
  word_id: remoteIdByExpression.get(expressionByLocalId.get(row.word_id)),
  embedding: JSON.parse(row.embedding_json),
}));
if (embeddings.length) {
  const { error } = await db.from('learning_word_embeddings').insert(embeddings);
  if (error) throw error;
}

for (const scenario of sqlite.prepare('select * from scenarios').all()) {
  const { error } = await db.from('game_scenarios').update({
    status: scenario.status,
    completed_at: scenario.completed_at,
  }).eq('id', scenario.id);
  if (error) throw error;
}

const profile = sqlite.prepare('select * from user_profile where id = 1').get();
if (profile) {
  const { error } = await db.from('backend_user_state').upsert({
    id: 1,
    tokens: profile.tokens,
    unlocked_countries: JSON.parse(profile.unlocked_countries || '[]'),
  });
  if (error) throw error;
}

sqlite.close();
console.log(`Migrated ${localWords.length} words, ${reviewLogs.length} reviews, and ${embeddings.length} embeddings to Supabase.`);

import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';
import { STARTER_VOCAB } from '../srs/onboarding_vocab.js';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expression TEXT UNIQUE NOT NULL,
      reading TEXT NOT NULL,
      meaning TEXT NOT NULL,
      topic TEXT,
      level TEXT,
      
      -- FSRS and Memory State
      state INTEGER DEFAULT 0, -- 0: New, 1: Learning, 2: Review, 3: Relearning
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      last_review_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL,
      rating INTEGER NOT NULL, -- 1: Again, 2: Hard, 3: Good, 4: Easy
      state INTEGER NOT NULL,
      elapsed_ms INTEGER,
      review_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(word_id) REFERENCES words(id)
    );

    CREATE TABLE IF NOT EXISTS word_embeddings (
      word_id INTEGER PRIMARY KEY,
      embedding_json TEXT NOT NULL,
      FOREIGN KEY(word_id) REFERENCES words(id)
    );
    
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'locked', -- locked, unlocked, completed
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY,
      tokens INTEGER DEFAULT 100,
      unlocked_countries TEXT DEFAULT '[]'
    );
  `);

  const countStmt = db.prepare('SELECT COUNT(*) as count FROM words');
  const { count } = countStmt.get();

  if (count === 0) {
    const insertWord = db.prepare(`
      INSERT INTO words (expression, reading, meaning, topic, level)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const seedTx = db.transaction(() => {
      for (const [level, words] of Object.entries(STARTER_VOCAB)) {
        if (!Array.isArray(words)) continue;
        for (const [expression, reading, meaning, topics] of words) {
          const topic = Array.isArray(topics) ? topics[0] : topics;
          insertWord.run(expression, reading, meaning, topic, level);
        }
      }
      
      const insertScenario = db.prepare(`INSERT INTO scenarios (id, status) VALUES (?, ?)`);
      insertScenario.run('street-market', 'unlocked');
      insertScenario.run('train-station', 'locked');
      insertScenario.run('restaurant', 'locked');

      const insertProfile = db.prepare(`INSERT OR IGNORE INTO user_profile (id, tokens, unlocked_countries) VALUES (?, ?, ?)`);
      insertProfile.run(1, 100, '[]');
    });
    
    seedTx();
    console.log('Seeded database with starter vocabulary and scenarios.');
  }
}

initDb();

export function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS user_profile;
    DROP TABLE IF EXISTS review_logs;
    DROP TABLE IF EXISTS word_embeddings;
    DROP TABLE IF EXISTS scenarios;
    DROP TABLE IF EXISTS words;
  `);
  initDb();
}

export function getWordsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM words WHERE id IN (${placeholders})`).all(...ids);
}

export function getScenario(id) {
  return db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id);
}

export { db };

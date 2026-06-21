import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', '..', 'db', 'langtour.db');

let _db = null;
function getDb() {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expression TEXT NOT NULL,
      reading TEXT NOT NULL DEFAULT '',
      meaning TEXT NOT NULL DEFAULT '',
      notes TEXT DEFAULT '',
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      state INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      due_at TEXT,
      embedding BLOB,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      lesson_id INTEGER,
      review_datetime TEXT DEFAULT (datetime('now')),
      fsrs_state_after_json TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS lesson_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity TEXT,
      word_ids_json TEXT DEFAULT '[]',
      reasoning TEXT DEFAULT '',
      config_json TEXT,
      progress_json TEXT,
      status TEXT DEFAULT 'pending',
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS songs (
      spotify_id TEXT PRIMARY KEY,
      lyrics_track_id TEXT,
      name TEXT DEFAULT '',
      artist TEXT DEFAULT '',
      album TEXT DEFAULT '',
      hearted INTEGER DEFAULT 0,
      heart_at TEXT,
      rating INTEGER DEFAULT 0,
      play_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_review_logs_word_id ON review_logs(word_id);
    CREATE INDEX IF NOT EXISTS idx_review_logs_datetime ON review_logs(review_datetime);
  `);
  return _db;
}

export const db = new Proxy({}, {
  get(_, prop) { return getDb()[prop]; }
});

const FSRS_STATE_NAMES = { 0: 'new', 1: 'learning', 2: 'review', 3: 'relearning' };

export function deckStats() {
  const db = getDb();
  const now = new Date().toISOString();
  const total = db.prepare('SELECT COUNT(*) as c FROM words').get().c;
  const due = db.prepare('SELECT COUNT(*) as c FROM words WHERE due_at <= ?').get(now).c;
  const byState = db.prepare('SELECT state, COUNT(*) as c FROM words GROUP BY state').all();
  const stateCounts = { new: 0, learning: 0, review: 0, relearning: 0 };
  for (const r of byState) { const name = FSRS_STATE_NAMES[r.state]; if (name) stateCounts[name] = r.c; }
  const leeches = db.prepare('SELECT COUNT(*) as c FROM words WHERE lapses >= 3').get().c;
  const totalReviews = db.prepare('SELECT COUNT(*) as c FROM review_logs').get().c;
  const ratingDist = db.prepare('SELECT rating, COUNT(*) as c FROM review_logs GROUP BY rating ORDER BY rating').all();
  const avgLapses = db.prepare('SELECT AVG(lapses) as a FROM words').get().a || 0;
  const upcoming = db.prepare(`
    SELECT DATE(due_at) as day, COUNT(*) as c
    FROM words
    WHERE due_at > ? AND due_at <= DATETIME(?, '+7 days')
    GROUP BY day ORDER BY day
  `).all(now, now);
  return {
    total,
    due_now: due,
    by_state: stateCounts,
    leeches,
    total_reviews: totalReviews,
    rating_distribution: ratingDist.reduce((acc, r) => (acc[r.rating] = r.c, acc), {}),
    avg_lapses: Number(avgLapses.toFixed(2)),
    upcoming_week: upcoming,
  };
}

export function grammarStats() {
  return {
    total_points: 0,
    studied: 0,
    due_now: 0,
    by_state: { new: 0, learning: 0, review: 0, relearning: 0 },
    total_encounters: 0,
    correct_uses: 0,
    error_uses: 0,
    accuracy: null,
    upcoming_week: [],
  };
}

export function getDayStartHour() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key='day_start_hour'").get();
  return row ? parseInt(row.value, 10) || 0 : 0;
}

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'db', 'langtour.db');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
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

const vocab = {
  beginner: [
    ['你好', 'nǐ hǎo', 'hello'],
    ['谢谢', 'xièxie', 'thank you'],
    ['再见', 'zàijiàn', 'goodbye'],
    ['对不起', 'duìbuqǐ', "I'm sorry"],
    ['不客气', 'bú kèqi', "you're welcome"],
    ['我', 'wǒ', 'I / me'],
    ['你', 'nǐ', 'you'],
    ['他', 'tā', 'he / him'],
    ['她', 'tā', 'she / her'],
    ['朋友', 'péngyǒu', 'friend'],
    ['吃', 'chī', 'to eat'],
    ['喝', 'hē', 'to drink'],
    ['看', 'kàn', 'to look / watch'],
    ['听', 'tīng', 'to listen'],
    ['说', 'shuō', 'to speak'],
    ['去', 'qù', 'to go'],
    ['来', 'lái', 'to come'],
    ['水', 'shuǐ', 'water'],
    ['茶', 'chá', 'tea'],
    ['饭', 'fàn', 'rice / meal'],
    ['书', 'shū', 'book'],
    ['家', 'jiā', 'home / family'],
    ['学校', 'xuéxiào', 'school'],
    ['好', 'hǎo', 'good / well'],
    ['大', 'dà', 'big'],
    ['小', 'xiǎo', 'small'],
    ['今天', 'jīntiān', 'today'],
    ['明天', 'míngtiān', 'tomorrow'],
    ['一', 'yī', 'one'],
    ['二', 'èr', 'two'],
  ],
  intermediate: [
    ['因为', 'yīnwèi', 'because'],
    ['所以', 'suǒyǐ', 'therefore'],
    ['但是', 'dànshì', 'but / however'],
    ['如果', 'rúguǒ', 'if'],
    ['已经', 'yǐjīng', 'already'],
    ['可能', 'kěnéng', 'possibly / maybe'],
    ['决定', 'juédìng', 'to decide'],
    ['希望', 'xīwàng', 'to hope'],
    ['觉得', 'juéde', 'to feel / to think'],
    ['办公室', 'bàngōngshì', 'office'],
    ['会议', 'huìyì', 'meeting'],
    ['项目', 'xiàngmù', 'project'],
    ['同事', 'tóngshì', 'colleague'],
    ['火车', 'huǒchē', 'train'],
    ['飞机', 'fēijī', 'airplane'],
    ['酒店', 'jiǔdiàn', 'hotel'],
    ['护照', 'hùzhào', 'passport'],
    ['菜单', 'càidān', 'menu'],
    ['餐厅', 'cāntīng', 'restaurant'],
    ['味道', 'wèidào', 'flavor / taste'],
    ['辣', 'là', 'spicy'],
    ['电影', 'diànyǐng', 'movie'],
    ['歌曲', 'gēqǔ', 'song'],
    ['音乐', 'yīnyuè', 'music'],
    ['故事', 'gùshi', 'story'],
    ['有趣', 'yǒuqù', 'interesting'],
    ['重要', 'zhòngyào', 'important'],
    ['马上', 'mǎshàng', 'right away'],
  ],
  advanced: [
    ['尽管', 'jǐnguǎn', 'even though'],
    ['毕竟', 'bìjìng', 'after all'],
    ['差异', 'chāyì', 'difference'],
    ['本质', 'běnzhì', 'essence / nature'],
    ['现象', 'xiànxiàng', 'phenomenon'],
    ['趋势', 'qūshì', 'trend'],
    ['策略', 'cèlüè', 'strategy'],
    ['资源', 'zīyuán', 'resource'],
    ['谈判', 'tánpàn', 'negotiation'],
    ['投资', 'tóuzī', 'investment'],
    ['企业', 'qǐyè', 'enterprise'],
    ['行业', 'hángyè', 'industry'],
    ['市场', 'shìchǎng', 'market'],
    ['传统', 'chuántǒng', 'tradition'],
    ['文化', 'wénhuà', 'culture'],
    ['观点', 'guāndiǎn', 'point of view'],
    ['争论', 'zhēnglùn', 'debate'],
    ['批评', 'pīpíng', 'criticism'],
    ['赞美', 'zànměi', 'to praise'],
    ['启发', 'qǐfā', 'inspiration'],
    ['贡献', 'gòngxiàn', 'contribution'],
    ['经历', 'jīnglì', 'experience'],
    ['享受', 'xiǎngshòu', 'to enjoy'],
    ['挑战', 'tiǎozhàn', 'challenge'],
    ['机会', 'jīhuì', 'opportunity'],
    ['追求', 'zhuīqiú', 'to pursue'],
  ],
};

const insertWord = db.prepare(
  'INSERT INTO words (expression, reading, meaning, stability, difficulty, state, lapses, reps, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertReview = db.prepare(
  'INSERT INTO review_logs (word_id, rating, review_datetime, fsrs_state_after_json) VALUES (?, ?, ?, ?)'
);

const transaction = db.transaction(() => {
  const now = new Date();
  const wordIds = [];

  for (const [levelName, words] of Object.entries(vocab)) {
    const level = levelName === 'beginner' ? 1 : levelName === 'intermediate' ? 2 : 3;
    for (const [expression, reading, meaning] of words) {
      const state = level === 1 ? 2 : level === 2 ? 1 : 0;
      const stability = state === 2 ? 20 + Math.random() * 40 : state === 1 ? 3 + Math.random() * 7 : 0;
      const difficulty = 0.3 + Math.random() * 0.4;
      const lapses = Math.floor(Math.random() * 3);
      const reps = state === 2 ? 5 + Math.floor(Math.random() * 15) : state === 1 ? 2 + Math.floor(Math.random() * 4) : 0;

      const daysAgo = Math.floor(Math.random() * 90);
      const createdAt = new Date(now - daysAgo * 86400000).toISOString();
      let dueAt = null;
      if (state === 2) {
        dueAt = new Date(now - (Math.random() * 2 - 1) * 86400000).toISOString();
      } else if (state === 1) {
        dueAt = new Date(now + 86400000).toISOString();
      }

      const info = insertWord.run(expression, reading, meaning, stability, difficulty, state, lapses, reps, dueAt, createdAt);
      wordIds.push({ id: Number(info.lastInsertRowid), state, stability, difficulty });
    }
  }

  // Generate review history
  for (const { id, state, stability, difficulty } of wordIds) {
    if (state === 0) continue;
    const reviewCount = state === 2 ? 3 + Math.floor(Math.random() * 8) : 1 + Math.floor(Math.random() * 3);
    for (let r = 0; r < reviewCount; r++) {
      const daysAgo = (reviewCount - r) * (2 + Math.random() * 14);
      const reviewDate = new Date(now - daysAgo * 86400000).toISOString();
      const rating = Math.random() < 0.6 ? 3 : Math.random() < 0.3 ? 4 : Math.random() < 0.7 ? 2 : 1;
      const afterStability = Math.max(0.1, stability * (0.5 + Math.random()));
      insertReview.run(id, rating, reviewDate,
        JSON.stringify({ stability: afterStability, difficulty, state, last_review: reviewDate }));
    }
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('day_start_hour', '0')").run();
});

transaction();

const total = db.prepare('SELECT COUNT(*) as c FROM words').get().c;
const reviews = db.prepare('SELECT COUNT(*) as c FROM review_logs').get().c;
console.log(`Seeded ${total} words and ${reviews} review logs.`);
db.close();

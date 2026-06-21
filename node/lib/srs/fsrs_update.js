import fsrsJs from 'fsrs.js';

const { FSRS, Card, Rating } = fsrsJs;
const fsrs = new FSRS();

export function updateWordFSRS(db, wordId, ratingValue) {
  // ratingValue maps to fsrs.js Rating: 1: Again, 2: Hard, 3: Good, 4: Easy
  
  const row = db.prepare('SELECT * FROM words WHERE id = ?').get(wordId);
  if (!row) return null;

  const card = new Card();
  card.state = row.state;
  card.stability = row.stability;
  card.difficulty = row.difficulty;
  card.lapses = row.lapses;
  card.reps = row.reps;
  if (row.last_review_at) {
    card.last_review = new Date(row.last_review_at);
  }

  const now = new Date();
  const scheduling = fsrs.repeat(card, now);
  const scheduled = scheduling[ratingValue];
  if (!scheduled) throw new Error("Invalid FSRS rating");

  const newCard = scheduled.card;
  const log = scheduled.review_log;

  db.prepare(`
    UPDATE words 
    SET state = ?, stability = ?, difficulty = ?, lapses = ?, reps = ?, last_review_at = ?
    WHERE id = ?
  `).run(
    newCard.state, newCard.stability, newCard.difficulty, newCard.lapses, newCard.reps, now.toISOString(), wordId
  );

  db.prepare(`
    INSERT INTO review_logs (word_id, rating, state, review_datetime)
    VALUES (?, ?, ?, ?)
  `).run(
    wordId, ratingValue, log.state, now.toISOString()
  );

  return newCard;
}

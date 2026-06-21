import fsrsJs from 'fsrs.js';
import { getUserWordProgress, insertReviewLog, upsertUserWordProgress } from '../db/db.js';

const { FSRS, Card } = fsrsJs;
const fsrs = new FSRS();

export async function updateWordFSRS(userId, wordId, ratingValue) {
  const row = await getUserWordProgress(userId, wordId);

  const card = new Card();
  card.state = row.state;
  card.stability = row.stability;
  card.difficulty = row.difficulty;
  card.lapses = row.lapses;
  card.reps = row.reps;
  if (row.last_review_at) card.last_review = new Date(row.last_review_at);

  const now = new Date();
  const scheduled = fsrs.repeat(card, now)[ratingValue];
  if (!scheduled) throw new Error('Invalid FSRS rating');

  const newCard = scheduled.card;
  await upsertUserWordProgress(userId, wordId, {
    state: newCard.state,
    stability: newCard.stability,
    difficulty: newCard.difficulty,
    lapses: newCard.lapses,
    reps: newCard.reps,
    last_review_at: now.toISOString(),
  });
  await insertReviewLog({
    user_id: userId,
    word_id: wordId,
    rating: ratingValue,
    state: scheduled.review_log.state,
    review_datetime: now.toISOString(),
  });
  return newCard;
}

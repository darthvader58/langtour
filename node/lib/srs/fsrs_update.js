import fsrsJs from 'fsrs.js';
import { getWordsByIds, insertReviewLog, updateWord } from '../db/db.js';

const { FSRS, Card } = fsrsJs;
const fsrs = new FSRS();

export async function updateWordFSRS(wordId, ratingValue) {
  const [row] = await getWordsByIds([wordId]);
  if (!row) return null;

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
  await updateWord(wordId, {
    state: newCard.state,
    stability: newCard.stability,
    difficulty: newCard.difficulty,
    lapses: newCard.lapses,
    reps: newCard.reps,
    last_review_at: now.toISOString(),
  });
  await insertReviewLog({
    word_id: wordId,
    rating: ratingValue,
    state: scheduled.review_log.state,
    review_datetime: now.toISOString(),
  });
  return newCard;
}

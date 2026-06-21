import { retrievability } from '../srs/fsrs_metrics.js';

const DAY_MS = 86_400_000;

export function assertTimeZone(timeZone = 'UTC') {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new TypeError(`Invalid timezone: ${timeZone}`);
  }
}

export function localDateKey(value, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: assertTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDateKey(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function summarizeWords(words, now = Date.now()) {
  const encountered = words.filter((word) => Number(word.reps) > 0);
  let recallableRaw = 0;
  let mastered = 0;
  let due = 0;
  let learning = 0;

  for (const word of encountered) {
    const recall = retrievability({
      stability: Number(word.stability) || 0,
      last_review_at: word.last_review_at,
      now,
    });
    recallableRaw += recall;
    if (recall >= 0.9 && Number(word.stability) >= 7) mastered += 1;
    if (recall < 0.9) due += 1;
    if (Number(word.state) === 1 || Number(word.state) === 3) learning += 1;
  }

  return {
    encountered: encountered.length,
    mastered,
    due,
    learning,
    recallable: Math.round(recallableRaw),
  };
}

export function summarizeReviews(reviews, {
  now = Date.now(),
  timeZone = 'UTC',
  activityDays = 90,
  accuracyDays = 30,
} = {}) {
  assertTimeZone(timeZone);
  const today = localDateKey(now, timeZone);
  const activityStart = shiftDateKey(today, -(activityDays - 1));
  const recentCutoff = now - accuracyDays * DAY_MS;
  const byDate = new Map();
  let recentTotal = 0;
  let recentCorrect = 0;

  for (const review of reviews) {
    const timestamp = Date.parse(review.review_datetime);
    if (!Number.isFinite(timestamp)) continue;
    const key = localDateKey(timestamp, timeZone);
    const bucket = byDate.get(key) ?? { reviews: 0, correct: 0 };
    bucket.reviews += 1;
    if (Number(review.rating) >= 3) bucket.correct += 1;
    byDate.set(key, bucket);
    if (timestamp >= recentCutoff && timestamp <= now) {
      recentTotal += 1;
      if (Number(review.rating) >= 3) recentCorrect += 1;
    }
  }

  const activity = [];
  for (let offset = 0; offset < activityDays; offset += 1) {
    const date = shiftDateKey(activityStart, offset);
    const bucket = byDate.get(date) ?? { reviews: 0, correct: 0 };
    activity.push({ date, ...bucket });
  }

  const activeDates = [...byDate.entries()]
    .filter(([, bucket]) => bucket.reviews > 0)
    .map(([key]) => key)
    .sort();
  let bestStreak = 0;
  let run = 0;
  let previous = null;
  for (const key of activeDates) {
    run = previous && shiftDateKey(previous, 1) === key ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = key;
  }

  let currentStreak = 0;
  for (let key = today; (byDate.get(key)?.reviews ?? 0) > 0; key = shiftDateKey(key, -1)) {
    currentStreak += 1;
  }

  return {
    totalReviews: reviews.length,
    recentAccuracy: recentTotal ? Math.round((recentCorrect / recentTotal) * 100) : 0,
    currentStreak,
    bestStreak,
    activity,
  };
}

export function buildProgressMetrics(words, reviews, options = {}) {
  const now = options.now ?? Date.now();
  const wordSummary = summarizeWords(words, now);
  const reviewSummary = summarizeReviews(reviews, { ...options, now });
  const languages = [...new Set([
    ...words.map((word) => word.language),
    ...reviews.map((review) => review.language),
  ].filter(Boolean))]
    .sort()
    .map((language) => {
      const languageReviews = summarizeReviews(reviews.filter((review) => review.language === language), { ...options, now, activityDays: 1 });
      return {
        language,
        ...summarizeWords(words.filter((word) => word.language === language), now),
        totalReviews: languageReviews.totalReviews,
        recentAccuracy: languageReviews.recentAccuracy,
        currentStreak: languageReviews.currentStreak,
        bestStreak: languageReviews.bestStreak,
      };
    });
  return {
    summary: { ...wordSummary, ...Object.fromEntries(Object.entries(reviewSummary).filter(([key]) => key !== 'activity')) },
    languages,
    activity: reviewSummary.activity,
  };
}

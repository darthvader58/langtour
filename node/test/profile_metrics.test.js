import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTimeZone,
  buildProgressMetrics,
  localDateKey,
  summarizeReviews,
  summarizeWords,
} from '../lib/profile/metrics.js';

const NOW = Date.parse('2026-06-21T12:00:00.000Z');

test('summarizeWords applies encountered, mastered, due and recallable definitions', () => {
  const words = [
    { reps: 0, stability: 20, last_review_at: '2026-06-21T12:00:00Z', state: 0 },
    { reps: 4, stability: 8, last_review_at: '2026-06-21T12:00:00Z', state: 2 },
    { reps: 2, stability: 1, last_review_at: '2026-06-01T12:00:00Z', state: 1 },
  ];
  assert.deepEqual(summarizeWords(words, NOW), {
    encountered: 2,
    mastered: 1,
    due: 1,
    learning: 1,
    recallable: 1,
  });
});

test('summarizeReviews creates timezone-aware activity, accuracy and streaks', () => {
  const reviews = [
    { rating: 4, review_datetime: '2026-06-21T08:00:00Z' },
    { rating: 3, review_datetime: '2026-06-20T08:00:00Z' },
    { rating: 1, review_datetime: '2026-06-19T08:00:00Z' },
    { rating: 4, review_datetime: '2026-06-17T08:00:00Z' },
    { rating: 4, review_datetime: '2026-06-16T08:00:00Z' },
  ];
  const result = summarizeReviews(reviews, { now: NOW, timeZone: 'UTC', activityDays: 7 });
  assert.equal(result.totalReviews, 5);
  assert.equal(result.recentAccuracy, 80);
  assert.equal(result.currentStreak, 3);
  assert.equal(result.bestStreak, 3);
  assert.equal(result.activity.length, 7);
  assert.deepEqual(result.activity.at(-1), { date: '2026-06-21', reviews: 1, correct: 1 });
});

test('localDateKey respects the requested timezone and invalid zones fail clearly', () => {
  assert.equal(localDateKey('2026-06-21T06:00:00Z', 'America/Los_Angeles'), '2026-06-20');
  assert.throws(() => assertTimeZone('Mars/Olympus'), /Invalid timezone/);
});

test('buildProgressMetrics groups language metrics without mixing words', () => {
  const words = [
    { language: 'zh', reps: 1, stability: 8, last_review_at: '2026-06-21T12:00:00Z', state: 2 },
    { language: 'fr', reps: 1, stability: 1, last_review_at: '2026-05-01T12:00:00Z', state: 3 },
  ];
  const reviews = [{ language: 'zh', rating: 4, review_datetime: '2026-06-21T10:00:00Z' }];
  const result = buildProgressMetrics(words, reviews, { now: NOW, timeZone: 'UTC', activityDays: 2 });
  assert.equal(result.summary.encountered, 2);
  assert.deepEqual(result.languages.map((row) => [row.language, row.encountered]), [['fr', 1], ['zh', 1]]);
  assert.equal(result.languages.find((row) => row.language === 'zh').mastered, 1);
  assert.equal(result.languages.find((row) => row.language === 'zh').totalReviews, 1);
  assert.equal(result.languages.find((row) => row.language === 'fr').totalReviews, 0);
  assert.equal(result.languages.find((row) => row.language === 'fr').due, 1);
});

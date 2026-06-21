// Dashboard aggregator — the single heaviest computation behind /api/dashboard.
// Extracted verbatim from routes/stats.js so the route file stays a thin set of
// handlers. Pure data-in / data-out: takes the already-validated query params and
// returns the dashboard payload. No req/res coupling.
//
// Walks the full review_logs once for the trend series, then computes the
// recallable-now forecast, the daily gained/lost ledger, the heatmap, streaks,
// and the planner signal cards.

import { db, grammarStats, deckStats } from '../db/sqlite.js';
import { retrievability, DAY_MS } from '../srs/fsrs_metrics.js';
import { getDayStartHour, toStudyDay, studyDayStartMs, studyDayEndMs } from './day_helpers.js';

/**
 * @param {object} opts
 * @param {number} opts.trendDays      validated trend window (7..365)
 * @param {number} opts.heatmapWeeks   validated heatmap span in weeks (4..208)
 * @param {number} opts.recallThreshold FSRS desired retention (0..1)
 * @returns dashboard JSON payload
 */
export function computeDashboard({ trendDays, heatmapWeeks, recallThreshold }) {
  const offsetHours = getDayStartHour();
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const AT_RISK_FLOOR = 0.5; // below = considered already-forgotten, not actionably "at risk"
  const TOMORROW_MS = now + DAY_MS;
  const todayStudyDay = toStudyDay(nowIso, offsetHours);
  const todayStartMs = studyDayStartMs(todayStudyDay, offsetHours);

  // ── Deck & grammar summaries ──
  const deck = deckStats();
  const grammar = grammarStats();

  // ── Trends + yesterday snapshot ──
  // Walk every review chronologically once. At each study-day boundary, compute every
  // word's R at the day's close and accumulate the day's recallable total (Σ R). The
  // memorised count (stability ≥ 7 ∧ R ≥ 0.9) is kept as a secondary series for the
  // graph. We snapshot yesterday's R-map (yesterdayR) so the ledger can compute today's
  // natural decay vs. today's review gains without a second pass.
  const trendRows = db.prepare('SELECT word_id, review_datetime, fsrs_state_after_json FROM review_logs ORDER BY review_datetime ASC, id ASC').all();
  const trendDayKeys = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    trendDayKeys.push(d.toISOString().slice(0, 10));
  }
  const wordStateTrend = new Map(); // word_id -> { stability, lastReviewMs }
  let reviewIdxTrend = 0;
  const recallableTrend = []; // [{ day, recallable }] — Σ R at each day's close
  const yesterdayR = new Map(); // word_id -> R at yesterday's close (for ledger)
  const dayR = new Map();

  // Accuracy trend: load all ratings for the trend window grouped by day
  const accuracyByDay = new Map();
  const accuracyRows = db.prepare(`
    SELECT strftime('%Y-%m-%d', datetime(review_datetime, '-${offsetHours} hours')) as day,
           rating, COUNT(*) as count
    FROM review_logs
    WHERE review_datetime >= datetime('now', '-${trendDays} days', '-${offsetHours} hours')
    GROUP BY day, rating
    ORDER BY day ASC
  `).all();
  for (const row of accuracyRows) {
    if (!accuracyByDay.has(row.day)) accuracyByDay.set(row.day, { good: 0, total: 0 });
    const entry = accuracyByDay.get(row.day);
    entry.total += row.count;
    if (row.rating >= 3) entry.good += row.count;
  }

  const reviewsByDay = new Map();
  const reviewRatingRows = db.prepare(`
    SELECT strftime('%Y-%m-%d', datetime(review_datetime, '-${offsetHours} hours')) as day,
           rating, COUNT(*) as count
    FROM review_logs
    WHERE review_datetime >= datetime('now', '-${trendDays} days', '-${offsetHours} hours')
    GROUP BY day, rating
    ORDER BY day ASC
  `).all();
  for (const row of reviewRatingRows) {
    if (!reviewsByDay.has(row.day)) reviewsByDay.set(row.day, { again: 0, hard: 0, good: 0, easy: 0 });
    const entry = reviewsByDay.get(row.day);
    if (row.rating === 1) entry.again += row.count;
    else if (row.rating === 2) entry.hard += row.count;
    else if (row.rating === 3) entry.good += row.count;
    else if (row.rating === 4) entry.easy += row.count;
  }

  for (let di = 0; di < trendDayKeys.length; di++) {
    const day = trendDayKeys[di];
    const dayEndMs = studyDayEndMs(day, offsetHours);
    while (reviewIdxTrend < trendRows.length) {
      const r = trendRows[reviewIdxTrend];
      const rMs = Date.parse(r.review_datetime);
      if (rMs > dayEndMs) break;
      let state;
      try { state = JSON.parse(r.fsrs_state_after_json || 'null'); } catch { state = null; }
      wordStateTrend.set(r.word_id, {
        stability: Number(state?.stability) || 0,
        lastReviewMs: rMs,
      });
      reviewIdxTrend++;
    }
    let recallableSum = 0;
    dayR.clear();
    for (const [wid, s] of wordStateTrend) {
      if (s.stability <= 0) continue;
      const R = retrievability({ stability: s.stability, last_review_at: s.lastReviewMs, now: dayEndMs });
      dayR.set(wid, R);
      recallableSum += R;
    }
    const acc = accuracyByDay.get(day);
    const accuracyPct = acc && acc.total > 0 ? Number((acc.good / acc.total * 100).toFixed(1)) : null;
    const reviews = reviewsByDay.get(day) || { again: 0, hard: 0, good: 0, easy: 0 };
    recallableTrend.push({ day, recallable: Number(recallableSum.toFixed(2)), accuracy: accuracyPct, reviews });
    if (di === trendDayKeys.length - 2) {
      for (const [wid, R] of dayR) yesterdayR.set(wid, R);
    }
  }

  // ── Recallable now + risk forecast ──
  // recallable_now = Σ R(w) over all reviewed words right now.
  // recallable_tomorrow = same projection at now+24h, no further study.
  // words_at_risk = words currently above the floor but expected to fall below the
  // user's recall threshold within 24h — actionable defense candidates.
  let recallableNow = 0;
  let recallableTomorrow = 0;
  let wordsAtRisk = 0;
  let protectIfReviewed = 0;
  const allRows = db.prepare(`
    SELECT w.id, w.stability, MAX(r.review_datetime) AS last_review_at
    FROM words w JOIN review_logs r ON r.word_id = w.id
    GROUP BY w.id
  `).all();
  const currentR = new Map();
  const currentStability = new Map();
  const lastReviewById = new Map();
  for (const w of allRows) {
    if (!w.stability || w.stability <= 0 || !w.last_review_at) continue;
    lastReviewById.set(w.id, w.last_review_at);
    const R = retrievability({ stability: w.stability, last_review_at: w.last_review_at, now });
    const Rtm = retrievability({ stability: w.stability, last_review_at: w.last_review_at, now: TOMORROW_MS });
    currentR.set(w.id, R);
    currentStability.set(w.id, w.stability);
    recallableNow += R;
    recallableTomorrow += Rtm;
    if (R >= recallThreshold && Rtm < recallThreshold && Rtm >= AT_RISK_FLOOR) {
      wordsAtRisk++;
      // If reviewed now, a successful pass resets recall to ~1 and lifts tomorrow's R
      // back to ~recallThreshold or higher. The defendable value ≈ (1 - Rtm) per word.
      protectIfReviewed += (1 - Rtm);
    }
  }

  // ── Daily ledger: gained / lost / net ──
  // gained = Σ ΔR per review made during today's study day, evaluated at today's close.
  //         Pre-review R is taken from the prior review's stored state (or 0 if first).
  //         Post-review R uses this review's stored state, both projected to study-day end.
  // lost   = decay of un-reviewed words from yesterday's close to today's close.
  // net    = gained − lost.
  const todayEndMs = studyDayEndMs(todayStudyDay, offsetHours);
  const reviewedToday = new Set();
  const todayStartSql = new Date(todayStartMs).toISOString().slice(0, 19).replace('T', ' ');
  const todayEndSql = new Date(todayEndMs).toISOString().slice(0, 19).replace('T', ' ');
  const todaysReviews = db.prepare(`
    SELECT word_id, review_datetime, rating, fsrs_state_after_json
    FROM review_logs
    WHERE review_datetime >= ? AND review_datetime <= ?
    ORDER BY review_datetime ASC, id ASC
  `).all(todayStartSql, todayEndSql);

  // Per-word pre-state lookup: the most recent review BEFORE today for each word that
  // reviewed today. One query, then a map for O(1) access.
  const wordIds = [...new Set(todaysReviews.map(r => r.word_id))];
  const preStateByWord = new Map();
  if (wordIds.length) {
    const placeholders = wordIds.map(() => '?').join(',');
    const preRows = db.prepare(`
      SELECT word_id, MAX(review_datetime) AS last_dt
      FROM review_logs
      WHERE word_id IN (${placeholders}) AND review_datetime < ?
      GROUP BY word_id
    `).all(...wordIds, todayStartSql);
    const preDtByWord = new Map(preRows.map(r => [r.word_id, r.last_dt]));
    for (const wid of wordIds) {
      const dt = preDtByWord.get(wid);
      if (!dt) { preStateByWord.set(wid, null); continue; }
      const row = db.prepare('SELECT fsrs_state_after_json FROM review_logs WHERE word_id=? AND review_datetime=? ORDER BY id DESC LIMIT 1').get(wid, dt);
      let s = null;
      try { s = JSON.parse(row?.fsrs_state_after_json || 'null'); } catch { /* ignore */ }
      preStateByWord.set(wid, s ? { stability: Number(s.stability) || 0, lastReviewMs: Date.parse(dt) } : null);
    }
  }

  // Walk today's reviews in order, applying each one to a running state. Σ ΔR at EOD.
  const todayRunning = new Map(); // word_id -> { stability, lastReviewMs } most recent today
  let wordsGained = 0;
  let wordsSecured = 0;       // crossed pre<thr -> post≥thr at EOD
  let newRecallable = 0;       // crossed pre<floor -> post≥floor at EOD
  let memoryExtended = 0;      // Σ ΔS where S = post.stability − pre.stability (clipped ≥0)
  let hardWordsStabilized = 0; // lapsed/low-R word reviewed Good/Easy and lifted above thr
  const stabilizedSeen = new Set(); // dedup multiple reviews for the same word

  for (const rev of todaysReviews) {
    reviewedToday.add(rev.word_id);
    const pre = todayRunning.get(rev.word_id) || preStateByWord.get(rev.word_id);
    let post = null;
    try {
      const s = JSON.parse(rev.fsrs_state_after_json || 'null');
      post = s ? { stability: Number(s.stability) || 0, lastReviewMs: Date.parse(rev.review_datetime) } : null;
    } catch { /* ignore */ }
    if (!post) continue;

    const preR = pre ? retrievability({ stability: pre.stability, last_review_at: pre.lastReviewMs, now: todayEndMs }) : 0;
    const postR = retrievability({ stability: post.stability, last_review_at: post.lastReviewMs, now: todayEndMs });
    wordsGained += (postR - preR);
    memoryExtended += Math.max(0, post.stability - (pre?.stability || 0));

    if (preR < recallThreshold && postR >= recallThreshold) wordsSecured++;
    if (preR < AT_RISK_FLOOR && postR >= AT_RISK_FLOOR) newRecallable++;
    if (!stabilizedSeen.has(rev.word_id)
        && rev.rating >= 3
        && preR < AT_RISK_FLOOR
        && postR >= recallThreshold) {
      hardWordsStabilized++;
      stabilizedSeen.add(rev.word_id);
    }

    todayRunning.set(rev.word_id, post);
  }

  // lost = Σ (R_yesterday − R_today) for words NOT reviewed today, clipped to ≥0.
  let wordsLost = 0;
  for (const [wid, Ry] of yesterdayR) {
    if (reviewedToday.has(wid)) continue;
    const Rn = currentR.get(wid) ?? 0;
    const drop = Ry - Rn;
    if (drop > 0) wordsLost += drop;
  }

  // ── Tomorrow improved ──
  // Compare projected recallable_tomorrow against what tomorrow would have looked like
  // if today's reviews never happened. For each word reviewed today, "no-review" R uses
  // the pre-state projected to TOMORROW_MS; current uses post-state.
  let recallableTomorrowNoReview = 0;
  for (const [wid, R] of currentR) {
    if (!reviewedToday.has(wid)) {
      // Same as recallable_tomorrow contribution for un-reviewed words.
      const s = currentStability.get(wid);
      const last = lastReviewById.get(wid);
      if (!last || !s) continue;
      recallableTomorrowNoReview += retrievability({ stability: s, last_review_at: last, now: TOMORROW_MS });
    } else {
      const pre = preStateByWord.get(wid);
      if (!pre) continue;
      recallableTomorrowNoReview += retrievability({ stability: pre.stability, last_review_at: pre.lastReviewMs, now: TOMORROW_MS });
    }
  }
  const tomorrowImproved = recallableTomorrow - recallableTomorrowNoReview;

  // ── Heatmap ──
  const heatmapDays = heatmapWeeks * 7;
  const heatmapRows = db.prepare(`
    SELECT strftime('%Y-%m-%d', datetime(review_datetime, '-${offsetHours} hours')) as day,
           COUNT(*) as count
    FROM review_logs
    WHERE review_datetime >= datetime('now', '-${heatmapDays} days', '-${offsetHours} hours')
    GROUP BY day
    ORDER BY day ASC
  `).all();
  const heatmap = heatmapRows.map(r => ({ day: r.day, count: r.count }));

  // ── Streaks ──
  const streakRows = db.prepare(`
    SELECT strftime('%Y-%m-%d', datetime(review_datetime, '-${offsetHours} hours')) as day
    FROM review_logs
    GROUP BY day
    ORDER BY day DESC
  `).all();
  const studyDays = streakRows.map(r => r.day);
  const todayStr = toStudyDay(nowIso, offsetHours);
  const yesterdayStr = toStudyDay(new Date(now - DAY_MS).toISOString(), offsetHours);

  let currentStreak = 0;
  if (studyDays.length > 0) {
    const mostRecent = studyDays[0];
    if (mostRecent === todayStr || mostRecent === yesterdayStr) {
      currentStreak = 1;
      for (let i = 1; i < studyDays.length; i++) {
        const prev = new Date(studyDays[i - 1]);
        const curr = new Date(studyDays[i]);
        const diff = (prev - curr) / DAY_MS;
        if (diff === 1) currentStreak++;
        else break;
      }
    }
  }

  let bestStreak = 0;
  if (studyDays.length > 0) {
    // studyDays is DESC; reverse to ASC for run counting
    const asc = [...studyDays].reverse();
    let run = 1;
    for (let i = 1; i < asc.length; i++) {
      const prev = new Date(asc[i - 1]);
      const curr = new Date(asc[i]);
      const diff = (curr - prev) / DAY_MS;
      if (diff === 1) { run++; }
      else { bestStreak = Math.max(bestStreak, run); run = 1; }
    }
    bestStreak = Math.max(bestStreak, run);
  }

  // ── Recent reviews ──
  const recentReviews = db.prepare(`
    SELECT r.rating, r.review_datetime, w.expression
    FROM review_logs r
    JOIN words w ON w.id = r.word_id
    ORDER BY r.review_datetime DESC
    LIMIT 10
  `).all();

  const plannerSignals = [];
  const plannerHref = (intent, signal) => `#planner?intent=${encodeURIComponent(intent)}&signal=${encodeURIComponent(signal)}`;
  const dueNow = deck?.due_now || 0;
  if (wordsAtRisk > 0) {
    plannerSignals.push({
      id: 'memory_risk',
      type: 'risk',
      title: `${wordsAtRisk} words may slip by tomorrow`,
      metric: `~${Math.round(protectIfReviewed)} protected if reviewed`,
      body: 'Build a path around low-recall words before the forecast drops.',
      intent: 'weak',
      seed: { risk: 'forecast_drop', word_count: wordsAtRisk },
      impact_baseline: Number(recallableTomorrow.toFixed(1)),
      planner_href: plannerHref('weak', 'memory_risk'),
    });
  }
  if (dueNow > 0) {
    plannerSignals.push({
      id: 'due_pressure',
      type: 'queue',
      title: `${dueNow} due words waiting`,
      metric: `${Math.min(dueNow, 25)} can fit a short path`,
      body: 'Choose review activities that cover the due queue without duplicating pending lessons.',
      intent: 'due',
      seed: { queue: 'due_now', due_count: dueNow },
      impact_baseline: dueNow,
      planner_href: plannerHref('due', 'due_pressure'),
    });
  }
  const repeatLapses = db.prepare('SELECT COUNT(*) AS c FROM words WHERE lapses >= 2 AND due_at <= ?').get(nowIso)?.c || 0;
  if (repeatLapses > 0) {
    plannerSignals.push({
      id: 'repeat_lapses',
      type: 'risk',
      title: `${repeatLapses} repeat lapse words are due`,
      metric: 'low recall',
      body: 'Use direct recall or drag matching to separate words that keep failing.',
      intent: 'weak',
      seed: { risk: 'repeat_lapses', min_lapses: 2 },
      impact_baseline: repeatLapses,
      planner_href: plannerHref('weak', 'repeat_lapses'),
    });
  }
  const practice30 = db.prepare(`
    SELECT activity, COUNT(*) AS c
    FROM lesson_queue
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY activity
  `).all();
  const practiceMap = Object.fromEntries(practice30.map((r) => [r.activity, r.c]));
  const productionCount = (practiceMap.conversation || 0);
  const recognitionCount = (practiceMap.flashcard || 0) + (practiceMap.dragcard || 0);
  if (recognitionCount >= 4 && productionCount <= Math.max(1, Math.floor(recognitionCount * 0.25))) {
    plannerSignals.push({
      id: 'production_gap',
      type: 'opportunity',
      title: 'Production practice is behind recognition',
      metric: `${productionCount} conversation lessons in 30 days`,
      body: 'Turn current due words into a conversation topic.',
      intent: 'conversation',
      seed: { topic: 'daily conversation', gap: 'production' },
      impact_baseline: productionCount,
      planner_href: plannerHref('conversation', 'production_gap'),
    });
  }
  const heartedSong = db.prepare(`
    SELECT spotify_id, lyrics_track_id, name, artist
    FROM songs
    WHERE hearted = 1
    ORDER BY heart_at DESC
    LIMIT 1
  `).get();
  if (heartedSong) {
    plannerSignals.push({
      id: 'hearted_song',
      type: 'opportunity',
      title: `Saved song ready: ${heartedSong.name}`,
      metric: heartedSong.artist || 'music practice',
      body: 'Seed the planner with a song and compare karaoke coverage against due words.',
      intent: 'song',
      seed: { song: heartedSong.name, spotify_id: heartedSong.spotify_id, lyrics_track_id: heartedSong.lyrics_track_id },
      impact_baseline: 1,
      planner_href: plannerHref('song', 'hearted_song'),
    });
  }
  if ((grammar?.due_now || 0) > 0) {
    plannerSignals.push({
      id: 'grammar_due',
      type: 'queue',
      title: `${grammar.due_now} grammar point${grammar.due_now === 1 ? '' : 's'} due`,
      metric: grammar.accuracy == null ? 'grammar review' : `${Math.round(grammar.accuracy * 100)}% accuracy`,
      body: 'Add grammar flashcards beside vocabulary review.',
      intent: 'grammar',
      seed: { grammar_due: true },
      impact_baseline: grammar.due_now,
      planner_href: plannerHref('grammar', 'grammar_due'),
    });
  }
  if (((practiceMap.karaoke || 0) + (practiceMap.youtube_karaoke || 0)) <= 1 && dueNow > 0) {
    plannerSignals.push({
      id: 'listening_gap',
      type: 'opportunity',
      title: 'Listening practice has room',
      metric: `${(practiceMap.karaoke || 0) + (practiceMap.youtube_karaoke || 0)} media lessons in 30 days`,
      body: 'Use a song or video to reinforce due words in context.',
      intent: heartedSong ? 'song' : 'youtube',
      seed: heartedSong ? { song: heartedSong.name, spotify_id: heartedSong.spotify_id, lyrics_track_id: heartedSong.lyrics_track_id } : { media: 'youtube' },
      impact_baseline: dueNow,
      planner_href: plannerHref(heartedSong ? 'song' : 'youtube', 'listening_gap'),
    });
  }

  return {
    deck,
    grammar,
    recallable: {
      now: Number(recallableNow.toFixed(1)),
      gained: Number(wordsGained.toFixed(1)),
      lost: Number(wordsLost.toFixed(1)),
      net: Number((wordsGained - wordsLost).toFixed(1)),
      tomorrow: Number(recallableTomorrow.toFixed(1)),
      tomorrow_no_review: Number(recallableTomorrowNoReview.toFixed(1)),
      tomorrow_improved: Number(tomorrowImproved.toFixed(1)),
      words_at_risk: wordsAtRisk,
      protect_if_reviewed: Number(protectIfReviewed.toFixed(1)),
    },
    rewards: {
      words_secured: wordsSecured,
      new_recallable: newRecallable,
      memory_extended: Number(memoryExtended.toFixed(1)),
      hard_words_stabilized: hardWordsStabilized,
      reviews_today: todaysReviews.length,
    },
    recallable_trend: recallableTrend,
    threshold: recallThreshold,
    heatmap,
    streak: { current: currentStreak, best: bestStreak },
    recent_reviews: recentReviews,
    planner_signals: plannerSignals.slice(0, 6),
    meta: { trend_days: trendDays, heatmap_weeks: heatmapWeeks },
  };
}

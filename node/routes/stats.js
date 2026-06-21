// Deck statistics endpoints inspired by Anki-Search-Stats-Extended.
// All aggregates run against existing `words` and `review_logs` tables — no new columns.

import { db, grammarStats, deckStats } from '../lib/db/sqlite.js';
import { retrievability, DAY_MS } from '../lib/srs/fsrs_metrics.js';
import { getDayStartHour, toStudyDay, studyDayStartMs, studyDayEndMs } from '../lib/stats/day_helpers.js';
import { computeDashboard } from '../lib/stats/dashboard.js';

const MASTERED_STABILITY_THRESHOLD = 7;
const MASTERED_R_THRESHOLD = 0.9;

export function mountStatsRoutes(app) {
  // ─── 1. Composition Time Machine ─────────────────────────────────────
  // Returns daily deck composition (new/learning/young/mature) for each study day
  // in the requested range. Computed by iterating review logs chronologically
  // and taking the last state per word per study day.
  app.get('/api/stats/composition-time-machine', (req, res) => {
    try {
      const requestedDays = String(req.query.days || '365').trim().toLowerCase();
      const offsetHours = getDayStartHour();
      const words = db.prepare('SELECT id, created_at FROM words ORDER BY created_at ASC').all();
      if (!words.length) return res.json({ days: 0, data: [] });

      const now = Date.now();
      const oldest = words[0]?.created_at ? Date.parse(words[0].created_at) : now;
      const availableDays = Math.max(1, Math.floor((now - oldest) / DAY_MS) + 1);
      const days = requestedDays === 'all' ? availableDays : Math.min(Math.max(parseInt(requestedDays, 10) || 365, 1), availableDays);

      const dayKeys = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * DAY_MS);
        dayKeys.push(d.toISOString().slice(0, 10));
      }

      const reviewLogs = db.prepare('SELECT word_id, review_datetime, fsrs_state_after_json FROM review_logs ORDER BY review_datetime ASC, id ASC').all();

      // Word creation lookup — shifted to study day
      const wordCreated = new Map(words.map((w) => [w.id, toStudyDay(w.created_at, offsetHours)]));

      // Track per-word state as we iterate
      const wordState = new Map(); // word_id -> { state, stability }
      let reviewIdx = 0;
      const data = [];

      for (const day of dayKeys) {
        const dayEndMs = studyDayEndMs(day, offsetHours);

        // Apply all reviews up to end of this study day
        while (reviewIdx < reviewLogs.length) {
          const r = reviewLogs[reviewIdx];
          const rMs = Date.parse(r.review_datetime);
          if (rMs > dayEndMs) break;
          let state;
          try { state = JSON.parse(r.fsrs_state_after_json || 'null'); } catch { state = null; }
          wordState.set(r.word_id, {
            state: Number(state?.state) ?? 0,
            stability: Number(state?.stability) || 0,
          });
          reviewIdx++;
        }

        // Count composition for words that exist on this study day
        let total = 0, newCount = 0, learning = 0, relearning = 0, young = 0, mature = 0;
        for (const [wordId, createdDay] of wordCreated) {
          if (createdDay > day) continue; // word not created yet
          total++;
          const s = wordState.get(wordId);
          if (!s) {
            newCount++; // word created but never reviewed
          } else if (s.state === 1) {
            learning++;
          } else if (s.state === 3) {
            relearning++;
          } else if (s.state === 2) {
            if (s.stability >= 21) mature++;
            else young++;
          } else {
            newCount++; // state 0 = new
          }
        }

        data.push({ day, total, new: newCount, learning, relearning, young, mature });
      }

      res.json({ days, data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 2. Memorised over time ──────────────────────────────────────────
  app.get('/api/stats/memorised', (req, res) => {
    try {
      const requestedDays = String(req.query.days || '365').trim().toLowerCase();
      const offsetHours = getDayStartHour();
      const rows = db.prepare('SELECT word_id, review_datetime, fsrs_state_after_json FROM review_logs ORDER BY review_datetime ASC, id ASC').all();
      if (!rows.length) return res.json({ days: 0, data: [] });

      const now = Date.now();
      const oldest = Date.parse(rows[0].review_datetime);
      const availableDays = Math.max(1, Math.floor((now - oldest) / DAY_MS) + 1);
      const days = requestedDays === 'all' ? availableDays : Math.min(Math.max(parseInt(requestedDays, 10) || 365, 1), availableDays);

      const dayKeys = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * DAY_MS);
        dayKeys.push(d.toISOString().slice(0, 10));
      }

      // Iterate reviews chronologically, tracking per-word latest state.
      // At each study day boundary, count mastered words.
      const wordState = new Map(); // word_id -> { stability, lastReviewMs }
      let reviewIdx = 0;
      const data = [];

      for (const day of dayKeys) {
        const dayEndMs = studyDayEndMs(day, offsetHours);
        // Apply all reviews up to end of this study day
        while (reviewIdx < rows.length) {
          const r = rows[reviewIdx];
          const rMs = Date.parse(r.review_datetime);
          if (rMs > dayEndMs) break;
          let state;
          try { state = JSON.parse(r.fsrs_state_after_json || 'null'); } catch { state = null; }
          wordState.set(r.word_id, {
            stability: Number(state?.stability) || 0,
            lastReviewMs: rMs,
          });
          reviewIdx++;
        }

        // Count mastered: stability >= threshold AND retrievability >= threshold
        let mastered = 0;
        for (const [_, s] of wordState) {
          if (s.stability >= MASTERED_STABILITY_THRESHOLD) {
            const r = retrievability({ stability: s.stability, last_review_at: s.lastReviewMs, now: dayEndMs });
            if (r >= MASTERED_R_THRESHOLD) mastered++;
          }
        }
        data.push({ day, memorised: mastered });
      }

      res.json({ days, data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 3. FSRS Calibration ─────────────────────────────────────────────
  // For each review (except the first for a word), compute predicted R using the
  // PREVIOUS review's state, then bin by predicted R and compare to actual rating.
  app.get('/api/stats/calibration', (_req, res) => {
    try {
      const rows = db.prepare('SELECT word_id, review_datetime, rating, fsrs_state_after_json FROM review_logs ORDER BY review_datetime ASC, id ASC').all();
      if (!rows.length) return res.json({ bins: [] });

      const previousByWord = new Map(); // word_id -> { stability, last_review_at }
      const bins = Array.from({ length: 10 }, (_, i) => ({
        predicted: (i + 1) * 0.1,
        actual: 0,
        count: 0,
      }));

      for (const row of rows) {
        const prev = previousByWord.get(row.word_id);
        previousByWord.set(row.word_id, {
          stability: (() => {
            try { return Number(JSON.parse(row.fsrs_state_after_json || '{}').stability) || 0; } catch { return 0; }
          })(),
          last_review_at: row.review_datetime,
        });

        if (!prev || prev.stability <= 0) continue; // skip first review or invalid state

        const predictedR = retrievability({
          stability: prev.stability,
          last_review_at: prev.last_review_at,
          now: Date.parse(row.review_datetime),
        });

        const binIdx = Math.min(Math.floor(predictedR * 10), 9);
        bins[binIdx].count++;
        if (row.rating >= 3) bins[binIdx].actual++;
      }

      // Convert actual counts to rates
      const result = bins.map((b, i) => ({
        predictedRange: `${i * 10}-${(i + 1) * 10}%`,
        predicted: (i + 0.5) * 0.1, // center of bin
        actual: b.count > 0 ? b.actual / b.count : 0,
        count: b.count,
      }));

      res.json({ bins: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 4. Ratings distribution ─────────────────────────────────────────
  app.get('/api/stats/ratings', (_req, res) => {
    try {
      const rows = db.prepare('SELECT rating, COUNT(*) as count FROM review_logs GROUP BY rating ORDER BY rating ASC').all();
      const labels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
      const data = rows.map((r) => ({ rating: r.rating, label: labels[r.rating] || String(r.rating), count: r.count }));
      res.json({ data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 4b. Ratings daily ───────────────────────────────────────────────
  app.get('/api/stats/ratings-daily', (req, res) => {
    try {
      const requestedDays = String(req.query.days || '365').trim().toLowerCase();
      const offsetHours = getDayStartHour();
      const now = Date.now();
      const oldestRow = db.prepare('SELECT review_datetime FROM review_logs ORDER BY review_datetime ASC LIMIT 1').get();
      const oldest = oldestRow ? Date.parse(oldestRow.review_datetime) : now;
      const availableDays = Math.max(1, Math.floor((now - oldest) / DAY_MS) + 1);
      const days = requestedDays === 'all' ? availableDays : Math.min(Math.max(parseInt(requestedDays, 10) || 365, 1), availableDays);

      const dayKeys = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * DAY_MS);
        dayKeys.push(d.toISOString().slice(0, 10));
      }

      const rows = db.prepare(`
        SELECT strftime('%Y-%m-%d', datetime(review_datetime, '-${offsetHours} hours')) as day,
               rating, COUNT(*) as count
        FROM review_logs
        WHERE review_datetime >= datetime('now', '-${days} days', '-${offsetHours} hours')
        GROUP BY day, rating
        ORDER BY day ASC, rating ASC
      `).all();

      const byDay = new Map();
      for (const d of dayKeys) {
        byDay.set(d, { day: d, Again: 0, Hard: 0, Good: 0, Easy: 0 });
      }
      for (const r of rows) {
        const entry = byDay.get(r.day);
        if (entry && r.rating >= 1 && r.rating <= 4) {
          const label = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }[r.rating];
          entry[label] = r.count;
        }
      }

      res.json({ days, data: Array.from(byDay.values()) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 5. Interval (Stability) Ratings ─────────────────────────────────
  // Group reviews by the stability bucket of the state AFTER the review.
  app.get('/api/stats/interval-ratings', (_req, res) => {
    try {
      const rows = db.prepare('SELECT rating, fsrs_state_after_json FROM review_logs').all();
      const buckets = [
        { key: '<1d', min: 0, max: 1 },
        { key: '1-7d', min: 1, max: 7 },
        { key: '7-30d', min: 7, max: 30 },
        { key: '30-90d', min: 30, max: 90 },
        { key: '90-180d', min: 90, max: 180 },
        { key: '>180d', min: 180, max: Infinity },
      ];
      const labels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

      // Initialize matrix: bucket -> rating -> count
      const matrix = new Map();
      for (const b of buckets) {
        matrix.set(b.key, { key: b.key, 1: 0, 2: 0, 3: 0, 4: 0 });
      }

      for (const row of rows) {
        let stability = 0;
        try { stability = Number(JSON.parse(row.fsrs_state_after_json || '{}').stability) || 0; } catch { /* ignore */ }
        const bucket = buckets.find((b) => stability >= b.min && stability < b.max) || buckets[buckets.length - 1];
        const entry = matrix.get(bucket.key);
        if (entry && row.rating >= 1 && row.rating <= 4) entry[row.rating]++;
      }

      const data = Array.from(matrix.values()).map((entry) => ({
        bucket: entry.key,
        Again: entry[1],
        Hard: entry[2],
        Good: entry[3],
        Easy: entry[4],
      }));

      res.json({ data, ratings: ['Again', 'Hard', 'Good', 'Easy'] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 6. Hourly Breakdown ───────────────────────────────────────────────
  // Review counts per hour of day for a single study day (dynamic, tied to slider).
  // If `date` is provided, returns that study day. Otherwise falls back to the
  // last N study days aggregated (static overview).
  app.get('/api/stats/hourly-breakdown', (req, res) => {
    try {
      const offsetHours = getDayStartHour();
      const date = String(req.query.date || '').trim();

      if (date) {
        // Single study day mode (dynamic)
        const dayStart = `${date}T${String(offsetHours).padStart(2, '0')}:00:00.000Z`;
        const nextDay = new Date(Date.parse(date) + DAY_MS).toISOString().slice(0, 10);
        const dayEnd = `${nextDay}T${String(offsetHours).padStart(2, '0')}:00:00.000Z`;

        const rows = db.prepare(`
          SELECT CAST(strftime('%H', review_datetime) AS INTEGER) as hour, COUNT(*) as count
          FROM review_logs
          WHERE review_datetime >= ? AND review_datetime < ?
          GROUP BY hour
          ORDER BY hour ASC
        `).all(dayStart, dayEnd);

        const hours = Array.from({ length: 24 }, (_, i) => {
          const found = rows.find((r) => r.hour === i);
          return { hour: i, count: found ? found.count : 0 };
        });

        return res.json({ hours, date, dayStartHour: offsetHours });
      }

      // Fallback: aggregate over last N days (static overview)
      const requestedDays = String(req.query.days || '365').trim().toLowerCase();
      const now = Date.now();
      const oldestRow = db.prepare('SELECT review_datetime FROM review_logs ORDER BY review_datetime ASC LIMIT 1').get();
      const oldest = oldestRow ? Date.parse(oldestRow.review_datetime) : now;
      const availableDays = Math.max(1, Math.floor((now - oldest) / DAY_MS) + 1);
      const days = requestedDays === 'all' ? availableDays : Math.min(Math.max(parseInt(requestedDays, 10) || 365, 1), availableDays);

      const cutoff = new Date(now - days * DAY_MS).toISOString().slice(0, 19).replace('T', ' ');

      const rows = db.prepare(`
        SELECT CAST(strftime('%H', review_datetime) AS INTEGER) as hour, COUNT(*) as count
        FROM review_logs
        WHERE review_datetime >= ?
        GROUP BY hour
        ORDER BY hour ASC
      `).all(cutoff);

      const hours = Array.from({ length: 24 }, (_, i) => {
        const found = rows.find((r) => r.hour === i);
        return { hour: i, count: found ? found.count : 0 };
      });

      res.json({ hours, dayStartHour: offsetHours });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 7. Grammar Stats ────────────────────────────────────────────────
  app.get('/api/stats/grammar', (_req, res) => {
    try {
      res.json(grammarStats());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 8. Lightweight recallable snapshot ───────────────────────────────
  app.get('/api/stats/recallable', (_req, res) => {
    try {
      const now = Date.now();
      const rows = db.prepare(`
        SELECT w.id, w.stability, MAX(r.review_datetime) AS last_review_at
        FROM words w JOIN review_logs r ON r.word_id = w.id
        GROUP BY w.id
      `).all();
      let recallableNow = 0;
      for (const w of rows) {
        if (!w.stability || w.stability <= 0 || !w.last_review_at) continue;
        const R = retrievability({ stability: w.stability, last_review_at: w.last_review_at, now });
        recallableNow += R;
      }
      res.json({ now: Number(recallableNow.toFixed(1)), at: now });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 9. Today recallable step function ───────────────────────────────
  // Returns the recallable count at the start of the study day and after each
  // review today, so the frontend can draw an intraday step graph.
  app.get('/api/stats/today-recallable', (_req, res) => {
    try {
      const offsetHours = getDayStartHour();
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const todayStudyDay = toStudyDay(nowIso, offsetHours);
      const todayStartMs = studyDayStartMs(todayStudyDay, offsetHours);

      // Latest review BEFORE today for each word
      const todayStartSql = new Date(todayStartMs).toISOString().slice(0, 19).replace('T', ' ');
      const preRows = db.prepare(`
        SELECT word_id, MAX(review_datetime) AS last_dt
        FROM review_logs
        WHERE review_datetime < ?
        GROUP BY word_id
      `).all(todayStartSql);

      // Load their post-review states
      const running = new Map(); // word_id -> { stability, lastReviewMs }
      let currentTotal = 0;
      for (const row of preRows) {
        const sRow = db.prepare(
          'SELECT fsrs_state_after_json FROM review_logs WHERE word_id=? AND review_datetime=? ORDER BY id DESC LIMIT 1'
        ).get(row.word_id, row.last_dt);
        let s = null;
        try { s = JSON.parse(sRow?.fsrs_state_after_json || 'null'); } catch {}
        if (s && s.stability > 0) {
          const state = { stability: Number(s.stability), lastReviewMs: Date.parse(row.last_dt) };
          running.set(row.word_id, state);
          currentTotal += retrievability({ stability: state.stability, last_review_at: state.lastReviewMs, now: todayStartMs });
        }
      }

      const points = [{ time: new Date(todayStartMs).toISOString(), timeMs: todayStartMs, recallable: Number(currentTotal.toFixed(2)) }];

      // Today's reviews in chronological order
      const todayReviews = db.prepare(`
        SELECT word_id, review_datetime, fsrs_state_after_json
        FROM review_logs
        WHERE review_datetime >= ?
        ORDER BY review_datetime ASC, id ASC
      `).all(todayStartSql);

      for (const rev of todayReviews) {
        let post = null;
        try {
          const s = JSON.parse(rev.fsrs_state_after_json || 'null');
          post = s ? { stability: Number(s.stability) || 0, lastReviewMs: Date.parse(rev.review_datetime + 'Z') } : null;
        } catch {}
        if (!post || post.stability <= 0) continue;

        const reviewMs = Date.parse(rev.review_datetime + 'Z');
        const pre = running.get(rev.word_id);
        const preR = pre ? retrievability({ stability: pre.stability, last_review_at: pre.lastReviewMs, now: reviewMs }) : 0;
        const postR = retrievability({ stability: post.stability, last_review_at: post.lastReviewMs, now: reviewMs });
        currentTotal += (postR - preR);
        running.set(rev.word_id, post);
        points.push({ time: new Date(reviewMs).toISOString(), timeMs: reviewMs, recallable: Number(currentTotal.toFixed(2)) });
      }

      // Final point at "now" to account for decay since the last review
      let finalTotal = 0;
      for (const [_, state] of running) {
        if (state.stability <= 0) continue;
        finalTotal += retrievability({ stability: state.stability, last_review_at: state.lastReviewMs, now });
      }
      points.push({ time: nowIso, timeMs: now, recallable: Number(finalTotal.toFixed(2)) });

      res.json({ points, baseline: points[0].recallable, now: points[points.length - 1].recallable });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 10. Dashboard ───────────────────────────────────────────────────
  // Aggregates everything the home dashboard needs in one call.
  // Query params:
  //   trend_days     — number of days for memorised trend (default 90, max 365)
  //   heatmap_weeks  — number of weeks for streak heatmap (default 52, max 208)
  // ─── 7. Dashboard ────────────────────────────────────────────────────
  // The full home-screen aggregate. Heavy computation lives in lib/stats/dashboard.js;
  // this handler only validates query params and delegates.
  app.get('/api/dashboard', (req, res) => {
    try {
      const trendDays = Math.min(Math.max(parseInt(req.query.trend_days, 10) || 90, 7), 365);
      const heatmapWeeks = Math.min(Math.max(parseInt(req.query.heatmap_weeks, 10) || 52, 4), 208);
      const recallThreshold = (() => {
        const v = Number(req.query.desired_retention);
        return Number.isFinite(v) && v > 0 && v < 1 ? v : 0.9;
      })();
      res.json(computeDashboard({ trendDays, heatmapWeeks, recallThreshold }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── 8. Hourly Breakdown by Day ──────────────────────────────────────
  // Pre-computes hourly review counts for every study day in the range.
  // Returns an ordered day domain plus a complete zero-filled map:
  // { days: ['2025-09-01', ...], byDay: { day: [{hour, count}, ...] } }
  app.get('/api/stats/hourly-breakdown-by-day', (req, res) => {
    try {
      const offsetHours = getDayStartHour();
      const requestedDays = String(req.query.days || '365').trim().toLowerCase();
      const now = Date.now();
      const oldestRow = db.prepare('SELECT review_datetime FROM review_logs ORDER BY review_datetime ASC LIMIT 1').get();
      const firstStudyDay = oldestRow
        ? toStudyDay(oldestRow.review_datetime, offsetHours)
        : toStudyDay(new Date(now).toISOString(), offsetHours);
      const currentStudyDay = toStudyDay(new Date(now).toISOString(), offsetHours);
      const availableDays = Math.max(
        1,
        Math.floor((Date.parse(currentStudyDay) - Date.parse(firstStudyDay)) / DAY_MS) + 1,
      );
      const days = requestedDays === 'all' ? availableDays : Math.min(Math.max(parseInt(requestedDays, 10) || 365, 1), availableDays);

      const dayKeys = [];
      const firstReturnedDayMs = Date.parse(currentStudyDay) - (days - 1) * DAY_MS;
      for (let i = 0; i < days; i++) {
        dayKeys.push(new Date(firstReturnedDayMs + i * DAY_MS).toISOString().slice(0, 10));
      }
      const cutoff = new Date(studyDayStartMs(dayKeys[0], offsetHours))
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      const rows = db.prepare(`
        SELECT strftime('%Y-%m-%d', datetime(review_datetime, '-${offsetHours} hours')) as day,
               CAST(strftime('%H', review_datetime) AS INTEGER) as hour,
               COUNT(*) as count
        FROM review_logs
        WHERE review_datetime >= ?
        GROUP BY day, hour
        ORDER BY day ASC, hour ASC
      `).all(cutoff);

      const byDay = Object.fromEntries(
        dayKeys.map((day) => [
          day,
          Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
        ]),
      );
      for (const r of rows) {
        if (byDay[r.day]) byDay[r.day][r.hour].count = r.count;
      }

      res.json({ days: dayKeys, byDay, dayStartHour: offsetHours });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

// Deck-word graph endpoints. `/api/graph` returns the main projection payload;
// `/api/graph/history/summary` returns lightweight aggregates for the Progress task panel.

import { db } from '../lib/db/sqlite.js';
import { retrievability } from '../lib/srs/fsrs_metrics.js';
import { graphData, graphNodes, graphEdges, graphMetrics, graphStreamChunks, warmupGraphCache } from '../lib/graph/graph.js';

export function graphRequestIds(req) {
  const raw = Array.isArray(req.body?.ids) ? req.body.ids : String(req.query.ids || '').split(',');
  const ids = raw.map(Number).filter(Number.isFinite);
  return [...new Set(ids)];
}

export function mountGraphRoutes(app) {
  const decodeEmbedding = (buf) => {
    if (!buf) return null;
    return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
  };

  // Kick off cache warmup after a short delay so the server finishes binding to the port
  // before the heavy PCA/sweep work starts. Non-blocking.
  setTimeout(() => { warmupGraphCache().catch(() => {}); }, 2000);

  // Deprecated: kept for backwards compatibility. Prefer /api/graph/nodes + /api/graph/edges + /api/graph/metrics.
  app.get('/api/graph', async (req, res) => {
    try {
      const threshold = Math.min(Math.max(parseFloat(req.query.threshold) || 0, 0), 1);
      const raw = req.query.clusters;
      const clusters = (raw == null || raw === 'auto' || raw === '') ? null : Math.min(Math.max(parseInt(raw) || 0, 1), 20);
      const topK = Math.min(Math.max(parseInt(req.query.topK) || 8, 2), 384);
      const maxNodes = Math.min(Math.max(parseInt(req.query.maxNodes) || 1500, 100), 20000);
      const reviewedOnly = req.query.reviewedOnly === 'true' || req.query.reviewedOnly === '1';
      res.json(await graphData({ threshold, clusters, topK, maxNodes, reviewedOnly }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/graph/nodes', async (req, res) => {
    try {
      const maxNodes = Math.min(Math.max(parseInt(req.query.maxNodes) || 1500, 100), 20000);
      const reviewedOnly = req.query.reviewedOnly === 'true' || req.query.reviewedOnly === '1';
      res.json(await graphNodes({ maxNodes, reviewedOnly }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/graph/stream', async (req, res) => {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    let closed = false;
    res.on('close', () => { closed = true; });
    try {
      const maxNodes = Math.min(Math.max(parseInt(req.query.maxNodes) || 1500, 100), 20000);
      const reviewedOnly = req.query.reviewedOnly === 'true' || req.query.reviewedOnly === '1';
      const k = Math.min(Math.max(parseInt(req.query.k) || 6, 1), 20);
      res.write(`${JSON.stringify({ type: 'status', stage: 'starting', maxNodes, reviewedOnly, k })}\n`);
      await new Promise(resolve => setImmediate(resolve));
      if (closed) return;
      for await (const chunk of graphStreamChunks({ maxNodes, reviewedOnly, k })) {
        if (closed) return;
        res.write(`${JSON.stringify(chunk)}\n`);
      }
      res.end();
    } catch (e) {
      if (!res.headersSent) return res.status(500).json({ error: e.message });
      try {
        res.write(`${JSON.stringify({ type: 'error', error: e.message })}\n`);
        res.end();
      } catch {}
    }
  });

  const handleEdges = async (req, res) => {
    try {
      const ids = graphRequestIds(req);
      const k = Math.min(Math.max(parseInt(req.query.k) || 6, 1), 20);
      res.json(await graphEdges(ids, { k }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  };
  app.get('/api/graph/edges', handleEdges);
  app.post('/api/graph/edges', handleEdges);

  const handleMetrics = async (req, res) => {
    try {
      const ids = graphRequestIds(req);
      res.json(await graphMetrics(ids));
    } catch (e) { res.status(500).json({ error: e.message }); }
  };
  app.get('/api/graph/metrics', handleMetrics);
  app.post('/api/graph/metrics', handleMetrics);

  // Per-node retrievability snapshot as of a given date. Uses `fsrs_state_after_json` — the
  // serialized FSRS Card persisted on every review — so we can reconstruct each word's
  // stability at any past date without re-running the scheduler. For a word, we take the
  // most recent review log with review_datetime <= date, parse its Card, and apply the
  // retrievability formula with `now = date`. Words with no qualifying review map to R = 0.
  //
  // Cost: one indexed SELECT per word (O(N) with an index on word_id). Fast enough to skip
  // caching for now; can be added if it becomes a hot path.
  app.get('/api/graph/history', (req, res) => {
    try {
      const dateStr = (req.query.date || '').trim();
      if (!dateStr) return res.status(400).json({ error: 'missing ?date=YYYY-MM-DD' });
      const asOfMs = Date.parse(dateStr);
      if (!Number.isFinite(asOfMs)) return res.status(400).json({ error: 'invalid date' });
      // Treat the bare YYYY-MM-DD as end-of-day so reviews on that day count.
      const boundary = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr} 23:59:59` : dateStr;

      const rows = db.prepare(`
        SELECT w.id AS word_id, w.created_at, (
          SELECT r.fsrs_state_after_json FROM review_logs r
          WHERE r.word_id = w.id AND r.review_datetime <= ?
          ORDER BY r.review_datetime DESC LIMIT 1
        ) AS state_json
        FROM words w
      `).all(boundary);

      const out = rows.map(({ word_id, state_json, created_at }) => {
        if (!state_json) return { id: word_id, retrievability: 0, stability: 0, difficulty: 0, last_review_at: null, created_at };
        let card;
        try { card = JSON.parse(state_json); } catch { return { id: word_id, retrievability: 0, stability: 0, difficulty: 0, last_review_at: null, created_at }; }
        const stability = Number(card.stability) || 0;
        const difficulty = Number(card.difficulty) || 0;
        const lastReview = card.last_review || null;
        const r = retrievability({ stability, last_review_at: lastReview, now: asOfMs });
        return { id: word_id, retrievability: r, stability, difficulty, last_review_at: lastReview, created_at };
      });
      res.json({ date: dateStr, nodes: out });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Lightweight deck-wide history aggregates for the Progress task panel. Per-day review
  // counts for the last 30 days + total review count + recent word-import count. Runs a
  // couple of cheap GROUP-BY queries on the indexed review_datetime column.
  app.get('/api/graph/history/summary', (_req, res) => {
    try {
      const totalRow = db.prepare('SELECT COUNT(*) AS c FROM review_logs').get();
      const byDay = db.prepare(`
        SELECT date(review_datetime) AS day, COUNT(*) AS count
        FROM review_logs
        WHERE review_datetime >= datetime('now', '-30 days')
        GROUP BY day
        ORDER BY day ASC
      `).all();
      const recentImportsRow = db.prepare(`
        SELECT COUNT(*) AS c FROM words
        WHERE created_at >= datetime('now', '-30 days')
      `).get();
      res.json({
        totalReviews: totalRow.c,
        byDay,
        recentImports: recentImportsRow.c,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/graph/progress', (req, res) => {
    try {
      const requestedDays = String(req.query.days || '30').trim().toLowerCase();
      const words = db.prepare(`
        SELECT
          w.id,
          w.expression,
          w.stability,
          w.state,
          MAX(r.review_datetime) AS last_review_at
        FROM words w
        LEFT JOIN review_logs r ON r.word_id = w.id
        GROUP BY w.id
      `).all();
      const totalWords = words.length;
      const now = Date.now();
      const masteredNow = new Set(
        words
          .filter((w) => retrievability({
            stability: Number(w.stability) || 0,
            last_review_at: w.last_review_at,
            now,
          }) >= 0.9 && (Number(w.stability) || 0) >= 7)
          .map((w) => w.id),
      );

      const rows = db.prepare(`
        SELECT r.id, r.word_id, r.rating, r.review_datetime, r.fsrs_state_after_json, w.expression
        FROM review_logs r
        JOIN words w ON w.id = r.word_id
        ORDER BY r.review_datetime ASC, r.id ASC
      `).all();

      const oldestReviewAt = rows[0]?.review_datetime || null;
      const availableDays = oldestReviewAt
        ? Math.max(1, Math.floor((now - Date.parse(oldestReviewAt)) / 86400_000) + 1)
        : 30;
      const days = requestedDays === 'all'
        ? availableDays
        : Math.min(Math.max(parseInt(requestedDays, 10) || 30, 7), availableDays);

      const dayKeys = [];
      const byDayMap = new Map();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * 86400_000).toISOString().slice(0, 10);
        dayKeys.push(d);
        byDayMap.set(d, { day: d, reviews: 0, frontier: 0 });
      }

      const firstReviewState = new Set();
      const previousByWord = new Map();
      const recentEvents = [];

      for (const row of rows) {
        const day = String(row.review_datetime || '').slice(0, 10);
        const bucket = byDayMap.get(day);
        if (bucket) bucket.reviews++;

        let after = null;
        try { after = JSON.parse(row.fsrs_state_after_json || 'null'); } catch {}
        const afterState = Number(after?.state);
        if (bucket && afterState === 2 && !firstReviewState.has(row.word_id)) {
          firstReviewState.add(row.word_id);
          bucket.frontier++;
        }

        const prev = previousByWord.get(row.word_id) || null;
        previousByWord.set(row.word_id, after);

        if (recentEvents.length < 80 || dayKeys.includes(day)) {
          const afterStability = Number(after?.stability) || 0;
          const afterDifficulty = Number(after?.difficulty) || 0;
          const afterR = retrievability({
            stability: afterStability,
            last_review_at: after?.last_review || row.review_datetime,
            now: Date.parse(row.review_datetime),
          });
          const beforeStability = Number(prev?.stability) || 0;
          const beforeDifficulty = Number(prev?.difficulty) || 0;
          const beforeR = prev ? retrievability({
            stability: beforeStability,
            last_review_at: prev?.last_review,
            now: Date.parse(row.review_datetime),
          }) : 0;
          recentEvents.push({
            id: row.id,
            word_id: row.word_id,
            expression: row.expression,
            rating: row.rating,
            reviewed_at: row.review_datetime,
            before: {
              state: Number(prev?.state ?? 0),
              stability: beforeStability,
              difficulty: beforeDifficulty,
              retrievability: beforeR,
            },
            after: {
              state: afterState,
              stability: afterStability,
              difficulty: afterDifficulty,
              retrievability: afterR,
            },
          });
        }
      }

      const byDay = dayKeys.map((d) => byDayMap.get(d));
      let streakDays = 0;
      for (let i = byDay.length - 1; i >= 0; i--) {
        if ((byDay[i]?.reviews || 0) > 0) streakDays++;
        else break;
      }

      const weeklyFrontier = byDay.slice(-7).reduce((sum, d) => sum + (d.frontier || 0), 0);
      const recentMastered = words
        .filter((w) => masteredNow.has(w.id))
        .sort((a, b) => Date.parse(b.last_review_at || 0) - Date.parse(a.last_review_at || 0))
        .slice(0, 8)
        .map((w) => ({
          id: w.id,
          expression: w.expression,
          last_review_at: w.last_review_at,
          stability: Number(w.stability) || 0,
        }));

      res.json({
        days,
        availableDays,
        oldestReviewAt,
        byDay,
        totalWords,
        totalReviews: rows.length,
        streakDays,
        weeklyFrontier,
        masteredNow: masteredNow.size,
        recentMastered,
        recentEvents: recentEvents
          .sort((a, b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at))
          .slice(0, 10),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/graph/embedding/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid word id' });
      const row = db.prepare('SELECT id, expression, reading, meaning, embedding FROM words WHERE id=?').get(id);
      if (!row) return res.status(404).json({ error: 'word not found' });
      const vector = decodeEmbedding(row.embedding);
      if (!vector) return res.status(404).json({ error: 'embedding missing' });
      res.json({
        id: row.id,
        expression: row.expression,
        reading: row.reading,
        meaning: row.meaning,
        dimension: vector.length,
        vector,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

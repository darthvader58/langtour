// Scenario routes: plumbing and orchestration only.
//
// Dialog + evaluation live in node/lib/ai/ (generateTurn / evaluateResponse,
// docs/contracts/ai-module.md); the word forest lives behind
// node/lib/memory/forest.js (docs/contracts/supermemory-forest.md); chaining
// and growth math live in node/lib/graph/. This file validates inputs, builds
// ctx, and enforces the one economy rule that belongs to the route layer:
// only an evaluator-confirmed pass may update FSRS/forest state, and only a
// met turn goal may trigger record_scenario_completion.
//
// Dependencies are injectable (mountScenarioRoutes(app, deps)) and the real
// modules load lazily on first request, so the route file can be imported and
// tested before node/lib/ai/ and node/lib/memory/ exist in a checkout.

import { COUNTRIES } from '../../client/src/gameData.js';
import { ADMIN_EMAIL } from '../lib/config.js';
import {
  PERSONA_BY_COUNTRY,
  TOTAL_SITUATIONS,
  ensureTargetWords,
  generateNextScenario,
  situationById,
} from '../lib/graph/chain.js';
import { computeGrowth, isScenarioComplete } from '../lib/graph/growth.js';

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const KNOWN_LANG_CODES = new Set(COUNTRIES.map((c) => c.langCode));

async function loadDefaultDeps() {
  const [auth, ai, forest, dbApi, srs, graph, pron] = await Promise.all([
    import('../lib/auth.js'),
    import('../lib/ai/index.js'),
    import('../lib/memory/forest.js'),
    import('../lib/db/db.js'),
    import('../lib/srs/fsrs_update.js'),
    import('../lib/graph/graph.js'),
    import('../lib/voice/turnPronunciation.js'),
  ]);
  return {
    requireUser: auth.requireUser,
    ai: { generateTurn: ai.generateTurn, evaluateResponse: ai.evaluateResponse },
    forest: {
      getForestProfile: forest.getForestProfile,
      getStaleWords: forest.getStaleWords,
      recordMasteryEvent: forest.recordMasteryEvent,
      recordSituationClear: forest.recordSituationClear,
    },
    discovery: { getDiscoveryWords: graph.getDiscoveryWords },
    srs: { updateWordFSRS: srs.updateWordFSRS },
    words: {
      getWordsByIds: dbApi.getWordsByIds,
      getWordsByExpressions: dbApi.getWordsByExpressions,
      resolveOrCreateWords: dbApi.resolveOrCreateWords,
    },
    store: {
      insertGeneratedScenario: dbApi.insertGeneratedScenario,
      getGeneratedScenario: dbApi.getGeneratedScenario,
      listGeneratedScenarios: dbApi.listGeneratedScenarios,
      updateGeneratedScenarioProgress: dbApi.updateGeneratedScenarioProgress,
      recordScenarioCompletion: dbApi.recordScenarioCompletion,
      listScenarioCompletions: dbApi.listScenarioCompletions,
    },
    // Email comes from the auth-verified token (req.authUser), set by
    // requireUser — never from the client, and no service-role Admin API hop.
    identity: { getUserEmail: (req) => req.authUser?.email ?? null },
    // Server-side pronunciation gate. assessTurn scores the audio the voice
    // pipeline stored for the given project id; cleanup removes that temp
    // project once scored. The client never sends a score — only the id.
    pron: {
      assessTurn: pron.assessTurnPronunciation,
      cleanup: pron.cleanupTurnAudio,
    },
  };
}

// Admin identity is decided server-side. An empty ADMIN_EMAIL matches no one.
function isAdminEmail(email) {
  return ADMIN_EMAIL !== '' && typeof email === 'string' &&
    email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
}

function resolveCountry(code) {
  if (typeof code !== 'string') return null;
  return COUNTRY_BY_CODE.get(code.trim().toLowerCase()) ?? null;
}

function sanitizePriorTurns(priorTurns) {
  if (!Array.isArray(priorTurns)) return [];
  return priorTurns
    .filter((t) => t && (t.speaker === 'npc' || t.speaker === 'user') && typeof t.text === 'string')
    .map((t) => ({ speaker: t.speaker, text: t.text }));
}

function situationForRow(row) {
  const catalog = situationById(row.scenario_id);
  return {
    id: row.scenario_id,
    title: row.title ?? catalog?.title ?? row.scenario_id,
    superset: row.superset,
  };
}

function buildCtx({ userId, country, row, targetWords, priorTurns, turnIndex }) {
  const turns = sanitizePriorTurns(priorTurns);
  return {
    userId,
    langCode: country.langCode,
    countryCode: country.code,
    scenarioId: row.scenario_id,
    situation: situationForRow(row),
    personaId: PERSONA_BY_COUNTRY[country.code],
    targetWords: targetWords.map(({ id, expression, reading, meaning }) => ({ id, expression, reading, meaning })),
    priorTurns: turns,
    turnIndex: Number.isInteger(turnIndex) ? turnIndex : turns.length,
  };
}

function growthPayload(row, targetWords) {
  return {
    targetWordIds: row.target_word_ids ?? targetWords.map((w) => w.id),
    usedWordIds: row.used_word_ids ?? [],
    targetSize: row.target_size ?? targetWords.length,
    adaptiveCap: row.adaptive_cap ?? null,
    chainComplete: Boolean(row.chain_complete),
  };
}

export function mountScenarioRoutes(app, injectedDeps = null) {
  let depsPromise = injectedDeps ? Promise.resolve(injectedDeps) : null;
  const getDeps = () => (depsPromise ??= loadDefaultDeps());

  // Auth resolves through deps so importing this file never drags in the
  // db-backed middleware (tests inject their own requireUser).
  const withAuth = (req, res, next) => {
    getDeps()
      .then((deps) => deps.requireUser(req, res, next))
      .catch((e) => res.status(500).json({ error: e.message }));
  };

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res, await getDeps());
    } catch (e) {
      console.error(e);
      // Every provider in the model chain is rate-limited (docs/contracts/
      // ai-module.md): a temporary outage, not a server fault — tell the
      // client to retry without leaking provider details.
      if (e?.code === 'model_quota_exhausted') {
        res.status(503).json({ error: 'The guide needs a quick breather — try again in a minute.', retryable: true });
        return;
      }
      res.status(500).json({ error: e.message });
    }
  };

  // Word discovery for a topic — kept for the existing UI; validated instead
  // of coerced. langCode must be a catalog language.
  app.get('/api/scenario/discovery', withAuth, handle(async (req, res, deps) => {
    const { scenarioId, topic, langCode } = req.query;
    if (!KNOWN_LANG_CODES.has(langCode)) {
      res.status(400).json({ error: 'Unknown langCode' });
      return;
    }
    const dbWords = await deps.discovery.getDiscoveryWords(req.userId, topic || scenarioId, langCode, 4);
    // Legacy client field names (zh/pinyin/en) preserved during the transition.
    const words = dbWords.map((w) => ({ ...w, zh: w.expression, pinyin: w.reading, en: w.meaning }));
    res.json({ words });
  }));

  // This user's generated chain for a country, with completion truth joined
  // from scenario_completions — the same tables the claim RPC gates on
  // (docs/contracts/scenario-list.md). Read-only; no economy math here, the
  // RPC re-checks server-side on claim.
  app.get('/api/scenario/list', withAuth, handle(async (req, res, deps) => {
    const { countryCode } = req.query;
    const country = resolveCountry(countryCode);
    if (!country) {
      res.status(400).json({ error: 'Unknown countryCode' });
      return;
    }

    const [existing, completedIds] = await Promise.all([
      deps.store.listGeneratedScenarios(req.userId, country.code),
      deps.store.listScenarioCompletions(req.userId, country.code),
    ]);
    const completedSet = new Set(completedIds);

    const scenarios = existing.map((row) => ({
      scenarioId: row.scenario_id,
      title: situationById(row.scenario_id)?.title ?? row.scenario_id,
      superset: row.superset,
      position: row.position,
      completed: completedSet.has(row.scenario_id),
      targetSize: row.target_size ?? (row.target_word_ids ?? []).length,
      usedCount: (row.used_word_ids ?? []).length,
      chainClosing: Boolean(row.chain_complete),
    }));

    // Mirrors claim_country_reward's gate exactly: a chain_complete row exists
    // AND every generated scenario in the chain has a completion row.
    const chainClosed = existing.some((row) => row.chain_complete);
    const countryComplete = chainClosed && existing.length > 0 &&
      existing.every((row) => completedSet.has(row.scenario_id));

    res.json({
      scenarios,
      nextAvailable: existing.length < TOTAL_SITUATIONS,
      totalSituations: TOTAL_SITUATIONS,
      countryComplete,
    });
  }));

  // One dialog turn. Without scenarioId, first chains the next scenario for
  // this country (persisting it via service role); with one, resumes it.
  app.post('/api/scenario/generate', withAuth, handle(async (req, res, deps) => {
    const { countryCode, scenarioId, priorTurns, turnIndex } = req.body ?? {};
    const country = resolveCountry(countryCode);
    if (!country) {
      res.status(400).json({ error: 'Unknown countryCode' });
      return;
    }

    let row;
    let targetWords;
    if (scenarioId != null) {
      if (typeof scenarioId !== 'string' || scenarioId.length === 0) {
        res.status(400).json({ error: 'Unknown scenarioId' });
        return;
      }
      row = await deps.store.getGeneratedScenario(req.userId, country.code, scenarioId);
      if (!row) {
        res.status(400).json({ error: 'Unknown scenarioId' });
        return;
      }
      targetWords = await ensureTargetWords({
        userId: req.userId,
        langCode: country.langCode,
        row,
        deps,
      });
    } else {
      const generated = await generateNextScenario({
        userId: req.userId,
        countryCode: country.code,
        langCode: country.langCode,
        deps,
      });
      if (!generated) {
        // Every situation in the catalog is covered — the chain is done.
        res.json({ chainComplete: true, scenario: null });
        return;
      }
      row = {
        scenario_id: generated.scenarioId,
        title: generated.situation.title,
        superset: generated.situation.superset,
        country_code: country.code,
        chain_complete: generated.chainComplete,
        target_word_ids: generated.targetWords.map((w) => w.id),
        used_word_ids: [],
        target_size: generated.targetSize,
        adaptive_cap: generated.adaptiveCap,
      };
      targetWords = generated.targetWords;
    }

    const ctx = buildCtx({
      userId: req.userId,
      country,
      row,
      targetWords,
      priorTurns,
      turnIndex,
    });
    const turn = await deps.ai.generateTurn(ctx);

    // generateTurn may grow the set; new words arrive with id:null and the
    // route resolves or creates their dictionary rows (ai-module.md). Growth
    // is clamped to the scenario's adaptive cap — never overwhelming.
    let finalTargets = targetWords;
    const returned = Array.isArray(turn.targetWords) ? turn.targetWords : [];
    const unresolved = returned.filter((w) => w && w.id == null && w.expression);
    if (unresolved.length > 0) {
      const resolvedNew = await deps.words.resolveOrCreateWords(unresolved, country.langCode);
      const have = new Set(targetWords.map((w) => w.id));
      const cap = row.adaptive_cap ?? Number.POSITIVE_INFINITY;
      const additions = resolvedNew
        .filter((w) => !have.has(w.id))
        .slice(0, Math.max(0, cap - targetWords.length));
      if (additions.length > 0) {
        finalTargets = [...targetWords, ...additions];
        const targetIds = finalTargets.map((w) => w.id);
        const targetSize = Math.max(row.target_size ?? 0, finalTargets.length);
        await deps.store.updateGeneratedScenarioProgress(req.userId, country.code, row.scenario_id, {
          target_word_ids: targetIds,
          target_size: targetSize,
        });
        row = { ...row, target_word_ids: targetIds, target_size: targetSize };
      }
    }

    res.json({
      scenarioId: row.scenario_id,
      situation: situationForRow(row),
      personaId: PERSONA_BY_COUNTRY[country.code],
      npcLine: turn.npcLine,
      sidekickLine: turn.sidekickLine,
      expectedIntent: turn.expectedIntent,
      targetWords: finalTargets,
      growth: growthPayload(row, finalTargets),
    });
  }));

  // Evaluate a spoken response. The evaluator's verdict is the only thing that
  // may drive FSRS, forest writes, and — when the turn goal is met — the
  // completion RPC. The client sends only its transcript; no flag in the body
  // can force any of those effects.
  app.post('/api/scenario/evaluate', withAuth, handle(async (req, res, deps) => {
    const { countryCode, scenarioId, transcript, projectId, priorTurns, turnIndex } = req.body ?? {};
    const country = resolveCountry(countryCode);
    if (!country) {
      res.status(400).json({ error: 'Unknown countryCode' });
      return;
    }
    if (typeof scenarioId !== 'string' || scenarioId.length === 0) {
      res.status(400).json({ error: 'Unknown scenarioId' });
      return;
    }
    if (typeof transcript !== 'string' || transcript.trim().length === 0) {
      res.status(400).json({ error: 'Missing transcript' });
      return;
    }

    const row = await deps.store.getGeneratedScenario(req.userId, country.code, scenarioId);
    if (!row) {
      res.status(400).json({ error: 'Unknown scenarioId' });
      return;
    }

    const targetIds = row.target_word_ids ?? [];
    const targetWords = await deps.words.getWordsByIds(targetIds);
    const ctx = buildCtx({
      userId: req.userId,
      country,
      row,
      targetWords,
      priorTurns,
      turnIndex,
    });

    // Server-side pronunciation pass, computed from the audio the voice pipeline
    // stored under projectId. Returns null when scoring is unavailable, so the
    // turn degrades to Deepgram-only. We clean up the temp audio as soon as it is
    // scored — it is not needed past this point, pass or fail.
    const assessment = await deps.pron.assessTurn({
      projectId,
      langCode: country.langCode,
      transcript: transcript.trim(),
      targetWords,
    });
    deps.pron.cleanup(projectId);

    // A genuine mispronunciation of a target word fails the turn and teaches —
    // an accent-level wobble scores above the threshold and never reaches here.
    // No FSRS/forest/completion effect, just as any other failed verdict.
    const mispron = assessment?.majorMispronunciations ?? [];
    if (mispron.length > 0) {
      const worst = mispron.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
      res.json({
        pass: false,
        errorKind: 'mispronunciation',
        teachingNote: `"${worst.expression}" came out badly mispronounced — that was more than an accent. Tap the speaker to hear it again, then say it clearly and try once more.`,
        sidekickLine: { text: "Careful — that word didn't land. Give it another go." },
        usedWords: [],
        scenarioComplete: false,
        growth: growthPayload(row, targetWords),
      });
      return;
    }

    const result = await deps.ai.evaluateResponse(ctx, transcript.trim(), assessment?.pronScore ?? null);

    if (!result.pass) {
      res.json({
        pass: false,
        errorKind: result.errorKind,
        teachingNote: result.teachingNote,
        sidekickLine: result.sidekickLine,
        usedWords: [],
        scenarioComplete: false,
        growth: growthPayload(row, targetWords),
      });
      return;
    }

    // usedWords is guaranteed to contain only ctx.targetWords ids, deduped
    // (ai-module.md); we only skip ones already credited in this scenario.
    const alreadyUsed = new Set(row.used_word_ids ?? []);
    const newlyUsed = (result.usedWords ?? []).filter((id) => !alreadyUsed.has(id));
    const wordById = new Map(targetWords.map((w) => [w.id, w]));

    for (const wordId of newlyUsed) {
      const word = wordById.get(wordId);
      await deps.srs.updateWordFSRS(req.userId, wordId, 3); // 3 = Good
      await deps.forest.recordMasteryEvent(req.userId, {
        wordId,
        expression: word?.expression,
        language: country.langCode,
        superset: row.superset,
        scenarioId: row.scenario_id,
        rating: 3,
      });
    }

    const usedWordIds = [...alreadyUsed, ...newlyUsed];
    const growth = computeGrowth({
      targetWordIds: targetIds,
      usedWordIds,
      adaptiveCap: row.adaptive_cap,
    });
    const scenarioComplete = isScenarioComplete({
      targetWordIds: targetIds,
      usedWordIds,
      adaptiveCap: row.adaptive_cap,
    });

    await deps.store.updateGeneratedScenarioProgress(req.userId, country.code, row.scenario_id, {
      used_word_ids: usedWordIds,
      target_size: growth.targetSize,
    });

    if (scenarioComplete) {
      // Server-confirmed pass + met turn goal: the only path to completion.
      // The completion RPC is service-role-only (finding S3); it runs with the
      // server-verified req.userId and re-validates the scenario against the
      // user's generated chain. The browser cannot reach it directly.
      await deps.store.recordScenarioCompletion(req.userId, country.code, row.scenario_id);
      await deps.forest.recordSituationClear(req.userId, {
        scenarioId: row.scenario_id,
        superset: row.superset,
        countryCode: country.code,
      });
    }

    res.json({
      pass: true,
      errorKind: null,
      teachingNote: result.teachingNote,
      sidekickLine: result.sidekickLine,
      usedWords: newlyUsed,
      scenarioComplete,
      growth: {
        targetWordIds: targetIds,
        usedWordIds,
        targetSize: growth.targetSize,
        adaptiveCap: growth.adaptiveCap,
        grewBy: growth.growBy,
        chainComplete: Boolean(row.chain_complete),
      },
    });
  }));

  // Admin-only evaluator skip (replaces the old client dev-skip). The caller's
  // identity is resolved SERVER-SIDE from the verified req.userId and must equal
  // ADMIN_EMAIL — never trusted from the request body. The scenario must still be
  // in the user's own generated chain (the completion RPC re-validates). Any
  // non-admin gets 403; completion here uses the same service-role RPC as the
  // evaluator path, just without the pass check.
  app.post('/api/scenario/admin-complete', withAuth, handle(async (req, res, deps) => {
    const { countryCode, scenarioId } = req.body ?? {};
    const country = resolveCountry(countryCode);
    if (!country) {
      res.status(400).json({ error: 'Unknown countryCode' });
      return;
    }
    if (typeof scenarioId !== 'string' || scenarioId.length === 0) {
      res.status(400).json({ error: 'Unknown scenarioId' });
      return;
    }

    const email = await deps.identity.getUserEmail(req);
    if (!isAdminEmail(email)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const row = await deps.store.getGeneratedScenario(req.userId, country.code, scenarioId);
    if (!row) {
      res.status(400).json({ error: 'Unknown scenarioId' });
      return;
    }

    await deps.store.recordScenarioCompletion(req.userId, country.code, row.scenario_id);
    await deps.forest.recordSituationClear(req.userId, {
      scenarioId: row.scenario_id,
      superset: row.superset,
      countryCode: country.code,
    });

    res.json({ completed: true, scenarioId: row.scenario_id });
  }));
}

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
import {
  PERSONA_BY_COUNTRY,
  ensureTargetWords,
  generateNextScenario,
  situationById,
} from '../lib/graph/chain.js';
import { computeGrowth, isScenarioComplete } from '../lib/graph/growth.js';

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const KNOWN_LANG_CODES = new Set(COUNTRIES.map((c) => c.langCode));

async function loadDefaultDeps() {
  const [auth, ai, forest, dbApi, srs, graph] = await Promise.all([
    import('../lib/auth.js'),
    import('../lib/ai/index.js'),
    import('../lib/memory/forest.js'),
    import('../lib/db/db.js'),
    import('../lib/srs/fsrs_update.js'),
    import('../lib/graph/graph.js'),
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
      recordScenarioCompletionAsUser: dbApi.recordScenarioCompletionAsUser,
    },
  };
}

function resolveCountry(code) {
  if (typeof code !== 'string') return null;
  return COUNTRY_BY_CODE.get(code.trim().toLowerCase()) ?? null;
}

function bearerToken(req) {
  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  return match ? match[1] : null;
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
    const { countryCode, scenarioId, transcript, pronScore, priorTurns, turnIndex } = req.body ?? {};
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

    const result = await deps.ai.evaluateResponse(ctx, transcript.trim(), pronScore ?? null);

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
      // The RPC runs as the user (auth.uid()) and re-validates the scenario
      // against the user's generated chain.
      await deps.store.recordScenarioCompletionAsUser(bearerToken(req), country.code, row.scenario_id);
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
}

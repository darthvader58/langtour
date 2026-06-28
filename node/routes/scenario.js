import { getWordByExpression, db, userClient } from '../lib/db/db.js';
import { getDiscoveryWords } from '../lib/graph/graph.js';
import { updateWordFSRS } from '../lib/srs/fsrs_update.js';
import { requireUser } from '../lib/auth.js';
import { generateTurn, evaluateResponse } from '../lib/ai/index.js';

export function mountScenarioRoutes(app) {

  // Endpoint to discover optimal words for a scenario
  app.get('/api/scenario/discovery', requireUser, async (req, res) => {
    try {
      const { scenarioId, topic, langCode } = req.query;
      const dbWords = await getDiscoveryWords(req.userId, topic || scenarioId, langCode || 'zh', 4);
      const words = dbWords.map(w => ({
        ...w,
        zh: w.expression,
        pinyin: w.reading,
        en: w.meaning
      }));
      console.log(`[Discovery] Dynamically selected words for "${topic || scenarioId}":`, words.map(w => w.zh).join(', '));
      res.json({ words });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Endpoint to generate an NPC line based on target words.
  //
  // Wire-shape note (T-D): the frontend (client/src/components/GameplayPhase.jsx)
  // reads `data.zh` / `data.pinyin` / `data.en` directly off the response and
  // must keep working unchanged in this ticket — Phase 4 (frontend-story)
  // refits the client to the richer shape. generateTurn() (lib/ai) now
  // returns { npcLine, sidekickLine, expectedIntent, targetWords }; this
  // route flattens npcLine to the top level for the legacy reader and rides
  // the richer fields alongside, additive only.
  //
  // countryCode/scenarioId are accepted but optional: today's frontend
  // doesn't send them yet, so catalog validation inside generateTurn only
  // runs when they're present (see lib/ai/generateTurn.js). T-E's route
  // plumbing is expected to start sending them once the forward-chaining
  // engine needs the validated country/scenario pair.
  app.post('/api/scenario/generate', requireUser, async (req, res) => {
    try {
      const { scenarioContext, targetWords, previousTurns, langCode, countryCode, scenarioId, forestSlice } = req.body;

      const result = await generateTurn({
        userId: req.userId,
        countryCode,
        scenarioId,
        scenarioContext,
        targetWords,
        previousTurns,
        langCode,
        forestSlice,
      });

      res.json({
        // Legacy wire shape — unchanged keys/types.
        zh: result.npcLine.zh,
        pinyin: result.npcLine.pinyin,
        en: result.npcLine.en,
        // Additive richer fields for T-E / Phase 4 to pick up.
        sidekickLine: result.sidekickLine,
        expectedIntent: result.expectedIntent,
        targetWords: result.targetWords,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Evaluator endpoint to check user's STT response.
  //
  // Wire-shape note (T-D/T-E): the frontend reads `result.status` / `result.feedback`
  // / `result.usedWord` and must keep working unchanged. evaluateResponse()
  // (lib/ai) returns the contract-03 EvaluateResult plus legacy mirror keys.
  // On a server-confirmed pass with attested words, the route calls
  // record_scenario_turn (T-E); grant fields ride alongside additively.
  app.post('/api/scenario/evaluate', requireUser, async (req, res) => {
    try {
      const { scenarioContext, targetWords, npcLine, expectedIntent, userResponse, langCode, countryCode, scenarioId, pronScore } = req.body;

      const result = await evaluateResponse(
        {
          userId: req.userId,
          countryCode,
          scenarioId,
          scenarioContext,
          targetWords,
          npcLine,
          expectedIntent,
          userResponse,
          langCode,
        },
        pronScore ?? null,
      );

      // If passed, update FSRS for every server-attested used word. Prefer
      // the server-derived usedWordIds (contract 03) over the legacy
      // expression-lookup path; fall back to the old path only if a caller
      // is still on the pre-T-D shape with no usedWordIds.
      if (result.status === 'passed') {
        if (Array.isArray(result.usedWordIds) && result.usedWordIds.length > 0) {
          for (const wordId of result.usedWordIds) {
            await updateWordFSRS(req.userId, wordId, 3); // 3 = Good
          }
        } else if (result.usedWord) {
          const wordRow = await getWordByExpression(result.usedWord);
          if (wordRow) {
            await updateWordFSRS(req.userId, wordRow.id, 3);
          }
        }
      }

      // Economy closure: call record_scenario_turn when the server-confirmed
      // pass has attested word IDs.  turn_index is derived exclusively from the
      // server-side scenario_turn_grants ledger — the client's body value (if
      // any) is intentionally ignored here.  usedWordIds come from the
      // server-attested evaluator result, never from the request body.
      //
      // Failures are best-effort: the eval verdict is already correct; the
      // economy update failing must not 500 the route.
      let grant = null;
      if (result.pass === true && Array.isArray(result.usedWordIds) && result.usedWordIds.length > 0 && countryCode && scenarioId) {
        try {
          // Find the highest turn_index already recorded for this (user, scenario)
          // pair and add 1.  Using MAX rather than COUNT makes the index
          // gap-safe: if a prior insert raced and was deduped by the RPC, we
          // still get a fresh index rather than accidentally reusing one.
          const { data: lastTurns, error: turnQueryError } = await db
            .from('scenario_turn_grants')
            .select('turn_index')
            .eq('user_id', req.userId)
            .eq('scenario_id', scenarioId)
            .order('turn_index', { ascending: false })
            .limit(1);
          if (turnQueryError) throw turnQueryError;

          const turnIndex = lastTurns && lastTurns.length > 0 ? lastTurns[0].turn_index + 1 : 0;

          // Use a user-context client so auth.uid() resolves inside the
          // SECURITY DEFINER function.  The service-role apikey grants call
          // permission; the user JWT in Authorization sets auth.uid().
          const { data: grantData, error: rpcError } = await userClient(req.headers.authorization)
            .rpc('record_scenario_turn', {
              p_country_code: countryCode,
              p_scenario_id: scenarioId,
              p_turn_index: turnIndex,
              p_used_word_ids: result.usedWordIds,
            });
          if (rpcError) throw rpcError;
          grant = grantData;
        } catch (grantErr) {
          // Log and continue — the eval result is authoritative; the economy
          // update is advisory.  A failure here does NOT void the pass.
          console.error('[economy] record_scenario_turn failed:', grantErr.message ?? String(grantErr));
        }
      }

      // Wire shape: legacy keys (status/feedback/usedWord) are preserved
      // unchanged.  Grant fields ride alongside additively; Phase 4 frontend
      // refits to the richer shape later.
      res.json(grant ? { ...result, ...grant } : result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}

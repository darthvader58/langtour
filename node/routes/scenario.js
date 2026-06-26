import { getWordByExpression } from '../lib/db/db.js';
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
  // Wire-shape note (T-D): the frontend reads `result.status` / `result.feedback`
  // / `result.usedWord` and must keep working unchanged. evaluateResponse()
  // (lib/ai) now returns the contract-03 EvaluateResult plus those same legacy
  // keys as a mirror (see lib/ai/evaluateResponse.js's shapeResult()), so this
  // route can return it close to verbatim.
  //
  // This route does NOT call record_scenario_turn — that RPC wiring is T-E's
  // job. usedWordIds rides along on the response so T-E can call the RPC
  // without touching lib/ai.
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

      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}

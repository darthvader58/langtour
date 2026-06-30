import { getWordByExpression, db, userClient } from '../lib/db/db.js';
import { getDiscoveryWords } from '../lib/graph/graph.js';
import { getGrowingTargetState } from '../lib/graph/growingTarget.js';
import { updateWordFSRS } from '../lib/srs/fsrs_update.js';
import { requireUser } from '../lib/auth.js';
import { generateTurn, evaluateResponse } from '../lib/ai/index.js';
import { scorePronunciation } from '../lib/speech/index.js';

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
      const { scenarioContext, targetWords: clientTargetWords, previousTurns, langCode, countryCode, scenarioId, forestSlice } = req.body;

      // Server-authoritative growing target: when countryCode + scenarioId are
      // present, override the client-sent targetWords with the server-computed
      // growing-target set for this (user, scenario) state.  Falls back to
      // client-sent words for legacy callers that omit those fields.
      let authorityTargetWords = clientTargetWords;
      let growingStateForGenerate = null;
      if (countryCode && scenarioId) {
        try {
          growingStateForGenerate = await getGrowingTargetState({
            userId: req.userId,
            countryCode,
            scenarioId,
          });
          authorityTargetWords = growingStateForGenerate.targetWords;
        } catch (growErr) {
          // Non-fatal: log and fall back to client-sent words.  The AI prompt
          // gets client-provided context, which is still useful; it just hasn't
          // been independently validated server-side.
          console.error('[growingTarget] generate: getGrowingTargetState failed:', growErr.message ?? String(growErr));
        }
      }

      const result = await generateTurn({
        userId: req.userId,
        countryCode,
        scenarioId,
        scenarioContext,
        targetWords: authorityTargetWords,
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
        // Growing-target contract (T-H): present when server-computed, additive.
        ...(growingStateForGenerate && {
          scenarioComplete: growingStateForGenerate.scenarioComplete,
        }),
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
      // Any client-supplied pronScore is intentionally absent from this
      // destructuring.  The only score that reaches evaluateResponse is the
      // server-computed result from audio_b64 below — never a client value.
      // See CLAUDE.md §server-truth and T-L for the reasoning.
      const { scenarioContext, targetWords, npcLine, expectedIntent, userResponse, langCode, countryCode, scenarioId, audio_b64 } = req.body;

      // Server-side pronunciation scoring (T-L, Option A: consolidated endpoint).
      // The client sends the captured audio as audio_b64 instead of a pre-computed
      // pronScore.  scorePronunciation is called here so the server owns the result.
      // If audio_b64 is absent (legacy/transcript-only callers) the evaluator
      // degrades gracefully to transcript-only judgment (pronScore = null).
      // If the engine throws (config/auth/unexpected error), same degraded path.
      // The dispatcher's sentinel { accuracy:0, fluency:0, completeness:0, perWord:[] }
      // for engine 5xx is passed through — evaluateResponse handles it by skipping
      // the incomprehensible_pronunciation override (empty perWord → no mis-scored
      // target words, so the floor check does not fire).
      // Reject base64 payloads above ~6 MB decoded (~8 MB encoded). server.js sets
      // a 200 MB JSON body cap which is appropriate for some endpoints but would
      // let a single forged audio_b64 here allocate ~150 MB. A plausible mic clip
      // (30s WebM/Opus) lives well under this cap; anything larger is either
      // misuse or a DoS attempt.
      const AUDIO_B64_MAX = 8_000_000;
      let serverPronScore = null;
      if (audio_b64 && typeof audio_b64 === 'string' && audio_b64.length >= 4 && userResponse) {
        if (audio_b64.length > AUDIO_B64_MAX) {
          console.error(`[evaluate] audio_b64 rejected: ${audio_b64.length} bytes exceeds ${AUDIO_B64_MAX} cap`);
        } else {
          try {
            const audio = Buffer.from(audio_b64, 'base64');
            serverPronScore = await scorePronunciation(audio, langCode, userResponse);
          } catch (scoreErr) {
            // Log and continue — transcript-only eval is correct even without a score.
            console.error('[evaluate] scorePronunciation failed:', scoreErr.message ?? String(scoreErr));
          }
        }
      }

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
        serverPronScore,
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

      // Growing-target contract (T-H): compute the NEXT state for the frontend
      // after the turn has been recorded.  Because record_scenario_turn has
      // already run (above), getGrowingTargetState sees the updated attestation
      // set — so the returned targetWords are the words the player still needs
      // for the NEXT turn, and scenarioComplete reflects the state after this
      // pass.  Non-fatal: a failure here does not void the eval result.
      let growingTargetState = null;
      if (countryCode && scenarioId) {
        try {
          growingTargetState = await getGrowingTargetState({
            userId: req.userId,
            countryCode,
            scenarioId,
          });
        } catch (growErr) {
          console.error('[growingTarget] evaluate: getGrowingTargetState failed:', growErr.message ?? String(growErr));
        }
      }

      // Wire shape: legacy keys (status/feedback/usedWord) are preserved
      // unchanged.  Grant fields and growing-target fields ride alongside
      // additively; Phase 4 frontend (T-J) refits to the richer shape later.
      const baseResponse = grant ? { ...result, ...grant } : result;
      const growingTargetFields = growingTargetState
        ? { targetWords: growingTargetState.targetWords, scenarioComplete: growingTargetState.scenarioComplete }
        : {};
      res.json({ ...baseResponse, ...growingTargetFields });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}

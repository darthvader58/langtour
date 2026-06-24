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

  // Endpoint to generate an NPC line based on target words
  app.post('/api/scenario/generate', requireUser, async (req, res) => {
    try {
      const { scenarioContext, targetWords, previousTurns, langCode } = req.body;

      const parsed = await generateTurn({ scenarioContext, targetWords, previousTurns, langCode });

      res.json(parsed);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Evaluator endpoint to check user's STT response
  app.post('/api/scenario/evaluate', requireUser, async (req, res) => {
    try {
      const { scenarioContext, targetWords, npcLine, userResponse, langCode } = req.body;

      const parsed = await evaluateResponse({ scenarioContext, targetWords, npcLine, userResponse, langCode });

      // If passed, we update FSRS ratings for the usedWord.
      if (parsed.status === "passed" && parsed.usedWord) {
        const wordRow = await getWordByExpression(parsed.usedWord);
        if (wordRow) {
          await updateWordFSRS(req.userId, wordRow.id, 3); // 3 = Good
        }
      }

      res.json(parsed);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}

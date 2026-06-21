import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_API_KEY } from '../lib/config.js';

const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});
import { db } from '../lib/db/db.js';
import { getDiscoveryWords } from '../lib/graph/graph.js';
import { updateWordFSRS } from '../lib/srs/fsrs_update.js';

export function mountScenarioRoutes(app) {
  
  // Endpoint to discover optimal words for a scenario
  app.get('/api/scenario/discovery', async (req, res) => {
    try {
      const { scenarioId, topic } = req.query;
      const dbWords = await getDiscoveryWords(topic || scenarioId, 4);
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
  app.post('/api/scenario/generate', async (req, res) => {
    try {
      const { scenarioContext, targetWords, previousTurns } = req.body;
      
      const prompt = `
You are an NPC in a ${scenarioContext} scenario. The user is a Mandarin language learner.
Your goal is to generate the NEXT line of dialogue for the NPC.
Keep it under 15 Chinese characters. It should prompt the user to respond using one of these target words:
${targetWords.map(w => w.expression + ' (' + w.meaning + ')').join(', ')}

Previous conversation:
${previousTurns ? previousTurns.map(t => t.speaker + ': ' + t.text).join('\n') : 'None'}

Return ONLY a JSON object:
{ "zh": "Chinese text", "pinyin": "pinyin text", "en": "English translation" }
`;
      
      const { text } = await generateText({
        model: google('gemini-2.5-flash'), // or whichever model is active
        prompt,
      });

      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { zh: "你好！你想买什么？", pinyin: "nǐ hǎo! nǐ xiǎng mǎi shénme?", en: "Hello! What would you like to buy?" };

      res.json(parsed);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Evaluator endpoint to check user's STT response
  app.post('/api/scenario/evaluate', async (req, res) => {
    try {
      const { scenarioContext, targetWords, npcLine, userResponse } = req.body;

      const prompt = `
You are a strict but helpful Mandarin teacher.
The user is in a ${scenarioContext} scenario.
The NPC just said: "${npcLine.zh}" (${npcLine.en})
The user responded with: "${userResponse}" (transcribed via Speech-to-Text).

Did the user successfully respond to the NPC appropriately?
CRITICAL RULES:
1. The user ONLY needs to use AT LEAST ONE of the target words correctly. Do NOT require them to use all of them.
2. Be forgiving of minor grammar mistakes or imperfect translations as long as the general meaning is clear and one target word is used correctly.
Target words: ${targetWords.map(w => w.expression).join(', ')}

Return ONLY a JSON object:
{
  "status": "passed" | "failed",
  "feedback": "Short encouraging feedback explaining why they failed or succeeded in English.",
  "usedWord": "The target word they successfully used (or null)"
}
`;

      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        prompt,
      });

      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { status: "failed", feedback: "Could not evaluate.", usedWord: null };

      // If passed, we update FSRS ratings for the usedWord.
      if (parsed.status === "passed" && parsed.usedWord) {
        const wordRow = db.prepare('SELECT id FROM words WHERE expression = ?').get(parsed.usedWord);
        if (wordRow) {
          updateWordFSRS(db, wordRow.id, 3); // 3 = Good
        }
      }

      res.json(parsed);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}

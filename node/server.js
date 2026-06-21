import express from 'express';
import cors from 'cors';
import { PORT } from './lib/config.js';
import { mountVoiceRoutes } from './routes/voice.js';
import { mountScenarioRoutes } from './routes/scenario.js';
import { db, resetDatabase } from './lib/db/db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));

async function startServer() {
  process.on('unhandledRejection', (e) => console.error('UNHANDLED:', e));
  const httpServer = app.listen(PORT, () => {
    console.log(`Langtour API running at http://localhost:${PORT}`);
  });

  mountVoiceRoutes(app, httpServer);
  mountScenarioRoutes(app);

  app.post('/api/admin/reset', (req, res) => {
    try {
      resetDatabase();
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/user/state', (req, res) => {
    try {
      const profile = db.prepare('SELECT tokens, unlocked_countries FROM user_profile WHERE id = 1').get() || { tokens: 0, unlocked_countries: '[]' };
      const scenariosRows = db.prepare("SELECT id FROM scenarios WHERE status = 'completed'").all();
      res.json({
        tokens: profile.tokens,
        unlockedCountries: JSON.parse(profile.unlocked_countries || '[]'),
        completedScenarios: scenariosRows.map(r => r.id)
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/spend', (req, res) => {
    try {
      const { amount } = req.body;
      db.prepare('UPDATE user_profile SET tokens = tokens - ? WHERE id = 1').run(amount);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/complete-scenario', (req, res) => {
    try {
      const { scenarioId } = req.body;
      db.prepare("UPDATE scenarios SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(scenarioId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/unlock-country', (req, res) => {
    try {
      const { countryName, cost } = req.body;
      
      const transaction = db.transaction(() => {
        const profile = db.prepare('SELECT tokens, unlocked_countries FROM user_profile WHERE id = 1').get();
        if (profile.tokens < cost) {
          throw new Error('Insufficient tokens');
        }
        
        let unlocked = JSON.parse(profile.unlocked_countries || '[]');
        if (!unlocked.includes(countryName)) {
          unlocked.push(countryName);
        }
        
        db.prepare('UPDATE user_profile SET tokens = tokens - ?, unlocked_countries = ? WHERE id = 1')
          .run(cost, JSON.stringify(unlocked));
          
        return { tokens: profile.tokens - cost, unlockedCountries: unlocked };
      });
      
      const result = transaction();
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
}

startServer();

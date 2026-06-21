import express from 'express';
import cors from 'cors';
import { PORT } from './lib/config.js';
import { mountVoiceRoutes } from './routes/voice.js';
import { mountScenarioRoutes } from './routes/scenario.js';
import { getCatalog, initializeDatabase } from './lib/db/db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));

async function startServer() {
  process.on('unhandledRejection', (e) => console.error('UNHANDLED:', e));
  await initializeDatabase();
  const httpServer = app.listen(PORT, () => {
    console.log(`Langtour API running at http://localhost:${PORT}`);
  });

  mountVoiceRoutes(app, httpServer);
  mountScenarioRoutes(app);

  app.get('/api/catalog', async (req, res) => {
    try {
      res.json(await getCatalog());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

startServer();

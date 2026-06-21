import express from 'express';
import cors from 'cors';
import { PORT } from './lib/config.js';
import { mountVoiceRoutes } from './routes/voice.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));

async function startServer() {
  process.on('unhandledRejection', (e) => console.error('UNHANDLED:', e));
  const httpServer = app.listen(PORT, () => {
    console.log(`Langtour API running at http://localhost:${PORT}`);
  });

  mountVoiceRoutes(app, httpServer);
}

startServer();

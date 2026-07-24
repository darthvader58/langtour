import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, VOICE_AUDIO_DIR } from './lib/config.js';
import { mountVoiceRoutes } from './routes/voice.js';
import { mountScenarioRoutes } from './routes/scenario.js';
import { mountProfileRoutes } from './routes/profile.js';
import { getCatalog, initializeDatabase } from './lib/db/db.js';
import { setBaseDir } from './lib/voice/projectStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));

async function startServer() {
  process.on('unhandledRejection', (e) => console.error('UNHANDLED:', e));
  if (VOICE_AUDIO_DIR) setBaseDir(VOICE_AUDIO_DIR);

  await initializeDatabase();

  // Use a real HTTP server so the voice route can handle WebSocket upgrades.
  const httpServer = http.createServer(app);

  mountVoiceRoutes(app, httpServer);
  mountScenarioRoutes(app);
  mountProfileRoutes(app);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/catalog', async (req, res) => {
    try {
      res.json(await getCatalog());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // In production the same service hosts the Vite build. Keeping the browser,
  // API, and WebSocket on one origin avoids proxy and CORS configuration.
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // Terminal error handler. The public origin gets probed with binary/garbage
  // POST bodies carrying `Content-Type: application/json`, which express.json()
  // then fails to parse — without this, that SyntaxError bubbles up as an
  // unhandled error and floods the logs on every probe. Answer malformed bodies
  // with a quiet 400, oversized ones with 413, and log only genuine surprises.
  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload too large' });
    }
    console.error('Unhandled request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Langtour running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

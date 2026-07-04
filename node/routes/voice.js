import WebSocket, { WebSocketServer } from 'ws';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createVoiceProject,
  deleteVoiceProject,
  getVoiceProject,
  listVoiceTree,
  renameVoiceProject,
  moveVoiceProject,
  updateVoiceProject,
  createVoiceFolder,
  renameVoiceFolder,
  moveVoiceFolder,
  deleteVoiceFolder,
  saveVoiceAudio,
  loadVoiceAudio,
  saveVoiceTranscript,
  listVoiceFolders,
} from '../lib/voice/projectStore.js';
import { DEEPGRAM_API_KEY, GEMINI_API_KEY } from '../lib/config.js';
import { sseHeaders, sseEmit } from '../lib/sse.js';
import {
  normalizeLang,
  liveUrl,
  batchUrl,
  KEEPALIVE_INTERVAL_MS,
  PENDING_AUDIO_MAX_CHUNKS,
  reconnectDelayMs,
  shouldReconnect,
} from '../lib/voice/langParams.js';

const NAME_LIMIT = 200;
const VALID_STATUSES = ['draft', 'recording', 'ready', 'transcribing', 'completed', 'error'];

// Live (streaming) URL: lean params, lowest latency. Diarization here is provisional —
// it only feeds the on-screen interim text. The authoritative transcript comes from the
// batch pass below. See IS-019.
// NOTE: utterance_end_ms must be >= 1000 AND requires interim_results=true, else Deepgram
// rejects the stream with HTTP 400. The original handoff used 500 (invalid) — which meant
// the live stream silently 400'd and never produced live text. See IS-019 / discovery.
// Batch (pre-recorded) params: accuracy first, latency irrelevant. nova-2 has stronger
// Chinese coverage than nova-3, and a batch pass over the *complete* audio diarizes far
// better than the streaming pass. Deepgram auto-detects speaker count — there is no
// parameter to hint or constrain it (verified against the live API), so we don't try.
// Per-language model selection now lives in lib/voice/langParams.js — notably Arabic,
// which nova-2 does not support at all, is routed to nova-3 there.

const liveSessions = new Map();
const playbackAudioCache = new Map();
const PLAYBACK_AUDIO_CACHE_LIMIT = 20;

function projectPath(value) {
  if (!value || !Array.isArray(value)) return null;
  const joined = value.map(s => decodeURIComponent(String(s))).join('/');
  if (!joined) return null;
  return joined;
}

function sanitizeProject(p) {
  if (!p) return p;
  const { audio_data, ...rest } = p;
  return { ...rest, transcript: Array.isArray(p.transcript) ? p.transcript : [] };
}

function sniffAudioContentType(buf) {
  if (buf.length >= 12) {
    const header = buf.toString('ascii', 0, 12);
    if (header.startsWith('RIFF') && header.includes('WAVE')) return 'audio/wav';
    if (header.startsWith('fLaC')) return 'audio/flac';
    if (header.startsWith('OggS')) return 'audio/ogg';
    if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return 'audio/mpeg';
  }
  return 'audio/webm';
}

function isWebmBuffer(buf) {
  return buf.length >= 4 && buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3;
}

function playbackAudioForProject(project, buf) {
  if (!isWebmBuffer(buf)) return { buf, contentType: sniffAudioContentType(buf) };

  const cacheKey = `${project.id}:${project.updated_at}:${buf.length}`;
  const cached = playbackAudioCache.get(cacheKey);
  if (cached) return cached;

  let dir = null;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maizu-voice-'));
    const inputPath = path.join(dir, 'input.webm');
    const outputPath = path.join(dir, 'output.wav');
    fs.writeFileSync(inputPath, buf);
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', inputPath,
      '-ac', '1',
      '-ar', '48000',
      outputPath,
    ], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const normalized = fs.readFileSync(outputPath);
    const result = { buf: normalized, contentType: 'audio/wav' };
    playbackAudioCache.set(cacheKey, result);
    while (playbackAudioCache.size > PLAYBACK_AUDIO_CACHE_LIMIT) {
      const oldest = playbackAudioCache.keys().next().value;
      playbackAudioCache.delete(oldest);
    }
    return result;
  } catch (e) {
    console.warn('[voice] failed to normalize WebM playback audio:', e.message);
    return { buf, contentType: 'audio/webm' };
  } finally {
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

function parseRangeHeader(value, totalLength) {
  const match = value.match(/^bytes=(.*)$/);
  if (!match) return null;
  return match[1].split(',').map(part => {
    const [startStr, endStr] = part.trim().split('-');
    let start = startStr ? Number.parseInt(startStr, 10) : NaN;
    let end = endStr ? Number.parseInt(endStr, 10) : NaN;
    if (Number.isNaN(start)) {
      if (Number.isNaN(end) || end <= 0) return null;
      start = Math.max(0, totalLength - end);
      end = totalLength - 1;
    } else if (Number.isNaN(end)) {
      end = totalLength - 1;
    }
    if (start < 0 || start >= totalLength || end < start || end >= totalLength) return null;
    return { start, end };
  }).filter(Boolean);
}

// Deepgram returns punctuated tokens in `punctuated_word` (falls back to `word`). Chinese
// text isn't space-delimited, so we only insert a space between two non-CJK tokens (e.g.
// embedded Latin words / numbers) and never before punctuation.
const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;
function joinToken(prev, next) {
  if (!prev) return next;
  const a = prev[prev.length - 1];
  const b = next[0];
  if (CJK.test(a) || CJK.test(b)) return prev + next; // CJK on either side → no space
  if (/^[\s.,!?;:()\]}'"'"’”]/.test(next)) return prev + next; // leading punctuation
  return `${prev} ${next}`;
}

function wordsToSegments(words) {
  if (!words || words.length === 0) return [];
  const segments = [];
  let current = null;
  for (const w of words) {
    const token = w.punctuated_word ?? w.word ?? '';
    const speaker = `Speaker ${(w.speaker ?? 0) + 1}`;
    const wordObj = { word: token, start: w.start, end: w.end };
    if (!current || current.speaker !== speaker) {
      if (current) segments.push(current);
      current = { speaker, text: token, start: w.start, end: w.end, words: [wordObj] };
    } else {
      current.text = joinToken(current.text, token);
      current.end = w.end;
      current.words.push(wordObj);
    }
  }
  if (current) segments.push(current);
  return segments;
}

async function translateSegments(segments, sourceLang = 'zh') {
  if (!GEMINI_API_KEY || segments.length === 0) return segments;
  const texts = segments.map((s, i) => `[${i}] ${s.text}`).join('\n');
  if (!texts.trim()) return segments;

  // Learners always read English translations; name the source language properly so
  // Gemini isn't guessing (the old zh/en toggle sent non-Chinese audio to Chinese).
  const LANG_NAMES = { zh: 'Chinese', hi: 'Hindi', fr: 'French', es: 'Spanish', ar: 'Arabic', pt: 'Portuguese' };
  const targetName = 'English';
  const sourceName = LANG_NAMES[sourceLang] || 'Chinese';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: `You are a professional translator. Translate the following ${sourceName} text into ${targetName}. The text is provided line by line with an index like [0], [1]. Maintain the exact same number of lines and preserve the index prefix exactly as [0], [1] in your response.` }]
        },
        contents: [{ parts: [{ text: texts }] }]
      })
    });
    
    if (!res.ok) {
      console.error('[voice] Gemini translation failed HTTP', res.status);
      return segments;
    }
    const data = await res.json();
    const outText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    for (const line of outText.split('\n')) {
      const match = line.match(/^\[(\d+)\]\s*(.*)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (segments[idx]) {
          segments[idx].translation = match[2].trim();
        }
      }
    }
  } catch (e) {
    console.error('[voice] Gemini translation error:', e.message);
  }
  return segments;
}

// Shared high-accuracy pass. Takes a complete audio buffer (WebM/Opus) and returns
// diarized segments. Used by both the automatic final pass on stop and the manual
// Transcribe button. Engine-pluggable: model per language via langParams.js; a Whisper
// fallback could slot in here later (see plan, "Out of scope"). The joined segment text
// is the finalized utterance transcript the client posts to /api/scenario/evaluate —
// transcription only, no pass/fail judgment here.
async function batchTranscribe(audioBuffer, sourceLang = 'zh') {
  if (!DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY not configured');
  if (!audioBuffer || audioBuffer.length === 0) throw new Error('No audio data to transcribe');

  const response = await fetch(batchUrl(sourceLang), {
    method: 'POST',
    headers: {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': 'audio/webm',
    },
    body: audioBuffer,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Deepgram HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const dg = await response.json();
  const alt = dg.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) throw new Error('Deepgram returned no transcription results');
  const words = alt?.words || [];
  const hasSpeakerData = words.length > 0 && words.some(w => w.speaker != null);
  let segments = wordsToSegments(words);
  if (segments.length === 0 && alt?.transcript) {
    segments = [{ speaker: 'Speaker 1', text: alt.transcript, start: 0, end: 0, words: [{ word: alt.transcript, start: 0, end: 0 }] }];
  }
  if (!hasSpeakerData) {
    for (const s of segments) s.speaker = null;
  }
  
  segments = await translateSegments(segments, sourceLang);
  
  return segments;
}

export function mountVoiceRoutes(app, httpServer) {
  app.get('/api/voice/projects', (req, res) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
      const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
      res.json(listVoiceTree({ query: req.query.q, limit, offset }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/voice/projects/{*path}/audio', (req, res) => {
    try {
      const relPath = projectPath(req.params.path);
      const project = relPath ? getVoiceProject(relPath) : null;
      if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
      const loaded = loadVoiceAudio(relPath);
      if (!loaded) { res.status(404).json({ error: 'No audio data' }); return; }
      const { buf, contentType } = playbackAudioForProject(project, loaded.buf);
      res.set('Accept-Ranges', 'bytes');
      res.set('Content-Type', contentType);

      const rangeHeader = req.headers.range;
      if (!rangeHeader) {
        res.set('Content-Length', String(buf.length));
        res.send(buf);
        return;
      }

      const ranges = parseRangeHeader(rangeHeader, buf.length);
      if (!ranges || ranges.length === 0) {
        res.set('Content-Range', `bytes */${buf.length}`);
        res.status(416).end();
        return;
      }

      // Only support a single range; most audio clients request one at a time.
      const { start, end } = ranges[0];
      const chunk = buf.subarray(start, end + 1);
      res.status(206);
      res.set('Content-Range', `bytes ${start}-${end}/${buf.length}`);
      res.set('Content-Length', String(chunk.length));
      res.send(chunk);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/voice/projects/{*path}/transcribe', async (req, res) => {
    const relPath = projectPath(req.params.path);
    const project = relPath ? getVoiceProject(relPath) : null;

    sseHeaders(res);

    if (!project) { sseEmit(res, 'error', 'Project not found'); res.end(); return; }
    const loaded = loadVoiceAudio(relPath);
    if (!loaded) { sseEmit(res, 'error', 'No audio data to transcribe'); res.end(); return; }
    if (!DEEPGRAM_API_KEY) { sseEmit(res, 'error', 'DEEPGRAM_API_KEY not configured'); res.end(); return; }

    updateVoiceProject(relPath, { status: 'transcribing' });

    try {
      const sourceLang = project.sourceLang || 'zh';
      const segments = await batchTranscribe(loaded.buf, sourceLang);
      saveVoiceTranscript(relPath, segments);
      sseEmit(res, 'done', JSON.stringify({ text: segments.map(s => s.text).join('\n'), segments }));
    } catch (e) {
      try { updateVoiceProject(relPath, { status: 'error' }); } catch { /* ignore */ }
      sseEmit(res, 'error', e.message || 'Transcription failed');
    } finally {
      res.end();
    }
  });

  app.patch('/api/voice/projects/{*path}/move', (req, res) => {
    try {
      const relPath = projectPath(req.params.path);
      const current = relPath ? getVoiceProject(relPath) : null;
      if (!current) { res.status(404).json({ error: 'Project not found' }); return; }
      const folder_path = req.body?.folder_path ?? null;
      const project = moveVoiceProject(relPath, folder_path);
      if (!project) { res.status(500).json({ error: 'Failed to move project' }); return; }
      res.json({ project: sanitizeProject(project) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/voice/projects', (req, res) => {
    try {
      const name = String(req.body?.name ?? '').trim().slice(0, NAME_LIMIT);
      if (!name) { res.status(400).json({ error: 'A name is required' }); return; }
      const folder_path = req.body?.folder_path ?? null;
      const sourceLang = String(req.body?.sourceLang || 'zh');
      const project = createVoiceProject({ name, folderPath: folder_path, sourceLang });
      res.status(201).json({ project: sanitizeProject(project) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/voice/projects/{*path}', (req, res) => {
    try {
      const relPath = projectPath(req.params.path);
      const project = relPath ? getVoiceProject(relPath) : null;
      if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
      res.json({ project: sanitizeProject(project) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/voice/projects/{*path}', (req, res) => {
    try {
      let relPath = projectPath(req.params.path);
      let current = relPath ? getVoiceProject(relPath) : null;
      if (!current) { res.status(404).json({ error: 'Project not found' }); return; }

      if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim().slice(0, NAME_LIMIT);
        if (!name) { res.status(400).json({ error: 'A name is required' }); return; }
        const renamed = renameVoiceProject(relPath, name);
        if (!renamed) { res.status(500).json({ error: 'Failed to rename project' }); return; }
        relPath = renamed.id;
        current = renamed;
      }

      if (req.body?.status !== undefined) {
        if (!VALID_STATUSES.includes(req.body.status)) {
          res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
          return;
        }
        const updated = updateVoiceProject(relPath, { status: req.body.status });
        if (updated) current = updated;
      }

      if (req.body?.audio_data !== undefined) {
        const raw = String(req.body.audio_data);
        if (raw === '[object Object]' || raw.length < 4) {
          res.status(400).json({ error: 'Invalid audio data' });
          return;
        }
        const updated = saveVoiceAudio(relPath, raw);
        if (updated) current = updated;
      }

      const project = getVoiceProject(relPath);
      if (!project) { res.status(500).json({ error: 'Failed to update project' }); return; }
      res.json({ project: sanitizeProject(project) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/voice/projects/{*path}', (req, res) => {
    try {
      const relPath = projectPath(req.params.path);
      if (!relPath || !deleteVoiceProject(relPath)) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/voice/folders', (req, res) => {
    try {
      res.json({ tree: listVoiceTree({ query: req.query.q }).tree });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/voice/folders', (req, res) => {
    try {
      const name = String(req.body?.name ?? '').trim().slice(0, NAME_LIMIT);
      if (!name) { res.status(400).json({ error: 'A name is required' }); return; }
      const parent_path = req.body?.parent_path ?? null;
      const folderPath = parent_path ? `${parent_path}/${name}` : name;
      const folder = createVoiceFolder(folderPath);
      res.status(201).json({ folder });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/voice/folders/{*path}', (req, res) => {
    try {
      const relPath = projectPath(req.params.path);
      if (!relPath) { res.status(400).json({ error: 'Invalid folder path' }); return; }
      let folder = null;
      if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim().slice(0, NAME_LIMIT);
        if (!name) { res.status(400).json({ error: 'A name is required' }); return; }
        folder = renameVoiceFolder(relPath, name);
      }
      if (req.body?.parent_path !== undefined) {
        folder = moveVoiceFolder(folder?.id ?? relPath, req.body.parent_path);
      }
      if (!folder) {
        // No changes requested; return current.
        const all = listVoiceFolders();
        folder = all.find(f => f.id === relPath);
      }
      if (!folder) { res.status(500).json({ error: 'Failed to update folder' }); return; }
      res.json({ folder });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/voice/folders/{*path}', (req, res) => {
    try {
      const relPath = projectPath(req.params.path);
      if (!relPath) { res.status(400).json({ error: 'Invalid folder path' }); return; }
      const ok = deleteVoiceFolder(relPath);
      if (!ok) { res.status(409).json({ error: 'Folder is not empty' }); return; }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/voice/batch-delete', (req, res) => {
    try {
      const baseDir = getBaseDir();
      const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter(p => typeof p === 'string') : [];
      const deleted = [];
      const errors = [];
      for (const relPath of paths) {
        try {
          if (!relPath || relPath.includes('..') || path.isAbsolute(relPath)) {
            errors.push({ path: relPath, error: 'Invalid path' });
            continue;
          }
          const dir = path.join(baseDir, relPath);
          const relative = path.relative(baseDir, dir);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            errors.push({ path: relPath, error: 'Invalid path' });
            continue;
          }
          if (!fs.existsSync(dir)) {
            errors.push({ path: relPath, error: 'Not found' });
            continue;
          }
          fs.rmSync(dir, { recursive: true, force: true });
          deleted.push(relPath);
        } catch (err) {
          errors.push({ path: relPath, error: err.message });
        }
      }
      res.json({ deleted, errors });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/voice/batch-move', (req, res) => {
    try {
      const baseDir = getBaseDir();
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const moved = [];
      const errors = [];
      for (const item of items) {
        try {
          const relPath = item?.path;
          const folderPath = item?.folderPath ?? '';
          if (!relPath || relPath.includes('..') || path.isAbsolute(relPath)) {
            errors.push({ path: relPath, error: 'Invalid path' });
            continue;
          }
          const targetFolder = folderPath ? path.join(baseDir, folderPath) : baseDir;
          const relative = path.relative(baseDir, targetFolder);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            errors.push({ path: relPath, error: 'Invalid target folder' });
            continue;
          }
          if (!fs.existsSync(targetFolder)) {
            errors.push({ path: relPath, error: 'Target folder not found' });
            continue;
          }
          const sourceDir = path.join(baseDir, relPath);
          if (!fs.existsSync(sourceDir)) {
            errors.push({ path: relPath, error: 'Not found' });
            continue;
          }
          const name = path.basename(relPath);
          let destDir = path.join(targetFolder, name);
          let n = 1;
          while (fs.existsSync(destDir) && n < 10000) {
            destDir = path.join(targetFolder, `${name} (${n})`);
            n++;
          }
          fs.renameSync(sourceDir, destDir);
          moved.push({ oldPath: relPath, newPath: folderPath ? `${folderPath}/${path.basename(destDir)}` : path.basename(destDir) });
        } catch (err) {
          errors.push({ path: item?.path, error: err.message });
        }
      }
      res.json({ moved, errors });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Live transcription over a direct browser↔backend WebSocket -------------------
  // The browser streams raw WebM/Opus binary frames straight to us; we relay them to
  // Deepgram's streaming WS and push interim/provisional results back on the same socket
  // as JSON text frames. This removes the old 200ms HTTP-POST + base64 hop (IS-019).
  //
  // Client protocol:
  //   - binary frame            → audio chunk (relayed to Deepgram)
  //   - text {type:'stop', audio_b64} → end recording; we run the
  //     high-accuracy batch pass and reply with {type:'final', segments}.
  // Server → client messages (JSON text frames):
  //   {type:'ready'} | {type:'delta', text} | {type:'words', segments}
  //   {type:'refining'} | {type:'final', segments, text} | {type:'error', message}
  if (httpServer) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
      let url;
      try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
      const m = url.pathname.match(/^\/api\/voice\/projects\/(.+)\/live-ws$/);
      if (!m) return; // not ours — leave for any other upgrade handler
      const relPath = decodeURIComponent(m[1]);
      if (!relPath) { socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, (client) => attachLiveSession(client, relPath));
    });
  }

  function attachLiveSession(client, relPath) {
    const project = getVoiceProject(relPath);
    console.log('[voice] live-ws connected for project', relPath);
    if (!project) { sendJson(client, { type: 'error', message: 'Project not found' }); client.close(); return; }
    if (!DEEPGRAM_API_KEY) { sendJson(client, { type: 'error', message: 'DEEPGRAM_API_KEY not configured' }); client.close(); return; }

    const sourceLang = normalizeLang(project.sourceLang || 'zh');

    updateVoiceProject(relPath, { status: 'recording' });

    let replacedClient = null;
    const existing = liveSessions.get(relPath);
    if (existing) {
      replacedClient = existing.client;
      existing.finalizing = true; // suppress the old session's reconnect logic
      if (existing.keepAlive) clearInterval(existing.keepAlive);
      try { existing.dg.close(); } catch { /* ignore */ }
      liveSessions.delete(relPath);
    }

    const session = {
      dg: null,
      client,
      allWords: [],
      pendingAudio: [],
      keepAlive: null,
      reconnects: 0,
      readySent: false,
      finalizing: false,
    };
    liveSessions.set(relPath, session);

    // Connect (and on transient upstream drops, reconnect) to Deepgram. Losing a beat of
    // live captions is fine — the authoritative transcript is the batch pass on stop —
    // so a mid-recording drop buffers audio, retries with short backoff, and only
    // surfaces an error to the client once retries are exhausted.
    function connectDeepgram() {
      const dg = new WebSocket(liveUrl(sourceLang), { headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` } });
      session.dg = dg;
      console.log('[voice] Opening Deepgram live WS', session.reconnects > 0 ? `(reconnect ${session.reconnects})` : '');

      dg.on('open', () => {
        console.log('[voice] Deepgram live WS connected');
        while (session.pendingAudio.length && dg.readyState === WebSocket.OPEN) {
          dg.send(session.pendingAudio.shift());
        }
        // Deepgram closes a silent stream after ~10s; periodic KeepAlive frames cover
        // the open→first-chunk gap and any pause in speech.
        if (session.keepAlive) clearInterval(session.keepAlive);
        session.keepAlive = setInterval(() => {
          try {
            if (dg.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: 'KeepAlive' }));
          } catch { /* ignore */ }
        }, KEEPALIVE_INTERVAL_MS);

        if (session.readySent) return; // reconnect: the client-side recorder is already running
        session.readySent = true;
        sendJson(client, { type: 'ready' });
        // Notify the replaced client after the new connection is fully ready so
        // any newly attached listeners have a chance to receive the message.
        if (replacedClient) {
          const toNotify = replacedClient;
          replacedClient = null;
          setTimeout(() => {
            sendJson(toNotify, { type: 'error', message: 'This project was opened in another tab or window' });
          }, 0);
        }
      });

      dg.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type !== 'Results') return;
          const channel = msg.channel?.alternatives?.[0];
          if (!channel || !channel.transcript) return;
          const isFinal = msg.is_final || msg.speech_final;
          if (isFinal && channel.words?.length) {
            for (const w of channel.words) session.allWords.push(w);
            sendJson(client, { type: 'words', segments: wordsToSegments(session.allWords) });
          } else if (!isFinal) {
            sendJson(client, { type: 'delta', text: channel.transcript });
          }
        } catch { /* ignore parse errors */ }
      });

      dg.on('error', (err) => {
        // Transient network errors are followed by 'close', where reconnection is
        // decided — don't scare the client yet.
        console.error('[voice] Deepgram live WS error:', err.message || err);
      });
      dg.on('unexpected-response', (_req, res) => {
        // An HTTP rejection (bad key, bad params) will not heal by retrying.
        console.error('[voice] Deepgram unexpected response:', res.statusCode, res.statusMessage);
        session.reconnects = Infinity;
        sendJson(client, { type: 'error', message: `Deepgram HTTP ${res.statusCode}` });
      });
      dg.on('close', (code, reason) => {
        console.log('[voice] Deepgram live WS closed:', code, reason?.toString() || '');
        if (session.keepAlive) { clearInterval(session.keepAlive); session.keepAlive = null; }
        // Reconnect only if this session is still live: not finalized/replaced, still
        // the registered session, browser still connected, and this is the current socket.
        if (session.finalizing || liveSessions.get(relPath) !== session) return;
        if (session.dg !== dg || client.readyState !== WebSocket.OPEN) return;
        if (!shouldReconnect(session.reconnects)) {
          sendJson(client, { type: 'error', message: 'Deepgram connection error' });
          return;
        }
        const delay = reconnectDelayMs(session.reconnects);
        session.reconnects += 1;
        setTimeout(() => {
          if (session.finalizing || liveSessions.get(relPath) !== session) return;
          if (client.readyState !== WebSocket.OPEN) return;
          connectDeepgram();
        }, delay);
      });
    }

    connectDeepgram();

    client.on('message', async (data, isBinary) => {
      if (isBinary) {
        // Audio chunk → straight to Deepgram, no decoding. Buffer whenever the upstream
        // socket isn't OPEN — before the first connect completes AND across reconnects —
        // instead of dropping audio. The cap only guards runaway memory.
        const dg = session.dg;
        if (dg && dg.readyState === WebSocket.OPEN) dg.send(data);
        else if (session.pendingAudio.length < PENDING_AUDIO_MAX_CHUNKS) session.pendingAudio.push(Buffer.from(data));
        return;
      }
      // Text control message.
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'stop') {
        await finalizeLiveSession(relPath, msg);
      }
    });

    client.on('close', () => {
      console.log('[voice] live-ws client closed for project', relPath);
      if (session.keepAlive) { clearInterval(session.keepAlive); session.keepAlive = null; }
      try { if (session.dg && session.dg.readyState === WebSocket.OPEN) session.dg.close(); } catch { /* ignore */ }
      // Only drop the session if it's still the active one (finalize may already have run).
      if (liveSessions.get(relPath) === session) liveSessions.delete(relPath);
    });
  }

  // Run on 'stop': close the Deepgram stream, persist audio, then run the high-accuracy
  // batch pass and send the authoritative transcript back to the client.
  async function finalizeLiveSession(relPath, msg) {
    const session = liveSessions.get(relPath);
    if (!session) { console.log('[voice] stop: no session for', relPath); return; }
    const { dg, client } = session;
    session.finalizing = true; // stop any reconnect attempt from resurrecting the stream
    if (session.keepAlive) { clearInterval(session.keepAlive); session.keepAlive = null; }
    liveSessions.delete(relPath);

    if (dg && dg.readyState === WebSocket.OPEN) {
      try { dg.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* ignore */ }
    }
    setTimeout(() => { try { if (dg && dg.readyState === WebSocket.OPEN) dg.close(); } catch { /* ignore */ } }, 2000);

    const audioB64 = msg?.audio_b64 ? String(msg.audio_b64) : '';

    // Persist audio first so a failed batch pass is still recoverable via the Transcribe button.
    saveVoiceAudio(relPath, audioB64);
    sendJson(client, { type: 'refining' });

    try {
      const sourceLang = getVoiceProject(relPath)?.sourceLang || 'zh';
      const buf = audioB64 ? Buffer.from(audioB64, 'base64') : Buffer.alloc(0);
      const segments = await batchTranscribe(buf, sourceLang);
      saveVoiceTranscript(relPath, segments);
      console.log('[voice] batch final pass:', segments.length, 'segments');
      sendJson(client, { type: 'final', segments, text: segments.map(s => s.text).join('\n') });
    } catch (e) {
      console.error('[voice] batch final pass failed:', e.message);
      // Fall back to the provisional live segments so the user keeps *something*.
      const fallback = wordsToSegments(session.allWords);
      saveVoiceTranscript(relPath, fallback);
      sendJson(client, { type: 'final', segments: fallback, text: fallback.map(s => s.text).join('\n'), warning: 'Batch refine failed; showing live transcript' });
    }
  }

}

function sendJson(client, obj) {
  try { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(obj)); } catch { /* ignore */ }
}

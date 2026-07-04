// Optional pronunciation scoring behind the swappable interface from
// docs/contracts/speech-pipeline.md:
//
//   scorePronunciation(audio, lang, targetText) → { accuracy, fluency, completeness, perWord }
//
// Engine: Azure AI Speech pronunciation assessment (REST, short-audio endpoint), keys
// AZURE_SPEECH_KEY / AZURE_SPEECH_REGION from repo-root .env via config.js. Nothing in
// the main flow calls this yet — it exists for the prove-out harness
// (node/scripts/pronunciation-proveout.js). If adopted, its result becomes the optional
// `pronScore` arg to evaluateResponse; it is a secondary signal, never a gate.
//
// API shape read from learn.microsoft.com Azure AI Speech docs
// (rest-speech-to-text-short + how-to-pronunciation-assessment), 2026-07-04:
// POST {region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1
//   ?language={locale}&format=detailed
// with a base64-JSON `Pronunciation-Assessment` header; scores come back on NBest[0]
// either directly (AccuracyScore…) or under NBest[0].PronunciationAssessment — both
// shapes appear in the official docs, so both are handled.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AZURE_SPEECH_KEY, AZURE_SPEECH_REGION } from '../config.js';

// Locale per catalog language. Regional picks mirror the game's countries
// (Mexico, Egypt, Brazil) and the TTS locales already used client-side.
const LOCALES = {
  zh: 'zh-CN',
  hi: 'hi-IN',
  fr: 'fr-FR',
  es: 'es-MX',
  ar: 'ar-EG',
  pt: 'pt-BR',
};

export function isPronunciationScoringConfigured() {
  return Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION);
}

function isWavBuffer(buf) {
  return buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';
}

// The browser records WebM/Opus; Azure's short-audio REST endpoint wants WAV/PCM 16k
// mono. Same ffmpeg pattern as the playback normalizer in routes/voice.js.
function toWav16kMono(buf) {
  if (isWavBuffer(buf)) return buf;
  let dir = null;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'langtour-pron-'));
    const inputPath = path.join(dir, 'input');
    const outputPath = path.join(dir, 'output.wav');
    fs.writeFileSync(inputPath, buf);
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le',
      outputPath,
    ], { timeout: 30000, maxBuffer: 1024 * 1024 });
    return fs.readFileSync(outputPath);
  } finally {
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

// Both documented response shapes → the contract shape. Exported for tests.
export function parseAzureAssessment(data) {
  const status = data?.RecognitionStatus;
  if (status !== 'Success' && status !== 0) {
    throw new Error(`Azure recognition failed: ${status ?? 'no status'}`);
  }
  const best = data.NBest?.[0];
  if (!best) throw new Error('Azure returned no assessment (empty NBest)');
  const scores = best.PronunciationAssessment ?? best;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    accuracy: num(scores.AccuracyScore),
    fluency: num(scores.FluencyScore),
    completeness: num(scores.CompletenessScore),
    perWord: (best.Words ?? []).map(w => ({
      word: w.Word,
      accuracy: num(w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore),
    })),
  };
}

/**
 * Score how well `audio` pronounces `targetText` in `lang`.
 * @param {Buffer} audio      WebM/Opus or WAV audio of the utterance
 * @param {string} lang       catalog code: zh|hi|fr|es|ar|pt (unknown → throws, no coercion)
 * @param {string} targetText reference text the pronunciation is graded against
 * @returns {Promise<{accuracy:number, fluency:number, completeness:number, perWord:{word:string,accuracy:number}[]}>}
 */
export async function scorePronunciation(audio, lang, targetText, {
  fetchImpl = fetch,
  key = AZURE_SPEECH_KEY,
  region = AZURE_SPEECH_REGION,
} = {}) {
  if (!Buffer.isBuffer(audio) || audio.length === 0) throw new Error('audio must be a non-empty Buffer');
  const locale = LOCALES[String(lang || '').toLowerCase()];
  if (!locale) throw new Error(`Unsupported language for pronunciation scoring: ${lang}`);
  const reference = String(targetText ?? '').trim();
  if (!reference) throw new Error('targetText is required');
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured');

  const wav = toWav16kMono(audio);
  const assessment = Buffer.from(JSON.stringify({
    ReferenceText: reference,
    GradingSystem: 'HundredMark',
    Granularity: 'Word',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
  })).toString('base64');

  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`
    + `?language=${encodeURIComponent(locale)}&format=detailed`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Accept': 'application/json',
      'Pronunciation-Assessment': assessment,
    },
    body: wav,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Azure Speech HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return parseAzureAssessment(await res.json());
}

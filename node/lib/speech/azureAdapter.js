// Azure Cognitive Services Speech — Pronunciation Assessment adapter (contract 05, launch default)
//
// API: REST speech/recognition/conversation/cognitiveservices/v1
// Version note: REST API v1 (stable), read 2026-06-28 from
//   https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short
// We use the REST API directly rather than the npm SDK (microsoft-cognitiveservices-speech-sdk)
// to avoid native binary dependencies in a Railway/Node deployment.
//
// GradingSystem: HundredMark  → AccuracyScore / FluencyScore / CompletenessScore all 0..100.
// Granularity:   Word         → per-word scores from NBest[0].Words[].PronunciationAssessment.
// Dimension:     Comprehensive → includes both Accuracy and Fluency at utterance level.
//
// Supported MIME types for `audio`:
//   audio/wav (PCM 16 kHz, mono) — sent directly
//   audio/webm;codecs=opus       — converted to 16 kHz mono WAV by ffmpeg before the API call

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Engine5xxError } from './errors.js';

// BCP-47 base code → Azure locale. Reject anything not in this map so the caller
// gets a clear error instead of Azure silently returning garbage scores.
const LANG_LOCALES = {
  zh: 'zh-CN',
  fr: 'fr-FR',
  es: 'es-MX',
  hi: 'hi-IN',
  ar: 'ar-EG',
  pt: 'pt-BR',
};

// Total timeout for one Azure call (8s per contract 05). Covers the network round-trip
// but not the ffmpeg conversion (that uses its own 10s timeout).
const AZURE_TIMEOUT_MS = 8000;

// Time to wait before the single 429-retry (total budget ≤ 1.5s).
const RETRY_BACKOFF_MS = 750;

// WebM magic bytes: 0x1A 0x45 0xDF 0xA3 (EBML header)
function isWebm(buf) {
  return (
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  );
}

// Convert any audio buffer to 16 kHz mono PCM WAV for Azure.
// Uses ffmpeg (required runtime dep — same as the existing voice.js conversion path).
function toWav16k(buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-score-'));
  try {
    const inputPath = path.join(dir, 'input.webm');
    const outputPath = path.join(dir, 'output.wav');
    fs.writeFileSync(inputPath, buf);
    execFileSync(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-ac', '1', '-ar', '16000', '-f', 'wav', outputPath],
      { timeout: 10000 }
    );
    return fs.readFileSync(outputPath);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// Returns a resolved promise that rejects after `ms` milliseconds — combined with
// AbortController so the fetch itself is cancelled, not just the promise race.
function withTimeout(promise, signal) {
  return promise; // signal already wired into fetch options
}

// Single fetch with one 429-retry (up to 1.5s total backoff). Returns the Response or
// throws Engine5xxError on transient failure.
async function fetchWithRetry(url, options, { backoffMs = RETRY_BACKOFF_MS } = {}) {
  let res = await fetch(url, options);

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, backoffMs));
    // The original AbortController signal may still be valid; reuse the same options.
    res = await fetch(url, options);
    // If the second attempt is also 429, fall through to the 5xx handler below.
  }

  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => '');
    throw new Error(`Azure auth failure (${res.status}): ${body.slice(0, 200)}. Check AZURE_SPEECH_KEY.`);
  }

  if (res.status === 429 || res.status >= 500) {
    const body = await res.text().catch(() => '');
    throw new Engine5xxError(`Azure HTTP ${res.status}: ${body.slice(0, 120)}`);
  }

  return res;
}

// Parse the Azure response into a PronScore (0..100 scale).
// Scores live in NBest[0].PronunciationAssessment; word scores under NBest[0].Words.
function parseAzureResponse(data) {
  const best = Array.isArray(data.NBest) ? data.NBest[0] : data;
  const pa = best?.PronunciationAssessment ?? {};
  const words = best?.Words ?? [];

  const accuracy = typeof pa.AccuracyScore === 'number' ? pa.AccuracyScore : 0;
  const fluency = typeof pa.FluencyScore === 'number' ? pa.FluencyScore : 0;
  const completeness = typeof pa.CompletenessScore === 'number' ? pa.CompletenessScore : 0;

  const perWord = words
    .filter((w) => w && typeof w.Word === 'string')
    .map((w) => ({
      word: w.Word,
      score: typeof w.PronunciationAssessment?.AccuracyScore === 'number'
        ? w.PronunciationAssessment.AccuracyScore
        : 0,
    }));

  return { accuracy, fluency, completeness, perWord };
}

export const azureAdapter = {
  /**
   * Score pronunciation using Azure Cognitive Services Speech REST API.
   * @param {{ audio: Buffer, lang: string, targetText: string }} input
   * @returns {Promise<{ accuracy: number, fluency: number, completeness: number, perWord: Array<{word: string, score: number}> }>}
   */
  async scorePronunciation({ audio, lang, targetText }) {
    // Read keys at call-time so the adapter fails loudly if keys are missing,
    // rather than at module load (same "fail-loud at first use" pattern as config.js).
    const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || '';
    const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || '';
    if (!AZURE_SPEECH_KEY) throw new Error('AZURE_SPEECH_KEY is not configured');
    if (!AZURE_SPEECH_REGION) throw new Error('AZURE_SPEECH_REGION is not configured');

    const locale = LANG_LOCALES[lang];
    if (!locale) {
      throw new Error(
        `Azure adapter: unsupported lang "${lang}". Supported: ${Object.keys(LANG_LOCALES).join(', ')}`
      );
    }

    // Convert WebM/Opus to 16 kHz mono WAV if needed.
    const wavBuf = isWebm(audio) ? toWav16k(audio) : audio;

    const pronAssessment = {
      ReferenceText: targetText,
      GradingSystem: 'HundredMark',
      Granularity: 'Word',
      Dimension: 'Comprehensive',
      EnableMiscue: 'True',
    };
    const pronHeader = Buffer.from(JSON.stringify(pronAssessment)).toString('base64');

    const url =
      `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com` +
      `/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=${locale}&format=detailed`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AZURE_TIMEOUT_MS);

    try {
      const res = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': pronHeader,
            'Accept': 'application/json',
          },
          body: wavBuf,
          signal: controller.signal,
        }
      );

      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Engine5xxError(`Azure unexpected status ${res.status}: ${body.slice(0, 120)}`);
      }

      const data = await res.json();
      return parseAzureResponse(data);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        // A timeout is a transient failure — same class as 503/504. Throw Engine5xxError
        // so the dispatcher can fall back to GOPT rather than short-circuiting with a
        // zeroed sentinel here (which bypasses the fallback chain entirely).
        throw new Engine5xxError(`Azure timeout after ${AZURE_TIMEOUT_MS}ms`);
      }
      throw err;
    }
  },
};

// Exported for unit tests — allows injection of a different backoff without import side effects.
export { LANG_LOCALES, parseAzureResponse };

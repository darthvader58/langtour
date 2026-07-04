#!/usr/bin/env node
// Prove-out harness: Deepgram transcript vs Azure pronunciation scores, side by side.
// This is how the owner decides whether the Azure scorer earns a place in the main flow
// (docs/contracts/speech-pipeline.md). Nothing here touches the game.
//
// Usage:
//   node scripts/pronunciation-proveout.js <audio-file> <lang> "<target text>"
//   node scripts/pronunciation-proveout.js --manifest samples.json
//
// Manifest format: [{ "audio": "path.webm", "lang": "zh", "target": "你好" }, ...]
// Audio: anything ffmpeg reads (webm/opus from the recorder, wav, mp3...).
// Keys: DEEPGRAM_API_KEY, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION in repo-root .env.

import fs from 'node:fs';
import path from 'node:path';
import { DEEPGRAM_API_KEY } from '../lib/config.js';
import { batchUrl, isSupportedLang } from '../lib/voice/langParams.js';
import { scorePronunciation, isPronunciationScoringConfigured } from '../lib/voice/pronunciation.js';

async function deepgramTranscript(audio, lang) {
  if (!DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY not configured');
  const res = await fetch(batchUrl(lang), {
    method: 'POST',
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, 'Content-Type': 'application/octet-stream' },
    body: audio,
  });
  if (!res.ok) throw new Error(`Deepgram HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const dg = await res.json();
  return dg.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
}

function fmt(n) {
  return n == null ? ' n/a' : String(Math.round(n)).padStart(4);
}

async function runSample({ audio, lang, target }, index) {
  const buf = fs.readFileSync(audio);
  console.log(`\n=== Sample ${index + 1}: ${path.basename(audio)} [${lang}] ===`);
  console.log(`Target text : ${target}`);

  const [dgResult, azResult] = await Promise.allSettled([
    deepgramTranscript(buf, lang),
    scorePronunciation(buf, lang, target),
  ]);

  if (dgResult.status === 'fulfilled') {
    console.log(`Deepgram    : ${dgResult.value || '(empty transcript)'}`);
  } else {
    console.log(`Deepgram    : ERROR — ${dgResult.reason.message}`);
  }

  if (azResult.status === 'fulfilled') {
    const s = azResult.value;
    console.log(`Azure score : accuracy ${fmt(s.accuracy)}  fluency ${fmt(s.fluency)}  completeness ${fmt(s.completeness)}`);
    for (const w of s.perWord) console.log(`              ${fmt(w.accuracy)}  ${w.word}`);
  } else {
    console.log(`Azure score : ERROR — ${azResult.reason.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let samples;
  if (args[0] === '--manifest') {
    if (!args[1]) throw new Error('Usage: --manifest <samples.json>');
    samples = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  } else if (args.length === 3) {
    samples = [{ audio: args[0], lang: args[1], target: args[2] }];
  } else {
    console.log('Usage:\n  node scripts/pronunciation-proveout.js <audio-file> <lang> "<target text>"\n  node scripts/pronunciation-proveout.js --manifest samples.json');
    process.exit(1);
  }

  for (const s of samples) {
    if (!s.audio || !fs.existsSync(s.audio)) throw new Error(`Audio file not found: ${s.audio}`);
    if (!isSupportedLang(s.lang)) throw new Error(`Unsupported lang "${s.lang}" (zh|hi|fr|es|ar|pt)`);
    if (!s.target) throw new Error(`Missing target text for ${s.audio}`);
  }
  if (!isPronunciationScoringConfigured()) {
    console.warn('WARNING: AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set — Azure column will error.');
  }

  for (let i = 0; i < samples.length; i++) await runSample(samples[i], i);
  console.log('\nDone. Compare: does the Azure score add signal beyond what the Deepgram transcript + evaluator already catch?');
}

main().catch((e) => { console.error(e.message); process.exit(1); });

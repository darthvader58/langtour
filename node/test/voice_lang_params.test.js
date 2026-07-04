import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLang,
  isSupportedLang,
  supportedLangs,
  batchUrl,
  liveUrl,
  reconnectDelayMs,
  shouldReconnect,
  LIVE_MAX_RECONNECTS,
  KEEPALIVE_INTERVAL_MS,
  PENDING_AUDIO_MAX_CHUNKS,
} from '../lib/voice/langParams.js';

test('normalizeLang clamps unknown or missing codes to zh, accepts the catalog', () => {
  for (const l of ['zh', 'hi', 'fr', 'es', 'ar', 'pt']) assert.equal(normalizeLang(l), l);
  assert.equal(normalizeLang('ZH'), 'zh');
  assert.equal(normalizeLang('klingon'), 'zh');
  assert.equal(normalizeLang(''), 'zh');
  assert.equal(normalizeLang(undefined), 'zh');
  assert.equal(normalizeLang(null), 'zh');
});

test('isSupportedLang matches the six catalog languages only', () => {
  assert.deepEqual(supportedLangs(), ['zh', 'hi', 'fr', 'es', 'ar', 'pt']);
  assert.equal(isSupportedLang('ar'), true);
  assert.equal(isSupportedLang('en'), false);
  assert.equal(isSupportedLang(undefined), false);
});

test('batch model per language: nova-2 kept for zh, Arabic routed to nova-3 (nova-2 has no Arabic)', () => {
  assert.match(batchUrl('zh'), /model=nova-2/);
  assert.match(batchUrl('ar'), /model=nova-3/);
  for (const l of ['hi', 'fr', 'es', 'pt']) {
    assert.match(batchUrl(l), /model=nova-3/, `batch model for ${l}`);
  }
});

test('batch URL keeps punctuate + smart_format + diarize and the requested language', () => {
  for (const l of ['zh', 'hi', 'fr', 'es', 'ar', 'pt']) {
    const url = batchUrl(l);
    assert.match(url, /punctuate=true/);
    assert.match(url, /smart_format=true/);
    assert.match(url, /diarize=true/);
    assert.match(url, new RegExp(`language=${l}(&|$)`));
  }
  // Unknown language never reaches the URL — it is clamped, not passed through.
  assert.match(batchUrl('evil&param=1'), /language=zh(&|$)/);
});

test('live URL keeps the caption-critical params exactly (interim_results + utterance_end_ms>=1000)', () => {
  for (const l of ['zh', 'hi', 'fr', 'es', 'ar', 'pt']) {
    const url = liveUrl(l);
    assert.match(url, /^wss:\/\/api\.deepgram\.com\/v1\/listen\?/);
    assert.match(url, /model=nova-3/);
    assert.match(url, /interim_results=true/);
    assert.match(url, /utterance_end_ms=1000/);
    assert.match(url, /diarize=true/);
    assert.match(url, new RegExp(`language=${l}(&|$)`));
  }
});

test('reconnect schedule backs off, stays capped, and stops after LIVE_MAX_RECONNECTS', () => {
  assert.equal(reconnectDelayMs(0), 250);
  assert.equal(reconnectDelayMs(1), 500);
  assert.equal(reconnectDelayMs(2), 1000);
  assert.equal(reconnectDelayMs(10), 2000); // capped
  assert.equal(shouldReconnect(0), true);
  assert.equal(shouldReconnect(LIVE_MAX_RECONNECTS - 1), true);
  assert.equal(shouldReconnect(LIVE_MAX_RECONNECTS), false);
  assert.equal(shouldReconnect(Infinity), false); // unexpected-response poisons retries
});

test('keepalive fires well inside Deepgram 10s silence window; audio buffer is bounded', () => {
  assert.ok(KEEPALIVE_INTERVAL_MS < 10000);
  assert.ok(KEEPALIVE_INTERVAL_MS >= 1000);
  assert.ok(PENDING_AUDIO_MAX_CHUNKS > 0);
});

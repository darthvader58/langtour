import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePronunciation, parseAzureAssessment } from '../lib/voice/pronunciation.js';

// A minimal RIFF/WAVE header so scorePronunciation skips the ffmpeg conversion in tests.
function fakeWav() {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WAVE', 8, 'ascii');
  return buf;
}

// Azure "detailed" response with scores nested under PronunciationAssessment
// (how-to-pronunciation-assessment doc shape).
const NESTED_RESPONSE = {
  RecognitionStatus: 0,
  DisplayText: 'Hello.',
  NBest: [{
    Lexical: 'hello',
    PronunciationAssessment: { AccuracyScore: 99, FluencyScore: 100, CompletenessScore: 100, PronScore: 99.5 },
    Words: [
      { Word: 'hello', PronunciationAssessment: { AccuracyScore: 99, ErrorType: 'None' } },
    ],
  }],
};

// Alternate documented shape: scores directly on NBest[0] (rest-speech-to-text-short doc).
const FLAT_RESPONSE = {
  RecognitionStatus: 'Success',
  NBest: [{
    Lexical: 'good morning',
    AccuracyScore: 100, FluencyScore: 90.5, CompletenessScore: 100, PronScore: 95.1,
    Words: [
      { Word: 'good', AccuracyScore: 100, ErrorType: 'None' },
      { Word: 'morning', AccuracyScore: 81, ErrorType: 'None' },
    ],
  }],
};

function stubFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  return { impl, calls };
}

const CREDS = { key: 'test-key', region: 'eastus2' };

test('scorePronunciation returns exactly the contract shape from a nested Azure response', async () => {
  const { impl } = stubFetch(NESTED_RESPONSE);
  const result = await scorePronunciation(fakeWav(), 'zh', '你好', { fetchImpl: impl, ...CREDS });
  assert.deepEqual(Object.keys(result).sort(), ['accuracy', 'completeness', 'fluency', 'perWord']);
  assert.equal(result.accuracy, 99);
  assert.equal(result.fluency, 100);
  assert.equal(result.completeness, 100);
  assert.deepEqual(result.perWord, [{ word: 'hello', accuracy: 99 }]);
});

test('scorePronunciation handles the flat NBest score shape too', async () => {
  const { impl } = stubFetch(FLAT_RESPONSE);
  const result = await scorePronunciation(fakeWav(), 'fr', 'good morning', { fetchImpl: impl, ...CREDS });
  assert.equal(result.accuracy, 100);
  assert.equal(result.fluency, 90.5);
  assert.deepEqual(result.perWord, [
    { word: 'good', accuracy: 100 },
    { word: 'morning', accuracy: 81 },
  ]);
});

test('scorePronunciation targets the region short-audio endpoint with locale + assessment header', async () => {
  const { impl, calls } = stubFetch(NESTED_RESPONSE);
  await scorePronunciation(fakeWav(), 'ar', 'مرحبا', { fetchImpl: impl, ...CREDS });
  assert.equal(calls.length, 1);
  const { url, opts } = calls[0];
  assert.match(url, /^https:\/\/eastus2\.stt\.speech\.microsoft\.com\/speech\/recognition\/conversation\/cognitiveservices\/v1\?/);
  assert.match(url, /language=ar-EG/);
  assert.match(url, /format=detailed/);
  assert.equal(opts.headers['Ocp-Apim-Subscription-Key'], 'test-key');
  const assessment = JSON.parse(Buffer.from(opts.headers['Pronunciation-Assessment'], 'base64').toString('utf8'));
  assert.equal(assessment.ReferenceText, 'مرحبا');
  assert.equal(assessment.GradingSystem, 'HundredMark');
  assert.equal(assessment.Granularity, 'Word');
});

test('scorePronunciation rejects unknown languages instead of coercing', async () => {
  const { impl } = stubFetch(NESTED_RESPONSE);
  await assert.rejects(
    () => scorePronunciation(fakeWav(), 'en', 'hello', { fetchImpl: impl, ...CREDS }),
    /Unsupported language/,
  );
});

test('scorePronunciation validates audio, target text, and configuration', async () => {
  const { impl } = stubFetch(NESTED_RESPONSE);
  await assert.rejects(() => scorePronunciation(Buffer.alloc(0), 'zh', 'x', { fetchImpl: impl, ...CREDS }), /non-empty Buffer/);
  await assert.rejects(() => scorePronunciation('not-a-buffer', 'zh', 'x', { fetchImpl: impl, ...CREDS }), /non-empty Buffer/);
  await assert.rejects(() => scorePronunciation(fakeWav(), 'zh', '  ', { fetchImpl: impl, ...CREDS }), /targetText is required/);
  await assert.rejects(() => scorePronunciation(fakeWav(), 'zh', 'x', { fetchImpl: impl, key: '', region: '' }), /not configured/);
});

test('scorePronunciation surfaces HTTP and recognition failures', async () => {
  const bad = stubFetch({ error: 'nope' }, { ok: false, status: 401 });
  await assert.rejects(() => scorePronunciation(fakeWav(), 'zh', 'x', { fetchImpl: bad.impl, ...CREDS }), /Azure Speech HTTP 401/);

  const failed = stubFetch({ RecognitionStatus: 'InitialSilenceTimeout' });
  await assert.rejects(() => scorePronunciation(fakeWav(), 'zh', 'x', { fetchImpl: failed.impl, ...CREDS }), /Azure recognition failed/);
});

test('parseAzureAssessment tolerates missing word scores without inventing numbers', () => {
  const result = parseAzureAssessment({
    RecognitionStatus: 'Success',
    NBest: [{ AccuracyScore: 70, FluencyScore: 60, CompletenessScore: 50, Words: [{ Word: 'oui' }] }],
  });
  assert.deepEqual(result.perWord, [{ word: 'oui', accuracy: null }]);
  assert.equal(result.accuracy, 70);
});

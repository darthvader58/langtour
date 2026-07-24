// Turn-level pronunciation gate (node/lib/voice/turnPronunciation.js). The pure
// detection is tested directly; the async wrapper is tested with injected deps so
// no Azure call, filesystem, or store access happens here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMajorMispronunciations,
  assessTurnPronunciation,
  MAJOR_MISPRONUNCIATION_THRESHOLD,
} from '../lib/voice/turnPronunciation.js';

const words = (...exprs) => exprs.map((expression, i) => ({ id: i + 1, expression, meaning: `m${i}` }));
const score = (perWord) => ({ accuracy: 70, fluency: 70, completeness: 100, perWord });

test('threshold is the owner-set 35', () => {
  assert.equal(MAJOR_MISPRONUNCIATION_THRESHOLD, 35);
});

test('flags a target word attempted below the threshold', () => {
  const flagged = findMajorMispronunciations(
    score([{ word: 'bonjour', accuracy: 12 }]),
    words('bonjour', 'merci'),
  );
  assert.deepEqual(flagged, [{ expression: 'bonjour', accuracy: 12 }]);
});

test('an accent-level score (above threshold) is never flagged', () => {
  const flagged = findMajorMispronunciations(
    score([{ word: 'bonjour', accuracy: 61 }]),
    words('bonjour'),
  );
  assert.deepEqual(flagged, []);
});

test('the boundary is strict: exactly 35 passes', () => {
  const flagged = findMajorMispronunciations(
    score([{ word: 'merci', accuracy: 35 }]),
    words('merci'),
  );
  assert.deepEqual(flagged, []);
});

test('a target word the learner never said is not a mispronunciation (omission is the evaluator’s job)', () => {
  const flagged = findMajorMispronunciations(
    score([{ word: 'bonjour', accuracy: 90 }]),
    words('bonjour', 'aurevoir'),
  );
  assert.deepEqual(flagged, []);
});

test('a multi-token expression takes its weakest token’s accuracy', () => {
  // "आपका स्वागत है" → three tokens; one badly mangled is enough to flag.
  const flagged = findMajorMispronunciations(
    score([
      { word: 'आपका', accuracy: 88 },
      { word: 'स्वागत', accuracy: 9 },
      { word: 'है', accuracy: 80 },
    ]),
    words('आपका स्वागत है'),
  );
  assert.deepEqual(flagged, [{ expression: 'आपका स्वागत है', accuracy: 9 }]);
});

test('empty or missing perWord yields no flags', () => {
  assert.deepEqual(findMajorMispronunciations(score([]), words('bonjour')), []);
  assert.deepEqual(findMajorMispronunciations(null, words('bonjour')), []);
  assert.deepEqual(findMajorMispronunciations({}, words('bonjour')), []);
});

test('punctuation/case differences still match (normalized)', () => {
  const flagged = findMajorMispronunciations(
    score([{ word: 'Bonjour!', accuracy: 5 }]),
    words('bonjour'),
  );
  assert.deepEqual(flagged, [{ expression: 'bonjour', accuracy: 5 }]);
});

// --- assessTurnPronunciation: graceful degradation to null ---

const okAudio = () => ({ buf: Buffer.from('audio'), contentType: 'audio/webm' });

test('returns null when scoring is not configured', async () => {
  const out = await assessTurnPronunciation(
    { projectId: 'p1', langCode: 'fr', transcript: 'bonjour', targetWords: words('bonjour') },
    { configured: () => false, loadAudio: okAudio, score: async () => score([]) },
  );
  assert.equal(out, null);
});

test('returns null when there is no projectId', async () => {
  const out = await assessTurnPronunciation(
    { projectId: undefined, langCode: 'fr', transcript: 'bonjour', targetWords: words('bonjour') },
    { configured: () => true, loadAudio: okAudio, score: async () => score([]) },
  );
  assert.equal(out, null);
});

test('returns null when the project has no stored audio', async () => {
  const out = await assessTurnPronunciation(
    { projectId: 'p1', langCode: 'fr', transcript: 'bonjour', targetWords: words('bonjour') },
    { configured: () => true, loadAudio: () => null, score: async () => score([]) },
  );
  assert.equal(out, null);
});

test('a thrown loader (e.g. traversal-rejected path) degrades to null, not a crash', async () => {
  const out = await assessTurnPronunciation(
    { projectId: '../../etc', langCode: 'fr', transcript: 'bonjour', targetWords: words('bonjour') },
    { configured: () => true, loadAudio: () => { throw new Error('outside base'); }, score: async () => score([]) },
  );
  assert.equal(out, null);
});

test('an engine error degrades to null (Deepgram-only fallback)', async () => {
  const out = await assessTurnPronunciation(
    { projectId: 'p1', langCode: 'fr', transcript: 'bonjour', targetWords: words('bonjour') },
    { configured: () => true, loadAudio: okAudio, score: async () => { throw new Error('Azure 429'); } },
  );
  assert.equal(out, null);
});

test('happy path returns the score and detected mispronunciations', async () => {
  const out = await assessTurnPronunciation(
    { projectId: 'p1', langCode: 'fr', transcript: 'je vais au match', targetWords: words('bonjour') },
    {
      configured: () => true,
      loadAudio: okAudio,
      score: async () => score([{ word: 'bonjour', accuracy: 10 }]),
    },
  );
  assert.equal(out.pronScore.accuracy, 70);
  assert.deepEqual(out.majorMispronunciations, [{ expression: 'bonjour', accuracy: 10 }]);
});

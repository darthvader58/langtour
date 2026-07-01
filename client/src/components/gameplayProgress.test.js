import { describe, it, expect } from 'vitest';
import { deriveProgress, detectNewWordIds, normalizeWord } from './gameplayProgress.js';

// ── deriveProgress ─────────────────────────────────────────────────────────

describe('deriveProgress', () => {
  it('returns 0% when nothing is attested yet', () => {
    const result = deriveProgress(0, [{ id: 1 }, { id: 2 }]);
    expect(result).toEqual({ attestedCount: 0, windowSize: 2, progressPct: 0 });
  });

  it('returns 25% for 1 of 4 words attested', () => {
    const result = deriveProgress(1, [{ id: 2 }, { id: 3 }, { id: 4 }]);
    expect(result).toEqual({ attestedCount: 1, windowSize: 4, progressPct: 25 });
  });

  it('returns 100% when all words are attested', () => {
    const result = deriveProgress(4, []);
    expect(result).toEqual({ attestedCount: 4, windowSize: 4, progressPct: 100 });
  });

  it('handles an empty window gracefully (zero division)', () => {
    const result = deriveProgress(0, []);
    expect(result).toEqual({ attestedCount: 0, windowSize: 0, progressPct: 0 });
  });

  it('rounds the percentage to a whole number', () => {
    // 1 attested, 2 remaining → 1/3 ≈ 33%
    const { progressPct } = deriveProgress(1, [{ id: 2 }, { id: 3 }]);
    expect(progressPct).toBe(33);
  });

  it('handles a null/undefined currentTargetWords gracefully', () => {
    const result = deriveProgress(2, null);
    expect(result).toEqual({ attestedCount: 2, windowSize: 2, progressPct: 100 });
  });
});

// ── detectNewWordIds ───────────────────────────────────────────────────────

describe('detectNewWordIds', () => {
  it('detects words added to the window', () => {
    const prev = [{ id: 1 }, { id: 2 }];
    const next = [{ id: 2 }, { id: 3 }, { id: 4 }];
    const newIds = detectNewWordIds(prev, next);
    expect(newIds).toEqual(new Set([3, 4]));
  });

  it('returns an empty set when no new words appear', () => {
    const prev = [{ id: 1 }, { id: 2 }];
    const next = [{ id: 1 }, { id: 2 }];
    expect(detectNewWordIds(prev, next)).toEqual(new Set());
  });

  it('treats all words as new when prev is empty', () => {
    const next = [{ id: 1 }, { id: 2 }];
    expect(detectNewWordIds([], next)).toEqual(new Set([1, 2]));
  });

  it('returns empty set when next is empty', () => {
    const prev = [{ id: 1 }];
    expect(detectNewWordIds(prev, [])).toEqual(new Set());
  });

  it('ignores words without an id field', () => {
    const prev = [{ id: 1 }];
    const next = [{ expression: 'hello' }, { id: 2 }]; // first has no id
    const newIds = detectNewWordIds(prev, next);
    expect(newIds).toEqual(new Set([2])); // the no-id word is skipped
  });

  it('handles null/undefined arrays gracefully', () => {
    expect(detectNewWordIds(null, null)).toEqual(new Set());
    expect(detectNewWordIds(undefined, [{ id: 5 }])).toEqual(new Set([5]));
  });
});

// ── normalizeWord ──────────────────────────────────────────────────────────

describe('normalizeWord', () => {
  it('reads from growing-target shape (expression/reading/meaning)', () => {
    const w = { id: 1, expression: '你好', reading: 'nǐ hǎo', meaning: 'hello' };
    expect(normalizeWord(w)).toEqual({ expr: '你好', reading: 'nǐ hǎo', meaning: 'hello' });
  });

  it('reads from discovery alias shape (zh/pinyin/en)', () => {
    const w = { id: 2, zh: '谢谢', pinyin: 'xiè xiè', en: 'thank you' };
    expect(normalizeWord(w)).toEqual({ expr: '谢谢', reading: 'xiè xiè', meaning: 'thank you' });
  });

  it('expression takes precedence over zh', () => {
    const w = { expression: 'winner', zh: 'loser' };
    expect(normalizeWord(w).expr).toBe('winner');
  });

  it('handles a word with no reading or meaning gracefully', () => {
    const w = { expression: '猫' };
    expect(normalizeWord(w)).toEqual({ expr: '猫', reading: '', meaning: '' });
  });

  it('handles a completely empty object', () => {
    expect(normalizeWord({})).toEqual({ expr: '', reading: '', meaning: '' });
  });
});

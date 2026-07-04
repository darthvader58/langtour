import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TARGET_WORDS,
  MIN_TARGET_WORDS,
  computeAdaptiveCap,
  computeGrowth,
  initialTargetSize,
  isScenarioComplete,
} from '../lib/graph/growth.js';

test('adaptive cap stays inside [MIN, MAX] and scales with pace', () => {
  const slow = computeAdaptiveCap({ essentialCount: 8, passRate: 0 });
  const mid = computeAdaptiveCap({ essentialCount: 8, passRate: 0.6 });
  const fast = computeAdaptiveCap({ essentialCount: 8, passRate: 0.9 });
  assert.equal(slow, 4);
  assert.equal(mid, 5);
  assert.equal(fast, 6);
  assert.ok(slow >= MIN_TARGET_WORDS && fast <= MAX_TARGET_WORDS);
  // Small situations never inflate past their essential vocabulary.
  assert.equal(computeAdaptiveCap({ essentialCount: 3, passRate: 1 }), 3);
  // Garbage input clamps to the floor instead of exploding.
  assert.equal(computeAdaptiveCap({}), MIN_TARGET_WORDS);
});

test('scenarios start small: 3 words, 4 for a fast player, never above cap', () => {
  assert.equal(initialTargetSize({ adaptiveCap: 6, passRate: 0 }), 3);
  assert.equal(initialTargetSize({ adaptiveCap: 6, passRate: 0.8 }), 4);
  assert.equal(initialTargetSize({ adaptiveCap: 3, passRate: 0.8 }), 3);
});

test('target set does not grow until most of it is used', () => {
  const growth = computeGrowth({ targetWordIds: [1, 2, 3, 4], usedWordIds: [1, 2], adaptiveCap: 8 });
  assert.equal(growth.shouldGrow, false);
  assert.equal(growth.growBy, 0);
  assert.equal(growth.targetSize, 4);
  assert.equal(growth.usedCount, 2);
});

test('target set grows in small steps once 75% is used, clamped to the cap', () => {
  const growth = computeGrowth({ targetWordIds: [1, 2, 3, 4], usedWordIds: [1, 2, 3], adaptiveCap: 8 });
  assert.equal(growth.shouldGrow, true);
  assert.equal(growth.growBy, 2);
  assert.equal(growth.targetSize, 6);

  const nearCap = computeGrowth({ targetWordIds: [1, 2, 3, 4], usedWordIds: [1, 2, 3, 4], adaptiveCap: 5 });
  assert.equal(nearCap.growBy, 1);
  assert.equal(nearCap.targetSize, 5);

  const atCap = computeGrowth({ targetWordIds: [1, 2, 3, 4], usedWordIds: [1, 2, 3, 4], adaptiveCap: 4 });
  assert.equal(atCap.shouldGrow, false);
  assert.equal(atCap.targetSize, 4);
});

test('used words outside the target set never count toward growth', () => {
  const growth = computeGrowth({ targetWordIds: [1, 2, 3, 4], usedWordIds: [7, 8, 9], adaptiveCap: 8 });
  assert.equal(growth.usedCount, 0);
  assert.equal(growth.shouldGrow, false);
});

test('turn goal: complete only when grown to cap AND every target word used', () => {
  // Below cap: even full usage does not complete (the set still has to grow).
  assert.equal(isScenarioComplete({ targetWordIds: [1, 2, 3], usedWordIds: [1, 2, 3], adaptiveCap: 5 }), false);
  // At cap but a word unused: not complete.
  assert.equal(isScenarioComplete({ targetWordIds: [1, 2, 3, 4, 5], usedWordIds: [1, 2, 3, 4], adaptiveCap: 5 }), false);
  // At cap and all used: complete.
  assert.equal(isScenarioComplete({ targetWordIds: [1, 2, 3, 4, 5], usedWordIds: [1, 2, 3, 4, 5], adaptiveCap: 5 }), true);
});

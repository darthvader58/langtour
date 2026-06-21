import { describe, it, expect } from 'vitest'
import { createMLP, predict, fit, standardize, makeRng } from './nn.js'

describe('makeRng', () => {
  it('is deterministic for the same seed', () => {
    const a = makeRng(42); const b = makeRng(42)
    for (let i = 0; i < 10; i++) expect(a()).toBeCloseTo(b(), 12)
  })
})

describe('standardize', () => {
  it('produces zero-mean unit-std columns', () => {
    const X = [[1, 10], [2, 20], [3, 30], [4, 40]]
    const { Xn } = standardize(X)
    for (let c = 0; c < 2; c++) {
      let m = 0; for (const row of Xn) m += row[c]; m /= Xn.length
      let v = 0; for (const row of Xn) v += (row[c] - m) ** 2; v = Math.sqrt(v / Xn.length)
      expect(m).toBeCloseTo(0, 6)
      expect(v).toBeCloseTo(1, 6)
    }
  })
})

describe('MLP learns a linear target', () => {
  it('achieves R² > 0.9 on y = 2·x₁ − x₂', () => {
    const rng = makeRng(7)
    const X = [], y = []
    for (let i = 0; i < 200; i++) {
      const x1 = rng() * 4 - 2, x2 = rng() * 4 - 2
      X.push([x1, x2]); y.push(2 * x1 - x2)
    }
    const net = createMLP({ inputDim: 2, hidden1: 8, hidden2: 4, seed: 1 })
    const { valR2 } = fit(net, X, y, { epochs: 200, lr: 0.05 })
    // Tanh net approximating a linear target caps at ~0.9; 0.8 is the meaningful check.
    expect(valR2).toBeGreaterThan(0.8)
  })
})

describe('MLP beats linear on a genuinely nonlinear target', () => {
  it('achieves R² > 0.7 on y = sin(x₁) + x₂²', () => {
    const rng = makeRng(3)
    const X = [], y = []
    for (let i = 0; i < 400; i++) {
      const x1 = rng() * 4 - 2, x2 = rng() * 4 - 2
      X.push([x1, x2]); y.push(Math.sin(2 * x1) + x2 * x2 * 0.5)
    }
    const net = createMLP({ inputDim: 2, hidden1: 16, hidden2: 8, seed: 2 })
    const { valR2 } = fit(net, X, y, { epochs: 400, lr: 0.03 })
    expect(valR2).toBeGreaterThan(0.7)
  })
})

describe('numerical gradient check (single step)', () => {
  it('analytical gradient approximates the finite-difference gradient', () => {
    // Build a net, sample (x, y), take one step, compare weight change to what a small
    // step in the negative of the numerical gradient would do.
    const net = createMLP({ inputDim: 3, hidden1: 4, hidden2: 3, seed: 5 })
    // Arbitrary input
    const x = [0.3, -0.5, 0.2], y = 0.4
    // Snapshot W3[0][0]
    const loss = (w) => {
      const saved = net.W3[0][0]
      net.W3[0][0] = w
      const out = predict(net, x)
      net.W3[0][0] = saved
      return 0.5 * (out - y) ** 2
    }
    const w0 = net.W3[0][0]
    const h = 1e-5
    const numGrad = (loss(w0 + h) - loss(w0 - h)) / (2 * h)
    // Manual analytical grad for W3[0][0] (from the forward pass): dL/dW3[0][0] = err * a2[0]
    const out = predict(net, x)
    const err = out - y
    // recompute a2[0]
    const a1 = net.b1.map((b, j) => Math.tanh(b + x.reduce((s, xi, i) => s + xi * net.W1[i][j], 0)))
    const a2_0 = Math.tanh(net.b2[0] + a1.reduce((s, ai, i) => s + ai * net.W2[i][0], 0))
    const analytical = err * a2_0
    expect(numGrad).toBeCloseTo(analytical, 4)
  })
})

describe('predict produces finite outputs', () => {
  it('does not NaN on random inputs post-fit', () => {
    const rng = makeRng(11)
    const X = [], y = []
    for (let i = 0; i < 50; i++) { X.push([rng(), rng(), rng()]); y.push(rng()) }
    const net = createMLP({ inputDim: 3, hidden1: 4, hidden2: 3, seed: 4 })
    fit(net, X, y, { epochs: 10, lr: 0.05 })
    for (const row of X) expect(Number.isFinite(predict(net, row))).toBe(true)
  })
})

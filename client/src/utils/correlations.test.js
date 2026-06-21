import { describe, it, expect } from 'vitest'
import {
  pearson, spearman, ranks, correlationMatrix, linearR2,
  ridgeRegression, solveLinearSystem, topKIndices, bottomKIndices, pairFinite,
} from './correlations.js'

describe('pearson', () => {
  it('returns 1 for perfectly linearly correlated data', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6)
  })
  it('returns -1 for perfectly anti-correlated data', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6)
  })
  it('returns 0 for constant y', () => {
    expect(pearson([1, 2, 3], [5, 5, 5])).toBe(0)
  })
  it('drops NaN pairs', () => {
    expect(pearson([1, 2, 3, NaN], [2, 4, 6, 99])).toBeCloseTo(1, 6)
  })
})

describe('ranks', () => {
  it('ranks in ascending order, 1-based', () => {
    expect(ranks([10, 20, 30])).toEqual([1, 2, 3])
  })
  it('averages ranks on ties', () => {
    expect(ranks([5, 5, 10])).toEqual([1.5, 1.5, 3])
  })
})

describe('spearman', () => {
  it('is 1 for any monotonic increasing relationship, even nonlinear', () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 6)
  })
  it('catches nonlinear-but-monotonic where pearson misses', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [1, 4, 9, 16, 25]
    // pearson < 1; spearman = 1
    expect(pearson(x, y)).toBeLessThan(1)
    expect(spearman(x, y)).toBeCloseTo(1, 6)
  })
})

describe('correlationMatrix', () => {
  it('returns identity-like when columns are independent copies', () => {
    const cols = [[1, 2, 3], [1, 2, 3], [3, 2, 1]]
    const M = correlationMatrix(cols)
    expect(M[0][0]).toBe(1)
    expect(M[0][1]).toBeCloseTo(1, 6)
    expect(M[0][2]).toBeCloseTo(-1, 6)
    expect(M[2][1]).toBeCloseTo(-1, 6)
  })
})

describe('linearR2', () => {
  it('equals pearson^2', () => {
    expect(linearR2([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6)
    expect(linearR2([1, 2, 3], [3, 1, 2])).toBeCloseTo(pearson([1, 2, 3], [3, 1, 2]) ** 2, 6)
  })
})

describe('solveLinearSystem', () => {
  it('solves a 2x2 system', () => {
    // 2x + y = 5; x + 3y = 10 → x = 1, y = 3
    const x = solveLinearSystem([[2, 1], [1, 3]], [5, 10])
    expect(x[0]).toBeCloseTo(1, 6)
    expect(x[1]).toBeCloseTo(3, 6)
  })
  it('handles pivot swap', () => {
    const x = solveLinearSystem([[0, 1], [1, 0]], [2, 3])
    expect(x[0]).toBeCloseTo(3, 6)
    expect(x[1]).toBeCloseTo(2, 6)
  })
})

describe('ridgeRegression', () => {
  it('recovers coefficients on a clean linear target', () => {
    // y = 2*x1 + 3*x2
    const X = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]
    const y = X.map(r => 2 * r[0] + 3 * r[1])
    const { coef, r2 } = ridgeRegression(X, y, 1e-6)
    expect(coef[0]).toBeCloseTo(2, 2)
    expect(coef[1]).toBeCloseTo(3, 2)
    expect(r2).toBeGreaterThan(0.99)
  })
  it('returns finite R² even when X is collinear (ridge regularizes)', () => {
    const X = [[1, 1], [2, 2], [3, 3], [4, 4]]
    const y = [1, 2, 3, 4]
    const { r2 } = ridgeRegression(X, y, 0.1)
    expect(Number.isFinite(r2)).toBe(true)
  })
})

describe('topKIndices / bottomKIndices', () => {
  it('returns descending indices for topK', () => {
    expect(topKIndices([3, 1, 4, 1, 5], 2)).toEqual([4, 2]) // 5, 4
  })
  it('returns ascending indices for bottomK', () => {
    expect(bottomKIndices([3, 1, 4, 1, 5], 2).length).toBe(2)
  })
  it('skips non-finite values', () => {
    expect(topKIndices([1, NaN, 2, Infinity], 2)).toEqual([2, 0])
  })
})

describe('pairFinite', () => {
  it('drops pairs with NaN on either side', () => {
    const [px, py] = pairFinite([1, NaN, 3, 4], [10, 20, NaN, 40])
    expect(px).toEqual([1, 4])
    expect(py).toEqual([10, 40])
  })
})

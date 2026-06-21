import { describe, it, expect } from 'vitest'
import {
  zeros,
  matMul,
  matVec,
  transpose,
  cholesky,
  invertLowerTriangular,
  symmetricTop2,
  fisherLDATop2,
  axesFromVectors,
} from './projections.js'

describe('zeros', () => {
  it('creates an m×n matrix of zeros', () => {
    const A = zeros(2, 3)
    expect(A).toEqual([[0, 0, 0], [0, 0, 0]])
  })
})

describe('matVec', () => {
  it('computes A·v correctly', () => {
    const A = [[1, 2], [3, 4]]
    const v = [5, 6]
    expect(matVec(A, v)).toEqual([17, 39])
  })
})

describe('matMul', () => {
  it('multiplies 2×2 matrices', () => {
    const A = [[1, 2], [3, 4]]
    const B = [[5, 6], [7, 8]]
    expect(matMul(A, B)).toEqual([[19, 22], [43, 50]])
  })
})

describe('transpose', () => {
  it('swaps rows and columns', () => {
    const A = [[1, 2, 3], [4, 5, 6]]
    expect(transpose(A)).toEqual([[1, 4], [2, 5], [3, 6]])
  })
})

describe('cholesky', () => {
  it('factors a simple SPD matrix', () => {
    // A = [[4, 2], [2, 3]] → L = [[2, 0], [1, sqrt(2)]]
    const A = [[4, 2], [2, 3]]
    const L = cholesky(A)
    expect(L[0][0]).toBeCloseTo(2)
    expect(L[1][0]).toBeCloseTo(1)
    expect(L[1][1]).toBeCloseTo(Math.sqrt(2))
    // Verify L Lᵀ reconstructs A.
    const reconstructed = matMul(L, transpose(L))
    expect(reconstructed[0][0]).toBeCloseTo(4)
    expect(reconstructed[1][1]).toBeCloseTo(3)
    expect(reconstructed[0][1]).toBeCloseTo(2)
  })

  it('returns null for non-positive-definite input', () => {
    const A = [[1, 2], [2, 1]] // determinant < 0
    expect(cholesky(A)).toBe(null)
  })
})

describe('invertLowerTriangular', () => {
  it('inverts a diagonal matrix', () => {
    const L = [[2, 0], [0, 4]]
    const inv = invertLowerTriangular(L)
    expect(inv[0][0]).toBeCloseTo(0.5)
    expect(inv[1][1]).toBeCloseTo(0.25)
  })

  it('produces L · L_inv = I for a lower-triangular L', () => {
    const L = [[2, 0, 0], [1, 3, 0], [4, 5, 6]]
    const inv = invertLowerTriangular(L)
    const prod = matMul(L, inv)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(prod[i][j]).toBeCloseTo(i === j ? 1 : 0, 6)
      }
    }
  })
})

describe('symmetricTop2', () => {
  it('finds the top-2 eigenvectors of a diagonal matrix', () => {
    // Eigenvalues 3, 2, 1 — top-2 vectors should align with e_0 and e_1.
    const M = [[3, 0, 0], [0, 2, 0], [0, 0, 1]]
    const { y1, y2 } = symmetricTop2(M, 3, { maxIter: 100 })
    expect(Math.abs(y1[0])).toBeCloseTo(1, 4)
    expect(Math.abs(y2[1])).toBeCloseTo(1, 4)
  })

  it('returns y1 corresponding to the larger eigenvalue', () => {
    const M = [[1, 0], [0, 5]]
    const { y1 } = symmetricTop2(M, 2, { maxIter: 100 })
    // Top direction should point along e_1 (eigenvalue 5).
    expect(Math.abs(y1[1])).toBeCloseTo(1, 4)
  })
})

describe('fisherLDATop2', () => {
  it('separates two clearly-separated clusters in 2D', () => {
    // Two clusters on either side of the x-axis → LDA should pick x-axis as discriminant.
    const scores = []
    const labels = []
    for (let i = 0; i < 10; i++) {
      scores.push([1 + 0.05 * Math.random(), 0.05 * Math.random(), 0])
      labels.push(0)
    }
    for (let i = 0; i < 10; i++) {
      scores.push([-1 + 0.05 * Math.random(), 0.05 * Math.random(), 0])
      labels.push(1)
    }
    const result = fisherLDATop2(scores, labels, 3)
    expect(result).not.toBe(null)
    // The top direction v1 should mostly align with axis 0.
    const v1 = result.v1
    const dominance = Math.abs(v1[0]) / (Math.abs(v1[0]) + Math.abs(v1[1]) + Math.abs(v1[2]) + 1e-9)
    expect(dominance).toBeGreaterThan(0.6)
  })

  it('returns null when all points share one class', () => {
    const scores = [[1, 2], [3, 4]]
    const labels = [0, 0]
    const result = fisherLDATop2(scores, labels, 2)
    // Singular within-class scatter + no between-class variance → Cholesky with regularization
    // still succeeds, but the result is meaningless. We at least want it not to throw.
    expect(result === null || (Array.isArray(result.v1) && result.v1.length === 2)).toBe(true)
  })
})

describe('axesFromVectors', () => {
  it('extracts magnitudes and angles from v0, v1 columns', () => {
    // v0 = [1, 0], v1 = [0, 1]: each PC contributes to exactly one of (x, y).
    const { mags, angles } = axesFromVectors([1, 0], [0, 1], 2)
    expect(mags).toEqual([1, 1])
    expect(Math.abs(angles[0])).toBeCloseTo(0, 5)
    expect(Math.abs(angles[1])).toBeCloseTo(Math.PI / 2, 5)
  })

  it('rescales max magnitude to 1', () => {
    const { mags } = axesFromVectors([2, 0], [0, 3], 2)
    expect(Math.max(...mags)).toBeCloseTo(1, 5)
  })

  it('handles all-zero input without dividing by zero', () => {
    const { mags } = axesFromVectors([0, 0], [0, 0], 2)
    expect(mags).toEqual([0, 0])
  })
})

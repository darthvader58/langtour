import { describe, it, expect } from 'vitest'
import { VIRIDIS_STOPS, gradientColor, DEFAULT_POINT_COLOR } from './colormap.js'

describe('gradientColor', () => {
  it('maps t=0 to the first stop exactly', () => {
    expect(gradientColor(0)).toBe('rgb(68,1,84)')
  })

  it('maps t=1 to the last stop exactly', () => {
    expect(gradientColor(1)).toBe('rgb(253,231,37)')
  })

  it('clamps negative t to the first stop', () => {
    expect(gradientColor(-0.5)).toBe('rgb(68,1,84)')
  })

  it('clamps t>1 to the last stop', () => {
    expect(gradientColor(2)).toBe('rgb(253,231,37)')
  })

  it('interpolates linearly between stops', () => {
    // Halfway between t=0 and t=0.25 should land midway between stops[0] and stops[1].
    const half = gradientColor(0.125)
    expect(half).toBe('rgb(64,42,112)')
  })

  it('returns rgb(...) format strings', () => {
    expect(gradientColor(0.5)).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })
})

describe('VIRIDIS_STOPS', () => {
  it('starts at t=0 and ends at t=1', () => {
    expect(VIRIDIS_STOPS[0][0]).toBe(0)
    expect(VIRIDIS_STOPS[VIRIDIS_STOPS.length - 1][0]).toBe(1)
  })

  it('is monotonically increasing in t', () => {
    for (let i = 1; i < VIRIDIS_STOPS.length; i++) {
      expect(VIRIDIS_STOPS[i][0]).toBeGreaterThan(VIRIDIS_STOPS[i - 1][0])
    }
  })
})

describe('DEFAULT_POINT_COLOR', () => {
  it('is a hex string', () => {
    expect(DEFAULT_POINT_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

import { describe, expect, it } from 'vitest'
import { validatePassword, passwordStrength } from './passwordPolicy'

describe('validatePassword', () => {
  it('rejects an empty password on every check', () => {
    const { ok, checks } = validatePassword('')
    expect(ok).toBe(false)
    expect(checks).toEqual({ length: false, lower: false, upper: false, digit: false })
  })

  it('treats undefined/null the same as empty', () => {
    expect(validatePassword(undefined).ok).toBe(false)
    expect(validatePassword(null).ok).toBe(false)
  })

  it('fails length at 7 characters even with every class present', () => {
    const { ok, checks } = validatePassword('Ab1defg')
    expect(checks.length).toBe(false)
    expect(checks.lower).toBe(true)
    expect(checks.upper).toBe(true)
    expect(checks.digit).toBe(true)
    expect(ok).toBe(false)
  })

  it('passes at exactly 8 characters with all three classes', () => {
    const { ok, checks } = validatePassword('Ab1defgh')
    expect(checks.length).toBe(true)
    expect(ok).toBe(true)
  })

  it('fails when missing the uppercase class', () => {
    const { ok, checks } = validatePassword('ab1defgh')
    expect(checks.upper).toBe(false)
    expect(ok).toBe(false)
  })

  it('fails when missing the lowercase class', () => {
    const { ok, checks } = validatePassword('AB1DEFGH')
    expect(checks.lower).toBe(false)
    expect(ok).toBe(false)
  })

  it('fails when missing the digit class', () => {
    const { ok, checks } = validatePassword('Abcdefgh')
    expect(checks.digit).toBe(false)
    expect(ok).toBe(false)
  })

  it('does not count unicode letters as ascii upper/lower classes', () => {
    // Ω (U+03A9) is a letter but outside the a-z/A-Z ranges the Supabase
    // required-characters preset checks — must not be miscounted, even
    // though the string is long enough and has a digit.
    const { ok, checks } = validatePassword('Ω1Ω2Ω3Ω4')
    expect(checks.length).toBe(true)
    expect(checks.digit).toBe(true)
    expect(checks.lower).toBe(false)
    expect(checks.upper).toBe(false)
    expect(ok).toBe(false)
  })

  it('passes a longer unicode-containing password once ascii classes are present', () => {
    const { ok } = validatePassword('Cafe123é-AbcDef')
    expect(ok).toBe(true)
  })
})

describe('passwordStrength', () => {
  it('is 0 for an empty password', () => {
    expect(passwordStrength('')).toBe(0)
  })

  it('is 0 for a short password missing classes', () => {
    expect(passwordStrength('abc')).toBe(0)
  })

  it('gives partial credit below the length minimum with two-plus classes', () => {
    expect(passwordStrength('Ab1')).toBe(1)
  })

  it('is 2 for a password that just barely satisfies the full policy', () => {
    expect(passwordStrength('Ab1defgh')).toBe(2)
  })

  it('is 3 for a long password with all three classes', () => {
    expect(passwordStrength('Ab1defghijkl')).toBe(3)
  })

  it('never exceeds 3', () => {
    expect(passwordStrength('A'.repeat(40) + 'b1')).toBeLessThanOrEqual(3)
  })
})

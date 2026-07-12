// Single source of truth for the client-side password policy. Must stay in
// exact agreement with the Supabase Auth "lowercase, uppercase, digits"
// required-characters preset (see docs/contracts/auth-hardening.md) — this
// module is UX only, the server enforces the real policy.

const LOWER_RE = /[a-z]/
const UPPER_RE = /[A-Z]/
const DIGIT_RE = /[0-9]/
const MIN_LENGTH = 8

export function validatePassword(pw) {
  const value = pw ?? ''
  const checks = {
    length: value.length >= MIN_LENGTH,
    lower: LOWER_RE.test(value),
    upper: UPPER_RE.test(value),
    digit: DIGIT_RE.test(value),
  }
  return { ok: Object.values(checks).every(Boolean), checks }
}

// 0..3 meter for UI feedback only. Points: +1 for meeting the minimum
// length, +1 for having at least two of the three character classes, +1 for
// having all three classes AND a length comfortably past the minimum (12+).
// A password that barely satisfies the policy (8 chars, one of each class)
// lands at 2/3 — full marks are reserved for meaningfully longer passwords.
export function passwordStrength(pw) {
  const value = pw ?? ''
  if (!value) return 0

  const { checks } = validatePassword(value)
  const classCount = [checks.lower, checks.upper, checks.digit].filter(Boolean).length

  let score = 0
  if (checks.length) score += 1
  if (classCount >= 2) score += 1
  if (classCount >= 3 && value.length >= 12) score += 1

  return score
}

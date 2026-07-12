# Contract: email/password signup hardening

Status: FROZEN 2026-07-11 (orchestrator). Scope: the non-Google-OAuth path.
Today the only rule is a client-side `minLength={6}` on AuthModal.jsx — nothing
is enforced server-side. Professional-game bar: policy enforced by Supabase
Auth config, mirrored client-side for UX, plus a real reset-password flow.

Owners: frontend-story implements the client (AuthModal, useProfile, new
`client/src/auth/passwordPolicy.js`); security-economy writes the server-side
settings checklist and reviews. Neither edits the other's files.

## Password policy (single source of truth)

- Minimum **8** characters.
- Must contain at least one lowercase letter, one uppercase letter, one digit.
  (Matches the Supabase Auth "lowercase, uppercase, digits" required-characters
  preset — the dashboard setting and the client validator must agree exactly.)
- Leaked-password protection (HaveIBeenPwned) ON server-side; client shows the
  Supabase error verbatim when a breached password is rejected.

## Client (frontend-story)

1. `client/src/auth/passwordPolicy.js` — pure module + vitest spec:
   `validatePassword(pw) → { ok, checks: { length, lower, upper, digit } }`
   and `passwordStrength(pw) → 0..3` for the meter. AuthModal renders the
   checklist live; submit disabled until `ok` (sign-up mode only).
2. Sign-up adds a **confirm password** field (must match before submit) and a
   show/hide toggle on password inputs.
3. **Forgot password**: "Forgot password?" link in sign-in mode →
   `supabase.auth.resetPasswordForEmail(email, { redirectTo })`; handle the
   `PASSWORD_RECOVERY` event in useProfile → show a set-new-password view →
   `supabase.auth.updateUser({ password })` (same policy validation).
4. **No account enumeration**: sign-up and reset flows show the same neutral
   "check your email" message regardless of whether the address exists; never
   branch UI on "user already registered" (surface Supabase's message only for
   hard errors like rate limits).
5. Keep `autoComplete` hints (`new-password` / `current-password` / `email`).

## Server (security-economy — owner-actioned dashboard checklist)

Supabase Auth settings are dashboard/Management-API config, not migrations.
Deliverable: `docs/security/auth-hardening-checklist.md` with the exact
toggles + values (password min length 8, required-characters preset,
leaked-password protection, email confirmation required, OTP/link expiry,
auth rate limits, redirect-URL allowlist for the Railway origin), plus a
review pass over the client diff for enumeration leaks and any
`user_metadata`-based authorization (display-only use is fine).

## Invariants

- Client validation is UX only; enforcement is Supabase Auth config. Nothing
  economy-related changes; no new RPCs; RLS untouched.

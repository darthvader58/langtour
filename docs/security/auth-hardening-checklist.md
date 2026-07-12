# Supabase Auth hardening — owner checklist

Server-side settings for the email/password signup hardening (contract:
`docs/contracts/auth-hardening.md`, FROZEN). These are Supabase **dashboard /
Management-API** config, not SQL — no migration ships for this ticket. Values
below are the single source of truth; the client validator mirrors them for UX
only. Apply against the production project, then repeat for any staging project.

Verified against current Supabase docs via Context7 (`/supabase/supabase`,
Auth password-security + rate_limit config), 2026-07-11.

## 1. Auth → Providers → Email

- **Enable Email provider**: ON.
- **Confirm email**: ON — user must click the confirmation link before first
  sign-in. (This is also what closes the sign-up enumeration hole; see Review
  R2. With it ON, `signUp` on an already-registered address returns an
  obfuscated user + no session + no error, so the client's neutral
  "check your email" message is the only thing shown.)
- **Secure email change**: ON (require confirmation on both old and new
  address).
- **Minimum password length**: **8**.
- **Required characters**: select the **"Lowercase, uppercase letters and
  digits"** preset (`abcdefghijklmnopqrstuvwxyz`,
  `ABCDEFGHIJKLMNOPQRSTUVWXYZ`, `0123456789`). Must match
  `client/src/auth/passwordPolicy.js` exactly — lower + upper + digit, no
  symbol requirement. Do not pick the symbols preset unless the client
  validator is updated in the same change.
- **Leaked password protection (HaveIBeenPwned)**: **ON**. Supabase checks
  the Pwned Passwords API and rejects breached passwords; the client surfaces
  Supabase's error verbatim.

## 2. Auth → Rate Limits

Defaults (per Supabase config; per-IP unless noted). For a public game these
are mostly fine — the only real constraint is email throughput (see Owner
action O1):

| Limit | Default | Keep / change |
|-------|---------|---------------|
| Sign in / sign up | 30 per 5 min per IP | keep |
| Token refresh | 150 per 5 min per IP | keep |
| OTP / magic-link verification | 30 per 5 min per IP | keep |
| Emails sent | project-wide, low on the built-in SMTP (a few/hour) | **raise only after custom SMTP** — see O1 |

Do not raise sign-in/sign-up above the default without a reason; the low cap is
brute-force/credential-stuffing protection. Tighten (lower) only if you see
abuse. Leave OTP verification at 30/5min.

## 3. Auth → Email templates / expiry

- **OTP / email-link expiry**: **3600 s (1 hour)** or less. Supabase's own
  security advisor flags any value **> 1 hour**; keep confirmation and
  recovery links short-lived. 15–60 min is sensible for a game.
- **OTP length**: 6 digits (default) is fine.
- Password-recovery link uses the same mailer expiry — 1 hour max.

## 4. Auth → URL Configuration (redirect allowlist)

The client passes `window.location.origin` (+ pathname) as `emailRedirectTo`
(sign-up) and `redirectTo` (password reset). Any redirect target **not** on the
allowlist is silently dropped and the user is bounced to the Site URL — so both
origins must be listed.

- **Site URL**: the Railway production origin, e.g.
  `https://<your-app>.up.railway.app` (or the custom domain, if one is
  attached — use whichever the app is actually served from; it is single-origin
  API + client).
- **Redirect URLs (allowlist)** — add both:
  - `https://<your-app>.up.railway.app/**`  (prod; wildcard path because the
    client sends `origin + pathname`)
  - `http://localhost:5173/**`  (Vite dev default port)
  - If a custom domain is used, add `https://<custom-domain>/**` too.

Use the `/**` wildcard so any in-app path works; do not add bare
`http://localhost` without a port or a broad `https://*` — keep the list tight.

## 5. Google OAuth (unchanged, listed for completeness)

The Google provider path is out of scope for this ticket and unchanged. Just
ensure the same two origins are present in the redirect allowlist (they are,
per section 4) so the OAuth `redirectTo` resolves.

---

# Review — current auth code

Findings severity-ordered. **No code was changed** (frontend agent owns the
client diff in parallel); these are for the owner's pre-merge scan and to drive
regression coverage.

**R1 — Client password rule contradicts the frozen policy (Medium, frontend-owned).**
`client/src/components/AuthModal.jsx:90` still has `minLength={6}` and the
placeholder "At least 6 characters". The frozen policy is 8 + lower/upper/digit.
This is UX-only (server config is the real gate), and the frontend agent is
replacing it with the `passwordPolicy.js` checklist — but until that lands, the
UX undersells the requirement and a 6-char password would be rejected by the
server with a confusing error. Confirm the frontend change reconciles this.

**R2 — Sign-up account-enumeration depends on "Confirm email" being ON (Medium).**
`useProfile.js:113-124` shows the neutral "Check your email to confirm your
account" only when `!data.session`. That neutral behavior holds **only** if
Confirm-email is ON server-side (section 1): with it OFF, `signUp` on an
existing address returns an error and `setAuthError` would surface
"User already registered", leaking account existence. The mitigation is
entirely the section-1 toggle. The client also never branches UI on
"already registered", which is correct per the contract — keep it that way.

**R3 — "Email not confirmed" sign-in error is a soft enumeration signal (Low).**
`signInWithEmail` (`useProfile.js:105-111`) surfaces Supabase's `error.message`
verbatim. For a wrong password Supabase returns the generic
"Invalid login credentials" (good, no leak), but for an unconfirmed account it
returns "Email not confirmed", which confirms the address is registered. Low
severity (an attacker still can't sign in), but if you want zero enumeration,
have the client map that specific case to the same neutral copy. Frontend call;
noted for their contract.

**R4 — JWT verification is real, not a bare decode (PASS).**
`node/lib/auth.js` calls `db.auth.getUser(token)` on the service-role client.
supabase-js `getUser(jwt)` round-trips the token to the GoTrue `/auth/v1/user`
endpoint, which validates signature + expiry server-side and returns the user —
it is **not** a local, unverified decode. `req.userId` is therefore trustworthy.
The admin path (`node/routes/profile.js`, `scenario.js`) derives identity from
`db.auth.admin.getUserById` / the verified token and compares the email to
`ADMIN_EMAIL` server-side — never from the request body. No change needed; add
a regression test that a forged/tampered Bearer token yields 401.

**R5 — No authorization path reads `user_metadata` (PASS, one informational note).**
All `user_metadata` reads are display-only:
`client/src/LandingPage.jsx:237-238` (avatar/name),
`client/src/components/profile/profileModel.js:11` (`displayIdentity`),
`node/lib/profile/history.js:12` (profile header). Admin/authorization uses the
server-verified email vs `ADMIN_EMAIL`, not metadata. Informational:
`user_metadata` is user-writable via `updateUser`, so display name/avatar are
attacker-controllable for their *own* profile only; React escapes the text so
there is no injection. Do not ever route an authz decision through
`user_metadata` or `app_metadata` read on the client. Keep a test asserting
`isAdmin` cannot be forced from the client (the `/api/scenario/admin-complete`
re-check already guards this server-side).

**R6 — Client `isAdmin` is display-only (PASS).**
`useProfile.js:65-72` sets `isAdmin` from `/api/profile/progress` best-effort;
it only toggles the admin-skip UI. The actual completion route re-checks
identity server-side, so a spoofed client `isAdmin` grants nothing. No change.

---

# Owner action beyond the dashboard checklist

- **O1 — Production SMTP.** Supabase's built-in email sender is rate-limited to
  a handful of messages/hour and is explicitly "for testing only". A public
  game with confirmation-required sign-up **will** throttle real users on the
  built-in sender. Configure a custom SMTP provider (Resend/Postmark/SES/etc.)
  in Auth → SMTP Settings before launch, then raise the `email_sent` rate limit
  (section 2) to match the provider's allowance. This is required for
  Confirm-email (section 1) to be usable at scale.
- **O2 — Confirm the production origin.** Fill the real Railway origin / custom
  domain into sections 4's Site URL + Redirect URLs. The `<your-app>` and
  `<custom-domain>` placeholders above must be replaced with the actual host the
  app is served from.
- **O3 — Regression tests to request from QA** (per the adversarial-pass rule):
  a tampered/expired Bearer token returns 401 (R4); a client cannot force
  `isAdmin` / reach `record_scenario_completion` without a server-confirmed pass
  (R5/R6). These are backend tests; the enumeration copy (R2/R3) is a
  frontend/contract concern.

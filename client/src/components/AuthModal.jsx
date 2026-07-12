import { useMemo, useState } from 'react'
import { validatePassword, passwordStrength } from '../auth/passwordPolicy'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.53l3.35-2.61Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  )
}

const INPUT_CLASS = 'mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 pr-11 text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-300/60'

// Shared password input with a show/hide toggle — used for sign-in, sign-up,
// confirm-password, and the set-new-password view.
function PasswordField({ label, value, onChange, autoComplete, placeholder, required = true }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block text-sm text-white/65">
      {label}
      <span className="relative mt-1.5 block">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required={required}
          autoComplete={autoComplete}
          className={INPUT_CLASS}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wide text-white/40 transition-colors hover:text-white"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  )
}

const STRENGTH_LABELS = ['Too weak', 'Weak', 'Good', 'Strong']
const STRENGTH_COLORS = ['bg-red-400', 'bg-orange-400', 'bg-yellow-300', 'bg-emerald-400']

function StrengthMeter({ password }) {
  const score = passwordStrength(password)
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 flex-1 rounded-full transition-colors ${segment < score ? STRENGTH_COLORS[score] : 'bg-white/10'}`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-white/40">{password ? STRENGTH_LABELS[score] : 'Password strength'}</p>
    </div>
  )
}

const CHECK_LABELS = [
  ['length', 'At least 8 characters'],
  ['lower', 'A lowercase letter'],
  ['upper', 'An uppercase letter'],
  ['digit', 'A number'],
]

function PolicyChecklist({ checks }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {CHECK_LABELS.map(([key, label]) => (
        <li
          key={key}
          className={`flex items-center gap-1.5 transition-colors ${checks[key] ? 'text-emerald-300' : 'text-white/35'}`}
        >
          <span aria-hidden="true">{checks[key] ? '✓' : '○'}</span>
          {label}
        </li>
      ))}
    </ul>
  )
}

// The set-new-password view rendered once Supabase's PASSWORD_RECOVERY event
// fires (see useProfile). It replaces the whole modal body — there is no
// sign-in/sign-up chrome to show while a recovery session is active.
function SetNewPasswordView({ loading, error, message, onSubmit }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const { ok, checks } = useMemo(() => validatePassword(password), [password])
  const matches = confirm.length > 0 && password === confirm
  const canSubmit = ok && matches && !loading

  function handleSubmit(event) {
    event.preventDefault()
    if (canSubmit) onSubmit(password)
  }

  return (
    <>
      <h2 className="font-display text-2xl font-semibold">Choose a new password</h2>
      <p className="mt-1 text-sm text-white/50">
        Set a new password for your account to finish resetting it.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <div>
          <PasswordField
            label="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="Your new password"
          />
          <StrengthMeter password={password} />
          <PolicyChecklist checks={checks} />
        </div>
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          placeholder="Type it again"
        />
        {confirm.length > 0 && !matches && (
          <p className="text-xs text-red-300">Passwords don't match.</p>
        )}

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        {message && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center rounded-2xl border-2 border-cyan-400 bg-cyan-300 hover:bg-cyan-200 px-4 py-2 font-display text-sm font-extrabold uppercase tracking-widest text-slate-950 transition-all shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Please wait…' : 'Save new password'}
        </button>
      </form>
    </>
  )
}

export default function AuthModal({
  loading,
  error,
  message,
  onClose,
  onGoogle,
  onEmailSignIn,
  onEmailSignUp,
  onForgotPassword,
  isPasswordRecovery = false,
  onUpdatePassword,
}) {
  const [mode, setMode] = useState('sign-in') // 'sign-in' | 'sign-up' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const { ok: policyOk, checks } = useMemo(() => validatePassword(password), [password])
  const passwordsMatch = mode !== 'sign-up' || (confirmPassword.length > 0 && password === confirmPassword)
  const canSubmitSignUp = policyOk && passwordsMatch

  function handleSubmit(event) {
    event.preventDefault()
    if (mode === 'sign-up') {
      if (canSubmitSignUp) onEmailSignUp(email, password)
    } else {
      onEmailSignIn(email, password)
    }
  }

  function handleForgotSubmit(event) {
    event.preventDefault()
    onForgotPassword(email)
  }

  function switchMode(next) {
    setMode(next)
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/70 px-3 py-3 backdrop-blur-md sm:items-center sm:px-4 sm:py-6">
      <div className="relative w-full max-w-md rounded-[1.5rem] border border-white/15 bg-[#10131c]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:rounded-3xl sm:p-7">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-4 text-2xl text-white/45 transition-colors hover:text-white"
            aria-label="Close sign-in dialog"
          >
            ×
          </button>
        )}

        {isPasswordRecovery ? (
          <SetNewPasswordView loading={loading} error={error} message={message} onSubmit={onUpdatePassword} />
        ) : mode === 'forgot' ? (
          <>
            <h2 className="font-display text-2xl font-semibold">Reset your password</h2>
            <p className="mt-1 text-sm text-white/50">
              Enter your email and we'll send a link to reset your password.
            </p>

            <form onSubmit={handleForgotSubmit} className="mt-6 space-y-3">
              <label className="block text-sm text-white/65">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-300/60"
                  placeholder="you@example.com"
                />
              </label>

              {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
              {message && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p>}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-2xl border-2 border-cyan-400 bg-cyan-300 hover:bg-cyan-200 px-4 py-2 font-display text-sm font-extrabold uppercase tracking-widest text-slate-950 transition-all shadow-md disabled:cursor-wait disabled:opacity-50"
              >
                {loading ? 'Please wait…' : 'Send reset link'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => switchMode('sign-in')}
              className="mt-5 w-full text-sm text-white/55 transition-colors hover:text-white"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-semibold">
              {mode === 'sign-up' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Sign in to save your LangCoins and progress.
            </p>

            <button
              type="button"
              onClick={onGoogle}
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white hover:bg-slate-100 px-4 py-2 font-display text-sm font-extrabold uppercase tracking-widest text-slate-900 transition-all shadow-md disabled:opacity-50 disabled:pointer-events-none"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-white/30">
              <span className="h-px flex-1 bg-white/10" />
              or use email
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-sm text-white/65">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-300/60"
                  placeholder="you@example.com"
                />
              </label>

              {mode === 'sign-up' ? (
                <div>
                  <PasswordField
                    label="Password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Create a password"
                  />
                  <StrengthMeter password={password} />
                  <PolicyChecklist checks={checks} />
                </div>
              ) : (
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Your password"
                />
              )}

              {mode === 'sign-up' && (
                <div>
                  <PasswordField
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Type it again"
                  />
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="mt-1.5 text-xs text-red-300">Passwords don't match.</p>
                  )}
                </div>
              )}

              {mode === 'sign-in' && onForgotPassword && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="block text-xs text-white/45 transition-colors hover:text-white"
                >
                  Forgot password?
                </button>
              )}

              {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
              {message && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p>}

              <button
                type="submit"
                disabled={loading || (mode === 'sign-up' && !canSubmitSignUp)}
                className="flex w-full items-center justify-center rounded-2xl border-2 border-cyan-400 bg-cyan-300 hover:bg-cyan-200 px-4 py-2 font-display text-sm font-extrabold uppercase tracking-widest text-slate-950 transition-all shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
              className="mt-5 w-full text-sm text-white/55 transition-colors hover:text-white"
            >
              {mode === 'sign-up' ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

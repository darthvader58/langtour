import { useState } from 'react'

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

export default function AuthModal({
  loading,
  error,
  message,
  onClose,
  onGoogle,
  onEmailSignIn,
  onEmailSignUp,
}) {
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (mode === 'sign-up') onEmailSignUp(email, password)
    else onEmailSignIn(email, password)
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-3xl border border-white/15 bg-[#10131c]/95 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
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

        <h2 className="font-display text-2xl font-semibold">
          {mode === 'sign-up' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Sign in to save your tokens and progress.
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
          <label className="block text-sm text-white/65">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-300/60"
              placeholder="At least 6 characters"
            />
          </label>

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          {message && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-2xl border-2 border-cyan-400 bg-cyan-300 hover:bg-cyan-200 px-4 py-2 font-display text-sm font-extrabold uppercase tracking-widest text-slate-950 transition-all shadow-md disabled:cursor-wait disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')}
          className="mt-5 w-full text-sm text-white/55 transition-colors hover:text-white"
        >
          {mode === 'sign-up' ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </div>
    </div>
  )
}

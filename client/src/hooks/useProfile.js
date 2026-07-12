import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authFetch } from '../api'

// Anti-enumeration copy (docs/contracts/auth-hardening.md, invariant 4): the
// same neutral message is shown for sign-up/reset regardless of whether the
// address is registered, and specific Supabase errors that would otherwise
// leak "this account exists" are mapped to a generic one below.
const NEUTRAL_CHECK_EMAIL_MESSAGE = 'Check your email for a link to continue.'
const GENERIC_LOGIN_ERROR = 'Invalid login credentials.'

export function useProfile() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [unlockedCountries, setUnlockedCountries] = useState([])
  const [completedScenarios, setCompletedScenarios] = useState([])
  // Country-scoped completions: engine scenario ids are shared across every
  // country ('greetings' exists for cn, fr, in, ...), so a plain scenario-id
  // membership check can never be country-safe. This carries country_code
  // alongside scenario_id for checks that need to stay scoped to one country
  // (storyGate.js's arrival gate).
  const [completions, setCompletions] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [gameStateLoading, setGameStateLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  // Set once Supabase's PASSWORD_RECOVERY auth event fires (the user landed
  // here via a reset-password email link). Drives AuthModal to swap to the
  // set-new-password view instead of sign-in/sign-up.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const loadGameState = useCallback(async (sessionUser) => {
    if (!supabase || !sessionUser) {
      setProfile(null)
      setUnlockedCountries([])
      setCompletedScenarios([])
      setCompletions([])
      setIsAdmin(false)
      setGameStateLoading(false)
      return
    }

    setGameStateLoading(true)
    try {
      const [profileResult, unlocksResult, completionsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            user_id, tokens, experience_points, rank_id,
            rank:ranks!profiles_rank_id_fkey(id, code, name, minimum_xp, display_order)
          `)
          .eq('user_id', sessionUser.id)
          .single(),
        supabase.from('country_unlocks').select('country_code').eq('user_id', sessionUser.id),
        supabase.from('scenario_completions').select('country_code,scenario_id').eq('user_id', sessionUser.id),
      ])

      if (profileResult.error) console.error('Unable to load Supabase profile:', profileResult.error.message)
      else setProfile(profileResult.data)

      if (unlocksResult.error) console.error('Unable to load country unlocks:', unlocksResult.error.message)
      else setUnlockedCountries((unlocksResult.data ?? []).map((row) => row.country_code))

      if (completionsResult.error) {
        console.error('Unable to load scenario completions:', completionsResult.error.message)
      } else {
        const rows = completionsResult.data ?? []
        setCompletedScenarios(rows.map((row) => row.scenario_id))
        setCompletions(rows.map((row) => ({ countryCode: row.country_code, scenarioId: row.scenario_id })))
      }
    } finally {
      setGameStateLoading(false)
    }

    // Admin status is server-computed (email === ADMIN_EMAIL). Best-effort: a
    // failure just hides the admin-only skip and never blocks gameplay.
    try {
      const res = await authFetch('/api/profile/progress')
      setIsAdmin(res.ok ? Boolean((await res.json()).isAdmin) : false)
    } catch {
      setIsAdmin(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return undefined

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message)
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)
      loadGameState(sessionUser)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY fires instead of SIGNED_IN when the session came
      // from a reset-password email link — the user isn't "logged in" for
      // gameplay yet, they're mid-reset. Surface that as UI state so the
      // caller can render the set-new-password view instead of the game.
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        setAuthError(''); setAuthMessage('')
      }
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      loadGameState(sessionUser)
      setAuthLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [loadGameState])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) { setAuthError('Supabase is not configured.'); return }
    setAuthError(''); setAuthMessage(''); setAuthLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    })
    if (error) { setAuthError(error.message); setAuthLoading(false) }
  }, [])

  const signInWithEmail = useCallback(async (email, password) => {
    if (!supabase) { setAuthError('Supabase is not configured.'); return }
    setAuthError(''); setAuthMessage(''); setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      // "email_not_confirmed" only fires for a registered address, so it
      // must not read differently from a wrong-password/unknown-address
      // failure — both collapse to the same generic copy.
      setAuthError(error.code === 'email_not_confirmed' ? GENERIC_LOGIN_ERROR : error.message)
    }
    setAuthLoading(false)
  }, [])

  const signUpWithEmail = useCallback(async (email, password) => {
    if (!supabase) { setAuthError('Supabase is not configured.'); return }
    setAuthError(''); setAuthMessage(''); setAuthLoading(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    })
    if (error && error.code !== 'user_already_exists') {
      setAuthError(error.message)
    } else {
      // Either a genuine new signup awaiting confirmation, or an
      // already-registered address (user_already_exists) — same neutral
      // message either way so the response never confirms account existence.
      setAuthMessage(NEUTRAL_CHECK_EMAIL_MESSAGE)
    }
    setAuthLoading(false)
  }, [])

  const resetPasswordForEmail = useCallback(async (email) => {
    if (!supabase) { setAuthError('Supabase is not configured.'); return }
    setAuthError(''); setAuthMessage(''); setAuthLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    })
    // GoTrue's resetPasswordForEmail is anti-enumeration by design — it does
    // not error for an unknown address, so any error here is a genuine
    // operational failure (rate limit, invalid email) and is safe to show
    // verbatim. Success always gets the same neutral message.
    if (error) setAuthError(error.message)
    else setAuthMessage(NEUTRAL_CHECK_EMAIL_MESSAGE)
    setAuthLoading(false)
  }, [])

  const updateUserPassword = useCallback(async (password) => {
    if (!supabase) { setAuthError('Supabase is not configured.'); return }
    setAuthError(''); setAuthMessage(''); setAuthLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setAuthError(error.message)
    } else {
      setIsPasswordRecovery(false)
      setAuthMessage('Password updated. You are signed in.')
    }
    setAuthLoading(false)
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    setAuthError(''); setAuthMessage(''); setAuthLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) { setAuthError(error.message); setAuthLoading(false) }
  }, [])

  const unlockCountry = useCallback(async (countryCode, cost) => {
    if (!supabase || !user) { setAuthError('Sign in to unlock countries.'); return null }
    const { data, error } = await supabase.rpc('unlock_country_for_user', {
      p_country_code: countryCode,
      p_cost: cost,
    })
    if (error) { setAuthError(error.message); console.error('Unable to unlock country:', error.message); return null }
    setAuthError('')
    setProfile((current) => current ? { ...current, tokens: data.tokens } : current)
    setUnlockedCountries(data.unlockedCountries ?? [])
    return data
  }, [user])

  // Completion is recorded server-side inside POST /api/scenario/evaluate (after
  // an evaluator-confirmed pass) or via the admin skip — never from the browser.
  // The client only refreshes its game-state view once the server has recorded it.
  const reloadGameState = useCallback(async () => {
    if (user) await loadGameState(user)
  }, [loadGameState, user])

  const claimCountryReward = useCallback(async (countryCode) => {
    if (!supabase || !user) { setAuthError('Sign in to claim rewards.'); return false }
    const { data: newBalance, error } = await supabase.rpc('claim_country_reward', { p_country_code: countryCode })
    if (error) { console.error('Unable to claim country reward:', error.message); return false }
    setProfile((current) => current ? { ...current, tokens: newBalance } : current)
    return true
  }, [user])

  const resetProgress = useCallback(async () => {
    if (!supabase || !user) return false
    const { error } = await supabase.rpc('reset_user_progress')
    if (error) { console.error('Unable to reset progress:', error.message); return false }
    await loadGameState(user)
    return true
  }, [loadGameState, user])

  const levelNumber = unlockedCountries.length
  return {
    user,
    profile,
    tokens: profile?.tokens ?? 0,
    level: { display_order: levelNumber, name: `Level ${levelNumber}` },
    rank: profile?.rank ?? null,
    unlockedCountries,
    completedScenarios,
    completions,
    isAdmin,
    authLoading: authLoading || (gameStateLoading && !profile),
    authError,
    authMessage,
    isPasswordRecovery,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPasswordForEmail,
    updateUserPassword,
    signOut,
    unlockCountry,
    reloadGameState,
    claimCountryReward,
    resetProgress,
  }
}

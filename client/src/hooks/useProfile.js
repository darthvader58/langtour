import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useProfile() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [unlockedCountries, setUnlockedCountries] = useState([])
  const [completedScenarios, setCompletedScenarios] = useState([])
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [gameStateLoading, setGameStateLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')

  const loadGameState = useCallback(async (sessionUser) => {
    if (!supabase || !sessionUser) {
      setProfile(null)
      setUnlockedCountries([])
      setCompletedScenarios([])
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
        supabase.from('scenario_completions').select('scenario_id').eq('user_id', sessionUser.id),
      ])

      if (profileResult.error) console.error('Unable to load Supabase profile:', profileResult.error.message)
      else setProfile(profileResult.data)

      if (unlocksResult.error) console.error('Unable to load country unlocks:', unlocksResult.error.message)
      else setUnlockedCountries((unlocksResult.data ?? []).map((row) => row.country_code))

      if (completionsResult.error) console.error('Unable to load scenario completions:', completionsResult.error.message)
      else setCompletedScenarios((completionsResult.data ?? []).map((row) => row.scenario_id))
    } finally {
      setGameStateLoading(false)
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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
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
    if (error) setAuthError(error.message)
    setAuthLoading(false)
  }, [])

  const signUpWithEmail = useCallback(async (email, password) => {
    if (!supabase) { setAuthError('Supabase is not configured.'); return }
    setAuthError(''); setAuthMessage(''); setAuthLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    })
    if (error) setAuthError(error.message)
    else if (!data.session) setAuthMessage('Check your email to confirm your account.')
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

  const awardTokens = useCallback(async (amount) => {
    if (!supabase || !user) return null
    const { data: newBalance, error } = await supabase.rpc('award_tokens', { p_amount: amount })
    if (error) { console.error('Unable to award tokens:', error.message); return null }
    setProfile((current) => current ? { ...current, tokens: newBalance } : current)
    return newBalance
  }, [user])

  const completeScenario = useCallback(async (countryCode, scenarioId) => {
    if (!supabase || !user) { setAuthError('Sign in to save scenario progress.'); return false }
    const { error } = await supabase.rpc('record_scenario_completion', {
      p_country_code: countryCode,
      p_scenario_id: scenarioId,
    })
    if (error) { console.error('Unable to save scenario completion:', error.message); return false }
    setCompletedScenarios((current) => current.includes(scenarioId) ? current : [...current, scenarioId])
    await loadGameState(user)
    return true
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
    authLoading: authLoading || (gameStateLoading && !profile),
    authError,
    authMessage,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    unlockCountry,
    awardTokens,
    completeScenario,
    claimCountryReward,
    resetProgress,
  }
}

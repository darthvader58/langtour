import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STARTING_TOKENS = 100

export function useProfile() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [localTokens, setLocalTokens] = useState(STARTING_TOKENS)
  const [completedScenarios, setCompletedScenarios] = useState([])
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')

  const loadProfile = useCallback(async (user) => {
    if (!supabase || !user) {
      setProfile(null)
      return
    }

    const [{ data, error }, { data: completions, error: completionsError }] = await Promise.all([
      supabase
        .from('profiles')
        .select(`
          user_id, tokens, experience_points, level_id, rank_id,
          level:levels!profiles_level_id_fkey(id, code, name, minimum_xp, display_order),
          rank:ranks!profiles_rank_id_fkey(id, code, name, minimum_xp, display_order)
        `)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('scenario_completions')
        .select('country_code, scenario_id')
        .eq('user_id', user.id),
    ])

    if (error) {
      console.error('Unable to load Supabase profile:', error.message)
      return
    }
    if (completionsError) {
      console.error('Unable to load Supabase progression:', completionsError.message)
    } else {
      setCompletedScenarios(completions ?? [])
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    if (!supabase) return undefined

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message)
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)
      loadProfile(sessionUser)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      loadProfile(sessionUser)
      setAuthLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [loadProfile])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      setAuthError('Supabase is not configured.')
      return
    }

    setAuthError('')
    setAuthMessage('')
    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    })

    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
    }
  }, [])

  const signInWithEmail = useCallback(async (email, password) => {
    if (!supabase) {
      setAuthError('Supabase is not configured.')
      return
    }

    setAuthError('')
    setAuthMessage('')
    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) setAuthError(error.message)
    setAuthLoading(false)
  }, [])

  const signUpWithEmail = useCallback(async (email, password) => {
    if (!supabase) {
      setAuthError('Supabase is not configured.')
      return
    }

    setAuthError('')
    setAuthMessage('')
    setAuthLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    })

    if (error) setAuthError(error.message)
    else if (!data.session) setAuthMessage('Check your email to confirm your account.')
    setAuthLoading(false)
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return

    setAuthError('')
    setAuthMessage('')
    setAuthLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
    }
  }, [])

  const spendTokens = useCallback(async (amount) => {
    if (!supabase || !user) {
      if (localTokens < amount) return false
      setLocalTokens((balance) => balance - amount)
      return true
    }

    const { data: newBalance, error } = await supabase.rpc('spend_tokens', { amount })
    if (error) {
      console.error('Unable to spend tokens:', error.message)
      return false
    }

    setProfile((current) => ({ ...current, tokens: newBalance }))
    return true
  }, [localTokens, user])

  const completeScenario = useCallback(async (countryCode, scenarioId) => {
    if (!supabase || !user) {
      const completion = { country_code: countryCode.toLowerCase(), scenario_id: scenarioId }
      setCompletedScenarios((current) => current.some((item) =>
        item.country_code === completion.country_code && item.scenario_id === scenarioId
      ) ? current : [...current, completion])
      return true
    }

    const { error } = await supabase.rpc('record_scenario_completion', {
      p_country_code: countryCode,
      p_scenario_id: scenarioId,
    })
    if (error) {
      console.error('Unable to save scenario completion:', error.message)
      return false
    }
    await loadProfile(user)
    return true
  }, [loadProfile, user])

  const claimCountryReward = useCallback(async (countryCode, localReward) => {
    if (!supabase || !user) {
      setLocalTokens((balance) => balance + localReward)
      return true
    }

    const { data: newBalance, error } = await supabase.rpc('claim_country_reward', {
      p_country_code: countryCode,
    })
    if (error) {
      console.error('Unable to claim country reward:', error.message)
      return false
    }
    setProfile((current) => ({ ...current, tokens: newBalance }))
    return true
  }, [user])

  return {
    user,
    profile,
    completedScenarios,
    tokens: profile?.tokens ?? localTokens,
    level: profile?.level ?? null,
    rank: profile?.rank ?? null,
    authLoading,
    authError,
    authMessage,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    spendTokens,
    completeScenario,
    claimCountryReward,
  }
}

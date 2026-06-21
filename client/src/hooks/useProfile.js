import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STARTING_TOKENS = 100

export function useProfile() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [localTokens, setLocalTokens] = useState(STARTING_TOKENS)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')

  const loadProfile = useCallback(async (user) => {
    if (!supabase || !user) {
      setProfile(null)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, tokens, experience_points, level_id, rank_id')
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Unable to load Supabase profile:', error.message)
      return
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
    if (!supabase || !profile) {
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
  }, [localTokens, profile])

  return {
    user,
    profile,
    tokens: profile?.tokens ?? localTokens,
    authLoading,
    authError,
    authMessage,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    spendTokens,
  }
}

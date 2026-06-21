import { supabase } from './lib/supabase'

export const API = ''

export async function authFetch(path, init = {}) {
  const headers = new Headers(init.headers || {})
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(`${API}${path}`, { ...init, headers })
}

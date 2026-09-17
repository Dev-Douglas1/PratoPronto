import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || ''

/**
 * Supabase is optional while the project is being configured. Keeping the
 * client null until both public variables exist prevents a blank screen in
 * environments that still use Firebase only.
 */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey)

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null

export function getSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.'
    )
  }

  return supabase
}

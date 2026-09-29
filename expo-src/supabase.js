import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, Platform } from 'react-native'
import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://hllvhzzbkjmhxymuwqis.supabase.co'
const fallbackKey = 'sb_publishable_kn9TRMKNzCkXB-qz1RUgVg_1G1cbsQw'

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || fallbackUrl
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || fallbackKey

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}

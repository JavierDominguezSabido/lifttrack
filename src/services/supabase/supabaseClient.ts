import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

function createOptionalSupabaseClient(): SupabaseClient<Database> | null {
  if (!supabaseUrl || !supabaseAnonKey) return null

  try {
    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  } catch (error) {
    console.error('[supabase] No se pudo crear el cliente. Se mantendrá el modo local:', error)
    return null
  }
}

/**
 * Es null cuando no hay configuración válida. Ningún consumidor debe asumir
 * que Supabase está disponible sin comprobar este valor.
 */
export const supabase = createOptionalSupabaseClient()

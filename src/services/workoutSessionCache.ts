import type { WorkoutSession } from '../types'

const CACHE_PREFIX = 'lifttrack:session-cache:v1'

interface SessionCacheEntry {
  updatedAt: string
  sessions: WorkoutSession[]
}

function cacheKey(ownerId: string) {
  return `${CACHE_PREFIX}:${ownerId}`
}

export function readSessionCache(ownerId: string): SessionCacheEntry | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(cacheKey(ownerId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<SessionCacheEntry>
    if (typeof value.updatedAt !== 'string' || !Array.isArray(value.sessions)) return null
    return value as SessionCacheEntry
  } catch (error) {
    console.error('[workout] No se pudo leer la caché local del historial:', error)
    return null
  }
}

export function writeSessionCache(ownerId: string, sessions: WorkoutSession[], updatedAt = new Date().toISOString()) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(cacheKey(ownerId), JSON.stringify({ updatedAt, sessions } satisfies SessionCacheEntry))
  } catch (error) {
    console.error('[workout] No se pudo guardar la caché local del historial:', error)
  }
}

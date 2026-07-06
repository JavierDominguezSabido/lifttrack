import { initialSessions } from '../../data/mockData'
import type { WorkoutSession } from '../../types'
import { getLastExercisePerformanceFromSessions } from '../../utils/workoutHistory'
import type { WorkoutRepository } from '../workoutRepository'

// La versión evita mezclar el historial genérico anterior con la rutina real.
const STORAGE_KEY = 'lifttrack:sessions:v2'
const LEGACY_STORAGE_KEY = 'fuerza:sessions:v2'

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      console.error('[workout] localStorage no está disponible en este entorno.')
      return null
    }
    return window.localStorage
  } catch (error) {
    console.error('[workout] No se pudo acceder a localStorage:', error)
    return null
  }
}

export function getStoredSessions(): WorkoutSession[] {
  return [...getLocalSessions(), ...initialSessions]
}

export function getLocalSessions(): WorkoutSession[] {
  const storage = getLocalStorage()
  if (!storage) return []
  try {
    const saved =
      storage.getItem(STORAGE_KEY) ??
      storage.getItem(LEGACY_STORAGE_KEY)
    if (!saved) return []
    const sessions = JSON.parse(saved) as WorkoutSession[]
    // Versiones anteriores guardaban también la semilla dentro de localStorage.
    return sessions.filter((session) => !session.id.startsWith('initial-'))
  } catch (error) {
    console.error('[workout] No se pudo leer el historial de localStorage:', error)
    return []
  }
}

function writeLocalSessions(storage: Storage, sessions: WorkoutSession[]) {
  storage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export const localWorkoutRepository: WorkoutRepository = {
  async getWorkoutSessions() {
    return getStoredSessions()
  },
  async saveWorkoutSession(session) {
    const storage = getLocalStorage()
    if (!storage) {
      throw new Error('localStorage no está disponible en este navegador o contexto.')
    }

    try {
      const sessions = getLocalSessions()
      const next = [session, ...sessions.filter((item) => item.id !== session.id)]
      writeLocalSessions(storage, next)
      return session
    } catch (error) {
      console.error('[workout] Falló la escritura en localStorage:', error)
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Error de localStorage: ${detail}`)
    }
  },
  async updateWorkoutSession(session) {
    return this.saveWorkoutSession(session)
  },
  async deleteWorkoutSession(sessionId) {
    const storage = getLocalStorage()
    if (!storage) throw new Error('localStorage no está disponible en este navegador o contexto.')

    try {
      const next = getLocalSessions().filter((session) => session.id !== sessionId)
      writeLocalSessions(storage, next)
    } catch (error) {
      console.error('[workout] No se pudo borrar la sesión de localStorage:', error)
      throw new Error('No se pudo borrar la sesión local.')
    }
  },
  async clearWorkoutSessions() {
    const storage = getLocalStorage()
    if (!storage) throw new Error('localStorage no está disponible en este navegador o contexto.')

    try {
      storage.removeItem(STORAGE_KEY)
      storage.removeItem(LEGACY_STORAGE_KEY)
    } catch (error) {
      console.error('[workout] No se pudieron limpiar los datos locales:', error)
      throw new Error('No se pudieron limpiar los datos locales.')
    }
  },
  async getLastPerformanceByExercise(exerciseId) {
    return getLastExercisePerformanceFromSessions(getStoredSessions(), exerciseId)
  }
}

// Alias conservado durante la transición; el proveedor usa ya el repositorio neutral.
export const mockWorkoutService = localWorkoutRepository

import { localWorkoutRepository } from './mock/workoutService'
import { supabaseWorkoutRepository } from './supabase/supabaseWorkoutRepository'
import type { WorkoutRepository } from './workoutRepository'

/**
 * Resuelve el almacenamiento principal para la sesión actual.
 * No hace fallback silencioso: con una sesión autenticada, un error de red se
 * muestra al usuario y no escribe una copia local parcial.
 */
export function getWorkoutRepository(authenticated: boolean): WorkoutRepository {
  return authenticated ? supabaseWorkoutRepository : localWorkoutRepository
}

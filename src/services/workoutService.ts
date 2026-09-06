import { localWorkoutRepository } from './mock/workoutService'
import { supabaseWorkoutRepository } from './supabase/supabaseWorkoutRepository'
import type { WorkoutRepository } from './workoutRepository'

/**
 * Resuelve el almacenamiento principal para la sesión actual.
 * Con cuenta autenticada, las escrituras se conservan en una cola local por
 * usuario y se confirman mediante el protocolo transaccional de Supabase.
 */
export function getWorkoutRepository(authenticated: boolean): WorkoutRepository {
  return authenticated ? supabaseWorkoutRepository : localWorkoutRepository
}

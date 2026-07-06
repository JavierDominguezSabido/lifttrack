import type { WorkoutSession } from '../types'
import { localWorkoutRepository } from './mock/workoutService'
import type { WorkoutRepository } from './workoutRepository'

/**
 * Proveedor activo del MVP. En la fase de conexión bastará con resolver este
 * repositorio a Supabase cuando exista sesión autenticada.
 */
export const workoutRepository: WorkoutRepository = localWorkoutRepository

export const getWorkoutSessions = () =>
  workoutRepository.getWorkoutSessions()

export const saveWorkoutSession = (session: WorkoutSession) =>
  workoutRepository.saveWorkoutSession(session)

export const updateWorkoutSession = (session: WorkoutSession) =>
  workoutRepository.updateWorkoutSession(session)

export const deleteWorkoutSession = (sessionId: string) =>
  workoutRepository.deleteWorkoutSession(sessionId)

export const clearWorkoutSessions = () =>
  workoutRepository.clearWorkoutSessions()

export const getLastPerformanceByExercise = (exerciseId: string) =>
  workoutRepository.getLastPerformanceByExercise(exerciseId)

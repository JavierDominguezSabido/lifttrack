import type { LastExercisePerformance, WorkoutSession } from '../types'
import { isInitialSession } from './workout'

/**
 * Obtiene el último rendimiento usando el identificador estable del ejercicio.
 * Mantiene la misma forma de respuesta que devolverá el servicio de Supabase.
 */
export function getLastExercisePerformanceFromSessions(
  sessions: WorkoutSession[],
  exerciseId: string
): LastExercisePerformance | null {
  const sortedSessions = [...sessions]
    .filter((session) => session.completedAt)
    .sort((a, b) => {
      const sourceDifference =
        Number(isInitialSession(a.id)) - Number(isInitialSession(b.id))
      return sourceDifference || b.startedAt.localeCompare(a.startedAt)
    })

  for (const session of sortedSessions) {
    const exerciseLog = session.exerciseLogs.find((log) => log.exerciseId === exerciseId)
    if (!exerciseLog) continue

    const completedSets = exerciseLog.sets.filter((set) => set.completed && !set.isWarmup)
    if (completedSets.length === 0) continue

    const weightKg =
      exerciseLog.workingWeightKg ??
      completedSets.find((set) => set.weightOverrideKg === undefined)?.weightKg ??
      completedSets[0].weightKg

    return {
      exerciseId,
      sessionId: session.id,
      performedAt: session.completedAt ?? session.startedAt,
      weightKg,
      reps: completedSets.map((set) => set.reps)
    }
  }

  return null
}

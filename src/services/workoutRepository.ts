import type { LastExercisePerformance, WorkoutSession } from '../types'

/**
 * Contrato neutral de persistencia. Los componentes trabajan con modelos de
 * dominio y no necesitan conocer si los datos vienen del navegador o de SQL.
 */
export interface WorkoutRepository {
  getWorkoutSessions(expectedUserId?: string): Promise<WorkoutSession[]>
  saveWorkoutSession(session: WorkoutSession, expectedUserId?: string): Promise<WorkoutSession>
  updateWorkoutSession(session: WorkoutSession, expectedUserId?: string): Promise<WorkoutSession>
  deleteWorkoutSession(sessionId: string, expectedUserId?: string, expectedRevision?: string): Promise<void>
  clearWorkoutSessions(): Promise<void>
  mergeExerciseIds(canonicalId: string, duplicateIds: string[], expectedUserId?: string): Promise<number>
  getLastPerformanceByExercise(
    exerciseId: string
  ): Promise<LastExercisePerformance | null>
}

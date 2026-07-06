import type { LastExercisePerformance, WorkoutSession } from '../types'

/**
 * Contrato neutral de persistencia. Los componentes trabajan con modelos de
 * dominio y no necesitan conocer si los datos vienen del navegador o de SQL.
 */
export interface WorkoutRepository {
  getWorkoutSessions(): Promise<WorkoutSession[]>
  saveWorkoutSession(session: WorkoutSession): Promise<WorkoutSession>
  updateWorkoutSession(session: WorkoutSession): Promise<WorkoutSession>
  deleteWorkoutSession(sessionId: string): Promise<void>
  clearWorkoutSessions(): Promise<void>
  getLastPerformanceByExercise(
    exerciseId: string
  ): Promise<LastExercisePerformance | null>
}

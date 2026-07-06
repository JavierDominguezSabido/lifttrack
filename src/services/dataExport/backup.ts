import type { Exercise, WorkoutSession } from '../../types'

export interface LiftTrackBackup {
  format: 'lifttrack-backup'
  version: 1
  exportedAt: string
  dataMode: 'local' | 'cloud'
  exercises: Exercise[]
  sessions: WorkoutSession[]
}

export function createBackup(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  dataMode: 'local' | 'cloud'
): LiftTrackBackup {
  const usedExerciseIds = new Set(
    sessions.flatMap((session) => session.exerciseLogs.map((log) => log.exerciseId))
  )

  return {
    format: 'lifttrack-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    dataMode,
    exercises: exercises.filter((exercise) => usedExerciseIds.has(exercise.id)),
    sessions
  }
}

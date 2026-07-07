import type { Exercise, WorkoutSession, WorkoutTemplate } from '../../types'

export interface LiftTrackBackup {
  format: 'lifttrack-backup'
  version: 1
  exportedAt: string
  dataMode: 'local' | 'cloud'
  exercises: Exercise[]
  templates: WorkoutTemplate[]
  sessions: WorkoutSession[]
}

export function createBackup(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  templatesOrDataMode: WorkoutTemplate[] | 'local' | 'cloud',
  dataModeOrUndefined?: 'local' | 'cloud'
): LiftTrackBackup {
  const templates = Array.isArray(templatesOrDataMode) ? templatesOrDataMode : []
  const dataMode = dataModeOrUndefined ?? (Array.isArray(templatesOrDataMode) ? 'local' : templatesOrDataMode)

  return {
    format: 'lifttrack-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    dataMode,
    exercises,
    templates,
    sessions
  }
}

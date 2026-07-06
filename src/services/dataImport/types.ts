import type { Exercise, WorkoutSession } from '../../types'

export interface ImportPayload {
  source: 'csv' | 'json'
  filename: string
  sessions: WorkoutSession[]
  exercises: Exercise[]
  errors: string[]
}

export interface ImportPreview extends ImportPayload {
  sessionCount: number
  exerciseCount: number
  setCount: number
  duplicateSessionIds: string[]
  sessionsToImport: WorkoutSession[]
  hasPossibleDuplicates: boolean
}

import { createContext, useContext } from 'react'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../types'

export interface WorkoutContextValue {
  sessions: WorkoutSession[]
  exercises: Exercise[]
  templates: WorkoutTemplate[]
  hasCustomRoutine: boolean
  sessionsLoading: boolean
  routineLoading: boolean
  routineError: string | null
  sessionsError: string | null
  dataMode: 'local' | 'cloud'
  saveSession: (session: WorkoutSession) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  clearLocalSessions: () => Promise<void>
  createExercise: (exercise: Omit<Exercise, 'id'>) => Exercise
  updateExercise: (exercise: Exercise) => void
  archiveExercise: (exerciseId: string) => boolean
  saveTemplates: (templates: WorkoutTemplate[]) => void
  getExerciseById: (exerciseId: string) => Exercise | undefined
  mergeExercises: (exercises: Exercise[]) => void
  importRoutine: (exercises: Exercise[], templates?: WorkoutTemplate[]) => Promise<void>
  mergeDuplicateExercises: (canonicalId: string, duplicateIds: string[]) => Promise<number>
  reloadSessions: (silent?: boolean) => Promise<void>
}

export const WorkoutContext = createContext<WorkoutContextValue | null>(null)

export function useWorkouts() {
  const context = useContext(WorkoutContext)
  if (!context) throw new Error('useWorkouts debe usarse dentro de WorkoutProvider')
  return context
}

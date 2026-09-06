import { createContext, useContext } from 'react'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../types'
import type { SyncStatus } from '../utils/syncStatus'
import type { SyncOperation } from '../services/syncOutbox'

export interface WorkoutContextValue {
  sessions: WorkoutSession[]
  exercises: Exercise[]
  templates: WorkoutTemplate[]
  hasCustomRoutine: boolean
  sessionsLoading: boolean
  templatesLoaded: boolean
  exercisesLoaded: boolean
  historyLoaded: boolean
  lastPerformanceLoaded: boolean
  draftLoaded: boolean
  syncReady: boolean
  routineLoading: boolean
  initialLoading: boolean
  backgroundRefreshing: boolean
  routineError: string | null
  sessionsError: string | null
  dataMode: 'local' | 'cloud'
  syncStatus: SyncStatus
  syncError: string | null
  syncOperations: SyncOperation[]
  retrySync: () => Promise<void>
  resolveConflict: (operationId: string, keepLocal: boolean) => Promise<void>
  ownerId: string
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
  reloadSessions: (background?: boolean) => Promise<void>
}

export const WorkoutContext = createContext<WorkoutContextValue | null>(null)

export function useWorkouts() {
  const context = useContext(WorkoutContext)
  if (!context) throw new Error('useWorkouts debe usarse dentro de WorkoutProvider')
  return context
}

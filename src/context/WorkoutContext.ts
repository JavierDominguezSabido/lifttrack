import { createContext, useContext } from 'react'
import type { WorkoutSession } from '../types'

export interface WorkoutContextValue {
  sessions: WorkoutSession[]
  saveSession: (session: WorkoutSession) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  clearLocalSessions: () => Promise<void>
}

export const WorkoutContext = createContext<WorkoutContextValue | null>(null)

export function useWorkouts() {
  const context = useContext(WorkoutContext)
  if (!context) throw new Error('useWorkouts debe usarse dentro de WorkoutProvider')
  return context
}

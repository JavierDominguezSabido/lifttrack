import { useMemo, useState, type ReactNode } from 'react'
import { getStoredSessions } from '../services/mock/workoutService'
import {
  clearWorkoutSessions,
  deleteWorkoutSession,
  saveWorkoutSession,
  updateWorkoutSession as updateStoredWorkoutSession
} from '../services/workoutService'
import type { WorkoutSession } from '../types'
import { WorkoutContext, type WorkoutContextValue } from './WorkoutContext'

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<WorkoutSession[]>(getStoredSessions)

  const value = useMemo<WorkoutContextValue>(
    () => ({
      sessions,
      saveSession: async (session) => {
        const exists = sessions.some((item) => item.id === session.id)
        const saved = exists
          ? await updateStoredWorkoutSession(session)
          : await saveWorkoutSession(session)
        setSessions((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      },
      deleteSession: async (sessionId) => {
        await deleteWorkoutSession(sessionId)
        setSessions(getStoredSessions())
      },
      clearLocalSessions: async () => {
        await clearWorkoutSessions()
        setSessions(getStoredSessions())
      }
    }),
    [sessions]
  )

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>
}

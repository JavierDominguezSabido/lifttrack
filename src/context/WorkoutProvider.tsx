import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getStoredSessions } from '../services/mock/workoutService'
import { localWorkoutRepository } from '../services/mock/workoutService'
import { getWorkoutRepository } from '../services/workoutService'
import type { WorkoutSession } from '../types'
import type { Exercise, WorkoutTemplate } from '../types'
import { WorkoutContext, type WorkoutContextValue } from './WorkoutContext'
import {
  getStoredExercises,
  getStoredTemplates,
  hasCustomRoutine as getHasCustomRoutine,
  storeExercises,
  storeTemplates
} from '../services/routineStorage'
import { useAuth } from './AuthContext'

function createId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [sessions, setSessions] = useState<WorkoutSession[]>(getStoredSessions)
  const [sessionsLoading, setSessionsLoading] = useState(authLoading)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>(getStoredExercises)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>(getStoredTemplates)
  const [hasCustomRoutine, setHasCustomRoutine] = useState(getHasCustomRoutine)
  const dataMode = user ? 'cloud' : 'local'
  const activeRepository = getWorkoutRepository(Boolean(user))

  const reloadSessions = useCallback(async (silent = false) => {
    if (authLoading) return
    if (!silent) setSessionsLoading(true)
    setSessionsError(null)
    try {
      const next = await activeRepository.getWorkoutSessions()
      setSessions(next)
    } catch (error) {
      console.error('[workout] No se pudo cargar el historial activo:', error)
      setSessions([])
      setSessionsError(
        dataMode === 'cloud'
          ? 'No se pudo cargar el historial de Supabase.'
          : 'No se pudo cargar el historial local.'
      )
    } finally {
      if (!silent) setSessionsLoading(false)
    }
  }, [activeRepository, authLoading, dataMode])

  useEffect(() => {
    if (authLoading) return
    setSessions([])
    void reloadSessions()
  }, [authLoading, reloadSessions, user?.id])

  const value = useMemo<WorkoutContextValue>(
    () => ({
      sessions,
      exercises,
      templates,
      hasCustomRoutine,
      sessionsLoading,
      sessionsError,
      dataMode,
      saveSession: async (session) => {
        const exists = sessions.some((item) => item.id === session.id)
        const saved = exists
          ? await activeRepository.updateWorkoutSession(session)
          : await activeRepository.saveWorkoutSession(session)
        setSessions((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      },
      deleteSession: async (sessionId) => {
        await activeRepository.deleteWorkoutSession(sessionId)
        setSessions((current) => current.filter((session) => session.id !== sessionId))
      },
      clearLocalSessions: async () => {
        await localWorkoutRepository.clearWorkoutSessions()
        if (dataMode === 'local') setSessions(getStoredSessions())
      },
      createExercise: (exercise) => {
        const created = { ...exercise, id: createId(), active: true }
        setExercises((current) => {
          const next = [...current, created]
          storeExercises(next)
          return next
        })
        return created
      },
      updateExercise: (exercise) => {
        setExercises((current) => {
          const next = current.map((item) => item.id === exercise.id ? exercise : item)
          storeExercises(next)
          return next
        })
      },
      archiveExercise: (exerciseId) => {
        if (templates.some((template) =>
          template.exercises.some((item) => item.exerciseId === exerciseId)
        )) return false

        setExercises((current) => {
          const next = current.map((item) =>
            item.id === exerciseId ? { ...item, active: false } : item
          )
          storeExercises(next)
          return next
        })
        return true
      },
      saveTemplates: (nextTemplates) => {
        storeTemplates(nextTemplates)
        setTemplates(nextTemplates)
        setHasCustomRoutine(true)
      },
      getExerciseById: (exerciseId) =>
        exercises.find((exercise) => exercise.id === exerciseId),
      mergeExercises: (importedExercises) => {
        const currentIds = new Set(exercises.map((exercise) => exercise.id))
        const additions = importedExercises
          .filter((exercise) => !currentIds.has(exercise.id))
          .map((exercise) => ({ ...exercise, active: exercise.active !== false }))
        if (additions.length === 0) return
        const next = [...exercises, ...additions]
        storeExercises(next)
        setExercises(next)
      },
      mergeDuplicateExercises: async (canonicalId, duplicateIds) => {
        const updatedLogs = await activeRepository.mergeExerciseIds(canonicalId, duplicateIds)
        await reloadSessions(true)
        return updatedLogs
      },
      reloadSessions
    }),
    [
      activeRepository,
      dataMode,
      exercises,
      hasCustomRoutine,
      reloadSessions,
      sessions,
      sessionsError,
      sessionsLoading,
      templates
    ]
  )

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getStoredSessions, localWorkoutRepository } from '../services/mock/workoutService'
import { getWorkoutRepository } from '../services/workoutService'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../types'
import { WorkoutContext, type WorkoutContextValue } from './WorkoutContext'
import {
  copyLegacyRoutine, getExerciseCatalog, getStoredExercises, getStoredTemplates,
  hasCustomRoutine as getHasCustomRoutine, storeExercises, storeTemplates
} from '../services/routineStorage'
import { loadRemoteRoutine, saveRemoteRoutine } from '../services/supabase/supabaseRoutineRepository'
import { useAuth } from './AuthContext'

function createId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface RoutineState {
  owner: string
  exercises: Exercise[]
  templates: WorkoutTemplate[]
  customized: boolean
}

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const owner = user?.id ?? 'local'
  const [sessions, setSessions] = useState<WorkoutSession[]>(getStoredSessions)
  const [sessionsLoading, setSessionsLoading] = useState(authLoading)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [routine, setRoutine] = useState<RoutineState>(() => ({
    owner: 'local', exercises: getStoredExercises('local'), templates: getStoredTemplates('local'),
    customized: getHasCustomRoutine('local')
  }))
  const routineSyncQueue = useRef(Promise.resolve())
  const dataMode = user ? 'cloud' : 'local'
  const activeRepository = getWorkoutRepository(Boolean(user))
  const currentRoutine = useMemo(() => routine.owner === owner
    ? routine
    : { owner, exercises: getExerciseCatalog(), templates: [], customized: false }, [owner, routine])

  const reloadSessions = useCallback(async (silent = false) => {
    if (authLoading) return
    if (!silent) setSessionsLoading(true)
    setSessionsError(null)
    try {
      setSessions(await activeRepository.getWorkoutSessions())
    } catch (error) {
      console.error('[workout] No se pudo cargar el historial activo:', error)
      setSessions([])
      setSessionsError(dataMode === 'cloud'
        ? 'No se pudo cargar el historial sincronizado. Revisa la conexión e inténtalo de nuevo.'
        : 'No se pudo cargar el historial guardado en este dispositivo.')
    } finally {
      if (!silent) setSessionsLoading(false)
    }
  }, [activeRepository, authLoading, dataMode])

  useEffect(() => {
    if (authLoading) return
    let active = true
    setSessions([])
    void reloadSessions()
    void (async () => {
      try {
        if (!user) {
          copyLegacyRoutine('local')
          if (active) setRoutine({ owner: 'local', exercises: getStoredExercises('local'), templates: getStoredTemplates('local'), customized: getHasCustomRoutine('local') })
          return
        }
        let remote = await loadRemoteRoutine(user.id)
        // Solo una cuenta con datos remotos previos puede reclamar la antigua rutina global.
        if (!remote.hasCompleteRoutine && remote.hasSessions) {
          copyLegacyRoutine(user.id, true)
          const migratedExercises = getStoredExercises(user.id)
          const migratedTemplates = getStoredTemplates(user.id)
          await saveRemoteRoutine(user.id, migratedExercises, migratedTemplates)
          remote = await loadRemoteRoutine(user.id)
        }
        const catalog = getExerciseCatalog()
        const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]))
        for (const exercise of remote.exercises) byId.set(exercise.id, exercise)
        const exercises = [...byId.values()]
        const templates = remote.templates.length ? remote.templates : getStoredTemplates(user.id)
        storeExercises(user.id, exercises)
        if (remote.templates.length) storeTemplates(user.id, templates)
        if (active) setRoutine({ owner: user.id, exercises, templates, customized: remote.templates.length > 0 })
      } catch (error) {
        console.error('[routine] No se pudo cargar la rutina:', error)
        if (active) setRoutine({ owner, exercises: getStoredExercises(owner), templates: getStoredTemplates(owner), customized: getHasCustomRoutine(owner) })
      }
    })()
    return () => { active = false }
  }, [authLoading, owner, reloadSessions, user])

  const persist = useCallback((exercises: Exercise[], templates: WorkoutTemplate[]) => {
    storeExercises(owner, exercises)
    storeTemplates(owner, templates)
    if (user) {
      routineSyncQueue.current = routineSyncQueue.current
        .catch(() => undefined)
        .then(() => saveRemoteRoutine(user.id, exercises, templates))
        .catch((error) => { console.error('[routine] No se pudo sincronizar:', error) })
    }
  }, [owner, user])

  const value = useMemo<WorkoutContextValue>(() => ({
    sessions,
    exercises: currentRoutine.exercises,
    templates: currentRoutine.templates,
    hasCustomRoutine: currentRoutine.customized,
    sessionsLoading,
    sessionsError,
    dataMode,
    saveSession: async (session) => {
      const saved = sessions.some((item) => item.id === session.id)
        ? await activeRepository.updateWorkoutSession(session)
        : await activeRepository.saveWorkoutSession(session)
      setSessions((items) => [saved, ...items.filter((item) => item.id !== saved.id)])
    },
    deleteSession: async (id) => { await activeRepository.deleteWorkoutSession(id); setSessions((items) => items.filter((item) => item.id !== id)) },
    clearLocalSessions: async () => { await localWorkoutRepository.clearWorkoutSessions(); if (dataMode === 'local') setSessions(getStoredSessions()) },
    createExercise: (exercise) => {
      const created = { ...exercise, id: createId(), active: true }
      const exercises = [...currentRoutine.exercises, created]
      persist(exercises, currentRoutine.templates)
      setRoutine({ ...currentRoutine, exercises })
      return created
    },
    updateExercise: (exercise) => {
      const exercises = currentRoutine.exercises.map((item) => item.id === exercise.id ? exercise : item)
      persist(exercises, currentRoutine.templates); setRoutine({ ...currentRoutine, exercises })
    },
    archiveExercise: (id) => {
      if (currentRoutine.templates.some((template) => template.exercises.some((item) => item.exerciseId === id))) return false
      const exercises = currentRoutine.exercises.map((item) => item.id === id ? { ...item, active: false } : item)
      persist(exercises, currentRoutine.templates); setRoutine({ ...currentRoutine, exercises }); return true
    },
    saveTemplates: (templates) => { persist(currentRoutine.exercises, templates); setRoutine({ ...currentRoutine, templates, customized: true }) },
    getExerciseById: (id) => currentRoutine.exercises.find((exercise) => exercise.id === id),
    mergeExercises: (imported) => {
      const ids = new Set(currentRoutine.exercises.map((exercise) => exercise.id))
      const exercises = [...currentRoutine.exercises, ...imported.filter((exercise) => !ids.has(exercise.id)).map((exercise) => ({ ...exercise, active: exercise.active !== false }))]
      persist(exercises, currentRoutine.templates); setRoutine({ ...currentRoutine, exercises })
    },
    importRoutine: (imported, templates) => {
      const ids = new Set(currentRoutine.exercises.map((exercise) => exercise.id))
      const exercises = [...currentRoutine.exercises, ...imported.filter((exercise) => !ids.has(exercise.id)).map((exercise) => ({ ...exercise, active: exercise.active !== false }))]
      const nextTemplates = templates?.length ? templates : currentRoutine.templates
      persist(exercises, nextTemplates)
      setRoutine({ ...currentRoutine, exercises, templates: nextTemplates, customized: templates?.length ? true : currentRoutine.customized })
    },
    mergeDuplicateExercises: async (canonicalId, duplicateIds) => { const count = await activeRepository.mergeExerciseIds(canonicalId, duplicateIds); await reloadSessions(true); return count },
    reloadSessions
  }), [activeRepository, currentRoutine, dataMode, persist, reloadSessions, sessions, sessionsError, sessionsLoading])

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>
}

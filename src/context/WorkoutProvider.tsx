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
import { readSessionCache, writeSessionCache } from '../services/workoutSessionCache'
import { getSyncStatus } from '../utils/syncStatus'
import { assertUniqueTemplateExercises } from '../services/templateImport'

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
  const userId = user?.id
  const owner = userId ?? 'local'
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  const requestRevision = useRef(0)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [writeError, setWriteError] = useState<string | null>(null)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const [sessions, setSessions] = useState<WorkoutSession[]>(getStoredSessions)
  const [sessionsLoading, setSessionsLoading] = useState(authLoading)
  const [historyLoaded, setHistoryLoaded] = useState(!authLoading)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [routineLoading, setRoutineLoading] = useState(authLoading)
  const [routineRefreshing, setRoutineRefreshing] = useState(false)
  const [routineError, setRoutineError] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(authLoading)
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false)
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

  const reloadSessions = useCallback(async (background = true) => {
    if (authLoading) return
    const revision = ++requestRevision.current
    const isCurrent = () => ownerRef.current === owner && requestRevision.current === revision
    if (background) setBackgroundRefreshing(true)
    else setSessionsLoading(true)
    setSessionsError(null)
    try {
      const remoteSessions = await activeRepository.getWorkoutSessions()
      if (!isCurrent()) return
      setSessions(remoteSessions)
      writeSessionCache(owner, remoteSessions)
      setHistoryLoaded(true)
    } catch (error) {
      if (!isCurrent()) return
      console.error('[workout] No se pudo cargar el historial activo:', error)
      setSessionsError(dataMode === 'cloud'
        ? 'No se pudo cargar el historial sincronizado. Revisa la conexión e inténtalo de nuevo.'
        : 'No se pudo cargar el historial guardado en este dispositivo.')
    } finally {
      if (isCurrent()) {
        setBackgroundRefreshing(false)
        setSessionsLoading(false)
      }
    }
  }, [activeRepository, authLoading, dataMode, owner])

  useEffect(() => {
    if (authLoading) return
    let active = true
    setPendingWrites(0)
    setWriteError(null)
    const cachedExercises = getStoredExercises(owner)
    const cachedTemplates = getStoredTemplates(owner)
    const cachedHistory = userId ? readSessionCache(owner) : null
    const hasUsableLocalState = cachedTemplates.length > 0
    setInitialLoading(!hasUsableLocalState)
    setSessionsLoading(!hasUsableLocalState)
    setRoutineLoading(!hasUsableLocalState)
    setRoutineRefreshing(true)
    setBackgroundRefreshing(hasUsableLocalState)
    setRoutineError(null)
    setSessions(userId ? cachedHistory?.sessions ?? [] : getStoredSessions())
    setHistoryLoaded(!userId || Boolean(cachedHistory))
    setRoutine({
      owner,
      exercises: cachedExercises,
      templates: cachedTemplates,
      customized: getHasCustomRoutine(owner)
    })
    void reloadSessions(hasUsableLocalState)
    void (async () => {
      try {
        if (!userId) {
          copyLegacyRoutine('local')
          if (active) setRoutine({ owner: 'local', exercises: getStoredExercises('local'), templates: getStoredTemplates('local'), customized: getHasCustomRoutine('local') })
          return
        }
        let remote = await loadRemoteRoutine(userId)
        if (!active) return
        // Solo una cuenta con datos remotos previos puede reclamar la antigua rutina global.
        if (!remote.hasCompleteRoutine && remote.hasSessions) {
          copyLegacyRoutine(userId, true)
          const migratedExercises = getStoredExercises(userId)
          const migratedTemplates = getStoredTemplates(userId)
          await saveRemoteRoutine(userId, migratedExercises, migratedTemplates)
          remote = await loadRemoteRoutine(userId)
        }
        if (!active) return
        const catalog = getExerciseCatalog()
        const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]))
        for (const exercise of remote.exercises) byId.set(exercise.id, exercise)
        const exercises = [...byId.values()]
        const templates = remote.templates.length ? remote.templates : getStoredTemplates(userId)
        storeExercises(userId, exercises)
        if (remote.templates.length) storeTemplates(userId, templates)
        if (active) setRoutine({ owner: userId, exercises, templates, customized: remote.templates.length > 0 })
      } catch (error) {
        console.error('[routine] No se pudo cargar la rutina:', error)
        if (active) setRoutineError('No se pudo cargar la rutina sincronizada.')
        if (active) setRoutine({ owner, exercises: getStoredExercises(owner), templates: getStoredTemplates(owner), customized: getHasCustomRoutine(owner) })
      } finally {
        if (active) {
          setRoutineLoading(false)
          setRoutineRefreshing(false)
          setInitialLoading(false)
        }
      }
    })()
    return () => { active = false }
  }, [authLoading, owner, reloadSessions, userId])

  useEffect(() => {
    if (authLoading) return
    let refreshQueued = false
    const refreshInBackground = () => {
      if (document.visibilityState === 'hidden' || refreshQueued) return
      refreshQueued = true
      window.queueMicrotask(() => {
        refreshQueued = false
        void reloadSessions(true)
      })
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshInBackground()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', refreshInBackground)
    window.addEventListener('pageshow', refreshInBackground)
    window.addEventListener('online', refreshInBackground)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', refreshInBackground)
      window.removeEventListener('pageshow', refreshInBackground)
      window.removeEventListener('online', refreshInBackground)
    }
  }, [authLoading, reloadSessions])

  const persist = useCallback((exercises: Exercise[], templates: WorkoutTemplate[]) => {
    assertUniqueTemplateExercises(templates)
    storeExercises(owner, exercises)
    storeTemplates(owner, templates)
    if (user) {
      setPendingWrites((count) => count + 1)
      setRoutineError(null)
      routineSyncQueue.current = routineSyncQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (ownerRef.current !== owner) return
          await saveRemoteRoutine(user.id, exercises, templates)
          if (ownerRef.current === owner) setRoutineError(null)
        })
        .catch((error) => {
          console.error('[routine] No se pudo sincronizar:', error)
          if (ownerRef.current === owner) setRoutineError('La rutina está guardada en este dispositivo, pero no se ha confirmado en la nube. Reintenta Guardar cambios.')
        })
        .finally(() => { if (ownerRef.current === owner) setPendingWrites((count) => Math.max(0, count - 1)) })
    }
  }, [owner, user])

  const value = useMemo<WorkoutContextValue>(() => ({
    sessions,
    exercises: currentRoutine.exercises,
    templates: currentRoutine.templates,
    hasCustomRoutine: currentRoutine.customized,
    sessionsLoading,
    templatesLoaded: currentRoutine.owner === owner && !routineLoading,
    exercisesLoaded: currentRoutine.owner === owner && !routineLoading,
    historyLoaded,
    lastPerformanceLoaded: historyLoaded,
    draftLoaded: true,
    syncReady: !authLoading && currentRoutine.owner === owner && !routineLoading && (historyLoaded || Boolean(sessionsError)),
    sessionsError,
    routineLoading,
    initialLoading,
    backgroundRefreshing,
    routineError,
    dataMode,
    syncStatus: getSyncStatus({ cloud: dataMode === 'cloud', online,
      pending: pendingWrites > 0 || backgroundRefreshing || sessionsLoading || routineRefreshing,
      error: Boolean(writeError || routineError || sessionsError) }),
    syncError: writeError ?? routineError ?? sessionsError,
    ownerId: owner,
    saveSession: async (session) => {
      requestRevision.current += 1
      setPendingWrites((count) => count + 1)
      setWriteError(null)
      try {
        const saved = sessions.some((item) => item.id === session.id)
          ? await activeRepository.updateWorkoutSession(session, userId)
          : await activeRepository.saveWorkoutSession(session, userId)
        if (ownerRef.current !== owner) return
        requestRevision.current += 1
        setSessions((items) => {
          const next = [saved, ...items.filter((item) => item.id !== saved.id)]
          writeSessionCache(owner, next)
          return next
        })
      } catch (error) {
        if (ownerRef.current === owner) setWriteError('No se ha confirmado el guardado de la sesión. Reinténtalo desde el entrenamiento.')
        throw error
      } finally {
        if (ownerRef.current === owner) {
          setPendingWrites((count) => Math.max(0, count - 1))
          setBackgroundRefreshing(false)
          setSessionsLoading(false)
        }
      }
    },
    deleteSession: async (id) => {
      requestRevision.current += 1
      setPendingWrites((count) => count + 1)
      setWriteError(null)
      try {
        await activeRepository.deleteWorkoutSession(id)
        if (ownerRef.current !== owner) return
        requestRevision.current += 1
        setSessions((items) => {
          const next = items.filter((item) => item.id !== id)
          writeSessionCache(owner, next)
          return next
        })
      } catch (error) {
        if (ownerRef.current === owner) setWriteError('No se ha confirmado el borrado. Reinténtalo desde el historial.')
        throw error
      } finally {
        if (ownerRef.current === owner) {
          setPendingWrites((count) => Math.max(0, count - 1))
          setBackgroundRefreshing(false)
          setSessionsLoading(false)
        }
      }
    },
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
    importRoutine: async (imported, templates) => {
      if (templates) assertUniqueTemplateExercises(templates)
      if (routineLoading || currentRoutine.owner !== owner) throw new Error('La sincronización de la rutina todavía se está preparando.')
      const ids = new Set(currentRoutine.exercises.map((exercise) => exercise.id))
      const exercises = [...currentRoutine.exercises, ...imported.filter((exercise) => !ids.has(exercise.id)).map((exercise) => ({ ...exercise, active: exercise.active !== false }))]
      const nextTemplates = templates?.length ? templates : currentRoutine.templates
      let confirmedExercises = exercises
      let confirmedTemplates = nextTemplates
      if (user) {
        await saveRemoteRoutine(user.id, exercises, nextTemplates)
        const remote = await loadRemoteRoutine(user.id)
        const byId = new Map(getExerciseCatalog().map((exercise) => [exercise.id, exercise]))
        for (const exercise of remote.exercises) byId.set(exercise.id, exercise)
        confirmedExercises = [...byId.values()]
        confirmedTemplates = remote.templates
      }
      storeExercises(owner, confirmedExercises)
      storeTemplates(owner, confirmedTemplates)
      setRoutine({ ...currentRoutine, exercises: confirmedExercises, templates: confirmedTemplates, customized: templates?.length ? true : currentRoutine.customized })
    },
    mergeDuplicateExercises: async (canonicalId, duplicateIds) => { const count = await activeRepository.mergeExerciseIds(canonicalId, duplicateIds); await reloadSessions(true); return count },
    reloadSessions
  }), [activeRepository, authLoading, online, pendingWrites, writeError, backgroundRefreshing, currentRoutine, dataMode, historyLoaded, initialLoading, owner, persist, reloadSessions, routineError, routineLoading, routineRefreshing, sessions, sessionsError, sessionsLoading, user, userId])

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>
}

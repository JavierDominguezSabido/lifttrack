import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getStoredSessions, localWorkoutRepository } from '../services/mock/workoutService'
import { getWorkoutRepository } from '../services/workoutService'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../types'
import { WorkoutContext, type WorkoutContextValue } from './WorkoutContext'
import {
  copyLegacyRoutine, getExerciseCatalog, getStoredExercises, getStoredTemplates,
  hasCustomRoutine as getHasCustomRoutine, storeExercises, storeTemplates
} from '../services/routineStorage'
import { loadRemoteRoutine, queueRemoteRoutine, saveRemoteRoutine } from '../services/supabase/supabaseRoutineRepository'
import { useAuth } from './AuthContext'
import { readSessionCache, writeSessionCache } from '../services/workoutSessionCache'
import { getSyncStatus } from '../utils/syncStatus'
import { assertUniqueTemplateExercises } from '../services/templateImport'
import { activateSyncOwner, flushSyncOperations, isSendingSync, overlayPendingSessions, pendingOperations, resolveSyncConflict } from '../services/syncOutbox'

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
  const { user } = useAuth()
  return <AccountWorkoutProvider key={user?.id ?? 'local'}>{children}</AccountWorkoutProvider>
}

function AccountWorkoutProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id
  const owner = userId ?? 'local'
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  const requestRevision = useRef(0)
  const routineRevision = useRef(0)
  const routineReadRevision = useRef(0)
  const [syncInfo, setSyncInfo] = useState(() => ({ operations: userId ? pendingOperations(owner) : [], sending: false }))
  const [remoteChecked, setRemoteChecked] = useState({ history: false, routine: false })
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
  const [sessions, setSessions] = useState<WorkoutSession[]>(() => userId ? overlayPendingSessions(owner, readSessionCache(owner)?.sessions ?? []) : getStoredSessions())
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
      const remoteSessions = await activeRepository.getWorkoutSessions(userId)
      if (!isCurrent()) return
      setSessions(remoteSessions)
      writeSessionCache(owner, remoteSessions)
      setHistoryLoaded(true)
      setRemoteChecked(value => ({ ...value, history: true }))
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
  }, [activeRepository, authLoading, dataMode, owner, userId])

  useEffect(() => {
    ownerRef.current = owner
    activateSyncOwner(userId ?? null)
    if (!userId || authLoading) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => { void flushSyncOperations(owner).catch(error => { if (active) setWriteError(String(error)) }) }
    const change = (event: Event) => {
      if (event instanceof CustomEvent && event.detail.owner !== owner) return
      if (event instanceof StorageEvent && event.key && !event.key.startsWith('lifttrack.outbox.v1.')) return
      setSyncInfo({ operations: pendingOperations(owner), sending: isSendingSync(owner) })
      if (event instanceof StorageEvent) {
        requestRevision.current += 1
        setSessions(items => overlayPendingSessions(owner, items))
        const queued = pendingOperations(owner, 'routine').slice(-1)[0]?.payload
        if (queued?.exercises && queued.templates) {
          routineRevision.current += 1
          setRoutine({ owner, exercises: queued.exercises, templates: queued.templates, customized: true })
        }
        if (event.newValue) {
          const operation = JSON.parse(event.newValue)
          if (operation.owner === owner && operation.status === 'done') refresh(new CustomEvent('sync', { detail: { owner, resource: operation.resource } }))
        }
      }
      if (pendingOperations(owner)[0]?.status === 'pending') {
        clearTimeout(timer)
        timer = setTimeout(flush, 750)
      }
    }
    const refresh = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail.owner !== owner) return
      if (event.detail.resource.startsWith('draft:')) return
      requestRevision.current += 1
      void reloadSessions(true)
      if (event.detail.resource === 'routine') {
        const revision = routineRevision.current
        const readRevision = ++routineReadRevision.current
        void loadRemoteRoutine(owner).then(remote => {
          if (!active || ownerRef.current !== owner || routineRevision.current !== revision || routineReadRevision.current !== readRevision) return
          storeExercises(owner, remote.exercises)
          storeTemplates(owner, remote.templates)
          setRoutine({ owner, exercises: remote.exercises, templates: remote.templates, customized: true })
          setRoutineError(null)
          setRemoteChecked(value => ({ ...value, routine: true }))
        }).catch(error => { if (active && ownerRef.current === owner && routineReadRevision.current === readRevision && routineRevision.current === revision) setRoutineError(String(error)) })
          .finally(() => { if (active && routineReadRevision.current === readRevision) { setRoutineLoading(false); setRoutineRefreshing(false); setInitialLoading(false) } })
      }
    }
    window.addEventListener('lifttrack-sync', change)
    window.addEventListener('storage', change)
    const reconnect = () => {
      flush()
      refresh(new CustomEvent('sync', { detail: { owner, resource: 'routine' } }))
    }
    window.addEventListener('online', reconnect)
    window.addEventListener('lifttrack-sync-confirmed', refresh)
    window.addEventListener('lifttrack-sync-resolved', refresh)
    setSyncInfo({ operations: pendingOperations(owner), sending: isSendingSync(owner) })
    const interval = setInterval(flush, 15000)
    flush()
    return () => {
      active = false
      ownerRef.current = ''
      activateSyncOwner(null)
      clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener('lifttrack-sync', change)
      window.removeEventListener('storage', change)
      window.removeEventListener('online', reconnect)
      window.removeEventListener('lifttrack-sync-confirmed', refresh)
      window.removeEventListener('lifttrack-sync-resolved', refresh)
    }
  }, [authLoading, owner, reloadSessions, userId])

  useEffect(() => {
    if (authLoading) return
    let active = true
    setPendingWrites(0)
    setWriteError(null)
    const queuedRoutine = userId ? pendingOperations(owner, 'routine').slice(-1)[0]?.payload : undefined
    const cachedExercises = queuedRoutine?.exercises ?? getStoredExercises(owner)
    const cachedTemplates = queuedRoutine?.templates ?? getStoredTemplates(owner)
    const cachedHistory = userId ? readSessionCache(owner) : null
    const hasUsableLocalState = cachedTemplates.length > 0
    setInitialLoading(!hasUsableLocalState)
    setSessionsLoading(!hasUsableLocalState)
    setRoutineLoading(!hasUsableLocalState)
    setRoutineRefreshing(true)
    setBackgroundRefreshing(hasUsableLocalState)
    setRoutineError(null)
    setSessions(userId ? overlayPendingSessions(owner, cachedHistory?.sessions ?? []) : getStoredSessions())
    setHistoryLoaded(!userId || Boolean(cachedHistory))
    setRoutine({
      owner,
      exercises: cachedExercises,
      templates: cachedTemplates,
      customized: getHasCustomRoutine(owner)
    })
    void reloadSessions(hasUsableLocalState)
    void (async () => {
      const revision = routineRevision.current
      const readRevision = ++routineReadRevision.current
      try {
        if (!userId) {
          copyLegacyRoutine('local')
          if (active) setRoutine({ owner: 'local', exercises: getStoredExercises('local'), templates: getStoredTemplates('local'), customized: getHasCustomRoutine('local') })
          return
        }
        let remote = await loadRemoteRoutine(userId)
        if (!active || routineRevision.current !== revision || routineReadRevision.current !== readRevision) return
        // Solo una cuenta con datos remotos previos puede reclamar la antigua rutina global.
        if (!remote.hasCompleteRoutine && remote.hasSessions && !pendingOperations(owner, 'routine').length) {
          copyLegacyRoutine(userId, true)
          const migratedExercises = getStoredExercises(userId)
          const migratedTemplates = getStoredTemplates(userId)
          await saveRemoteRoutine(userId, migratedExercises, migratedTemplates)
          remote = await loadRemoteRoutine(userId)
        }
        if (!active || routineRevision.current !== revision || routineReadRevision.current !== readRevision) return
        const catalog = getExerciseCatalog()
        const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]))
        for (const exercise of remote.exercises) byId.set(exercise.id, exercise)
        const exercises = [...byId.values()]
        const templates = remote.templates.length ? remote.templates : getStoredTemplates(userId)
        storeExercises(userId, exercises)
        if (remote.templates.length) storeTemplates(userId, templates)
        if (active) setRoutine({ owner: userId, exercises, templates, customized: remote.templates.length > 0 })
        setRemoteChecked(value => ({ ...value, routine: true }))
      } catch (error) {
        console.error('[routine] No se pudo cargar la rutina:', error)
        if (active && routineReadRevision.current === readRevision && routineRevision.current === revision) setRoutineError('No se pudo cargar la rutina sincronizada.')
      } finally {
        if (active && routineReadRevision.current === readRevision) {
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
    if (ownerRef.current !== owner) throw new Error('La cuenta ha cambiado.')
    assertUniqueTemplateExercises(templates)
    if (user) queueRemoteRoutine(user.id, exercises, templates)
    routineRevision.current += 1
    storeExercises(owner, exercises)
    storeTemplates(owner, templates)
    setRoutineError(null)
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
      confirmed: remoteChecked.history && remoteChecked.routine,
      queued: syncInfo.operations.length,
      conflict: syncInfo.operations.some(op => op.status === 'conflict'),
      pending: syncInfo.sending || pendingWrites > 0 || backgroundRefreshing || sessionsLoading || routineRefreshing,
      error: Boolean(writeError || routineError || sessionsError) }),
    syncError: syncInfo.operations.find(op => op.error)?.error ?? writeError ?? routineError ?? sessionsError,
    syncOperations: syncInfo.operations,
    retrySync: () => flushSyncOperations(owner),
    resolveConflict: (id, keepLocal) => resolveSyncConflict(owner, id, keepLocal),
    ownerId: owner,
    saveSession: async (session) => {
      if (ownerRef.current !== owner) throw new Error('La cuenta ha cambiado.')
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
      if (ownerRef.current !== owner) throw new Error('La cuenta ha cambiado.')
      requestRevision.current += 1
      setPendingWrites((count) => count + 1)
      setWriteError(null)
      try {
        await activeRepository.deleteWorkoutSession(id, userId, sessions.find(session => session.id === id)?.syncRevision)
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
      persist(exercises, nextTemplates)
      setRoutine({ ...currentRoutine, exercises, templates: nextTemplates, customized: templates?.length ? true : currentRoutine.customized })
    },
    mergeDuplicateExercises: async (canonicalId, duplicateIds) => {
      if (ownerRef.current !== owner) throw new Error('La cuenta ha cambiado.')
      const count = await activeRepository.mergeExerciseIds(canonicalId, duplicateIds, userId)
      if (ownerRef.current === owner) await reloadSessions(true)
      return count
    },
    reloadSessions
  }), [activeRepository, authLoading, online, pendingWrites, writeError, backgroundRefreshing, currentRoutine, dataMode, historyLoaded, initialLoading, owner, persist, reloadSessions, routineError, routineLoading, routineRefreshing, sessions, sessionsError, sessionsLoading, userId, syncInfo, remoteChecked])

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>
}

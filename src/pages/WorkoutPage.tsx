import { AlertCircle, CheckCircle2, Dumbbell } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExerciseLogger } from '../components/workout/ExerciseLogger'
import { useAuth } from '../context/AuthContext'
import { useWorkouts } from '../context/WorkoutContext'
import {
  deleteRemoteWorkoutDraft,
  getRemoteWorkoutDraft,
  upsertRemoteWorkoutDraft
} from '../services/supabase/supabaseWorkoutDraftRepository'
import type { DraftExerciseLog, WorkoutTemplate } from '../types'
import {
  createCanonicalExerciseIdMap,
  getEquivalentExerciseIds
} from '../utils/exerciseIdentity'
import {
  formatCompactNumber,
  formatRestSeconds,
  getTodayTemplate
} from '../utils/workout'
import {
  applyWorkingWeight,
  createExerciseLogs,
  createWorkoutSession,
  getWorkingWeight,
  normalizeRepsInput,
  reconcileUntouchedExerciseWeights,
  validateWorkoutDraft
} from '../utils/workoutDraft'
import { getLastExercisePerformanceFromSessions } from '../utils/workoutHistory'
import {
  getDatedLocalDraftKey,
  getDatedRemoteDraftKey,
  hasCompletedSessionForDraft,
  isActiveDraftForDate,
  countCompletedDraftSets,
  selectSafeWorkoutDraft,
  shouldAutosaveWorkoutDraft
} from '../utils/workoutLifecycle'
import { toLocalDateKey } from '../utils/date'
import { resolvePendingGuidedIndex } from '../utils/guidedWorkout'

type WorkoutViewMode = 'full' | 'guided'
type DraftSyncStatus = 'local-error' | 'idle' | 'local' | 'pending' | 'syncing' | 'synced' | 'error'
type DraftHydrationStatus = 'hydrating' | 'ready' | 'error'

interface GuidedPosition {
  exerciseId?: string
  logId?: string
  setId: string
}

interface GuidedFeedback {
  message: string
  detail?: string
}

function normalizeGuidedPosition(
  logs: DraftExerciseLog[],
  guidedPosition: GuidedPosition | null
): GuidedPosition | null {
  if (!guidedPosition) return null
  const log = logs.find((entry) =>
    guidedPosition.exerciseId
      ? entry.exerciseId === guidedPosition.exerciseId
      : entry.id === guidedPosition.logId
  )
  const set = log?.sets.find((item) => item.id === guidedPosition.setId)
  if (!log || !set) return null
  const steps = logs.flatMap((entry) => entry.sets.map((item) => ({ log: entry, set: item })))
  const currentIndex = steps.findIndex((step) => step.log.id === log.id && step.set.id === set.id)
  const resolvedIndex = resolvePendingGuidedIndex(steps.map((step) => step.set.completed), currentIndex)
  const resolvedStep = steps[resolvedIndex]
  return resolvedStep
    ? { exerciseId: resolvedStep.log.exerciseId, setId: resolvedStep.set.id }
    : null
}

const WORKOUT_DRAFT_VERSION = 2
const WORKOUT_DRAFT_PREFIX = 'lifttrack.workoutDraft'
const WORKOUT_FULL_SCROLL_PREFIX = 'lifttrack.workoutFullScroll'

interface StoredWorkoutDraft {
  version: number
  userKey: string
  templateId: string
  dayOfWeek: number
  localDate: string
  status: 'active' | 'completed'
  startedAt: string
  logs: DraftExerciseLog[]
  updatedAt: string
  viewMode?: WorkoutViewMode
  guidedPosition?: GuidedPosition
}

function getDraftUserKey(userId?: string) {
  return userId ? `user:${userId}` : 'local'
}

export function getWorkoutDraftKey(userKey: string, localDate: string, template: WorkoutTemplate) {
  return getDatedLocalDraftKey(userKey, localDate, template.id)
}

export function getWorkoutRemoteDraftKey(localDate: string, template: WorkoutTemplate) {
  return getDatedRemoteDraftKey(localDate, template.id)
}

function createStoredWorkoutDraft(
  userKey: string,
  template: WorkoutTemplate,
  startedAt: string,
  logs: DraftExerciseLog[],
  viewMode: WorkoutViewMode,
  guidedPosition: GuidedPosition | null,
  localDate: string,
  updatedAt = new Date().toISOString()
): StoredWorkoutDraft {
  const normalizedGuidedPosition = normalizeGuidedPosition(logs, guidedPosition)
  return {
    version: WORKOUT_DRAFT_VERSION,
    userKey,
    templateId: template.id,
    dayOfWeek: template.dayOfWeek,
    localDate,
    status: 'active',
    startedAt,
    logs,
    updatedAt,
    viewMode,
    guidedPosition: normalizedGuidedPosition ?? undefined
  }
}

function readWorkoutDraft(userKey: string, localDate: string, template: WorkoutTemplate): StoredWorkoutDraft | null {
  try {
    const raw = window.localStorage.getItem(getWorkoutDraftKey(userKey, localDate, template))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredWorkoutDraft>
    if (
      parsed.version !== WORKOUT_DRAFT_VERSION ||
      parsed.userKey !== userKey ||
      parsed.templateId !== template.id ||
      parsed.dayOfWeek !== template.dayOfWeek ||
      !isActiveDraftForDate(parsed, localDate) ||
      typeof parsed.startedAt !== 'string' ||
      typeof parsed.updatedAt !== 'string' ||
      !Array.isArray(parsed.logs)
    ) {
      return null
    }
    return parsed as StoredWorkoutDraft
  } catch (error) {
    console.error('[workout] No se pudo leer el borrador local:', error)
    return null
  }
}

function readWorkoutDrafts(userKey: string, localDate: string) {
  const drafts: StoredWorkoutDraft[] = []
  try {
    const keyPrefix = `${WORKOUT_DRAFT_PREFIX}.${userKey}.`
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(keyPrefix)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<StoredWorkoutDraft>
      if (
        parsed.version === WORKOUT_DRAFT_VERSION &&
        parsed.userKey === userKey &&
      isActiveDraftForDate(parsed, localDate) &&
      typeof parsed.templateId === 'string' &&
      typeof parsed.dayOfWeek === 'number' &&
      typeof parsed.startedAt === 'string' &&
      typeof parsed.updatedAt === 'string' &&
      Array.isArray(parsed.logs)
      ) {
        drafts.push(parsed as StoredWorkoutDraft)
      }
    }
  } catch (error) {
    console.error('[workout] No se pudieron leer los borradores locales:', error)
  }
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function writeWorkoutDraft(
  userKey: string,
  template: WorkoutTemplate,
  startedAt: string,
  logs: DraftExerciseLog[],
  viewMode: WorkoutViewMode,
  guidedPosition: GuidedPosition | null,
  localDate: string,
  updatedAt?: string
) {
  try {
    const draft = createStoredWorkoutDraft(userKey, template, startedAt, logs, viewMode, guidedPosition, localDate, updatedAt)
    window.localStorage.setItem(getWorkoutDraftKey(userKey, localDate, template), JSON.stringify(draft))
    return draft
  } catch (error) {
    console.error('[workout] No se pudo guardar el borrador local:', error)
    return null
  }
}

function isValidWorkoutDraftPayload(
  draft: StoredWorkoutDraft,
  userKey: string,
  localDate: string,
  template: WorkoutTemplate
) {
  return (
    draft.version === WORKOUT_DRAFT_VERSION &&
    draft.userKey === userKey &&
    draft.templateId === template.id &&
    draft.dayOfWeek === template.dayOfWeek &&
    isActiveDraftForDate(draft, localDate) &&
    typeof draft.startedAt === 'string' &&
    typeof draft.updatedAt === 'string' &&
    Array.isArray(draft.logs)
  )
}

function removeWorkoutDraft(userKey: string, localDate: string, template: WorkoutTemplate) {
  try {
    window.localStorage.removeItem(getWorkoutDraftKey(userKey, localDate, template))
  } catch (error) {
    console.error('[workout] No se pudo borrar el borrador local:', error)
  }
}

function removeWorkoutDraftByKey(userKey: string, localDate: string, templateId: string) {
  try {
    window.localStorage.removeItem(`${WORKOUT_DRAFT_PREFIX}.${userKey}.${localDate}.${templateId}`)
  } catch (error) {
    console.error('[workout] No se pudo borrar el borrador local:', error)
  }
}

function scrollToPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

function logsAreEqual(left: DraftExerciseLog[], right: DraftExerciseLog[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function getDraftSyncErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)
  return `No se pudo sincronizar el borrador con Supabase: ${detail}`
}

function createFreshWorkoutLogs(
  template: WorkoutTemplate,
  sessions: Parameters<typeof createExerciseLogs>[1],
  exercises: Parameters<typeof createExerciseLogs>[2]
) {
  return createExerciseLogs(template, sessions, exercises)
}

export function WorkoutPage() {
  const { ownerId } = useWorkouts()
  const { templateId } = useParams()
  return <WorkoutPageContent key={JSON.stringify([ownerId, templateId])} />
}

function WorkoutPageContent() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { sessions, saveSession, templates, exercises, getExerciseById, syncReady } = useWorkouts()
  const userKey = getDraftUserKey(user?.id)
  const localDate = toLocalDateKey(new Date())
  const localDraftHint = readWorkoutDrafts(userKey, localDate).find((draft) =>
    templateId ? draft.templateId === templateId : true
  ) ?? null
  const template = templates.find((item) => item.id === templateId) ??
    getTodayTemplate(templates) ??
    (localDraftHint ? {
      id: localDraftHint.templateId,
      name: `Entrenamiento día ${localDraftHint.dayOfWeek}`,
      dayOfWeek: localDraftHint.dayOfWeek,
      exercises: localDraftHint.logs.map((log) => ({
        id: `recovered-${log.id}`,
        templateId: localDraftHint.templateId,
        exerciseId: log.exerciseId,
        order: log.order,
        targetSets: log.sets.length,
        targetReps: log.sets[0]?.reps || '1',
        restSeconds: 0
      }))
    } satisfies WorkoutTemplate : {
      id: 'empty', name: 'Entrenamiento', dayOfWeek: new Date().getDay(), exercises: []
    } satisfies WorkoutTemplate)
  const initialStateRef = useRef<{
    logs: DraftExerciseLog[]
    initialLogs: DraftExerciseLog[]
    startedAt: string
    pendingDraft: StoredWorkoutDraft | null
    draftActive: boolean
    viewMode: WorkoutViewMode
    guidedPosition: GuidedPosition | null
  }>()
  if (!initialStateRef.current) {
    const freshLogs = createFreshWorkoutLogs(template, sessions, exercises)
    let sameDayDraft = readWorkoutDraft(userKey, localDate, template)
    if (sameDayDraft && hasCompletedSessionForDraft(sessions, sameDayDraft)) {
      removeWorkoutDraft(userKey, localDate, template)
      sameDayDraft = null
    }
    const canAutoRestore = sameDayDraft !== null
    initialStateRef.current = {
      logs: sameDayDraft?.logs ?? freshLogs,
      initialLogs: freshLogs,
      startedAt: sameDayDraft?.startedAt ?? new Date().toISOString(),
      pendingDraft: null,
      draftActive: Boolean(canAutoRestore),
      viewMode: sameDayDraft?.viewMode ?? 'full',
      guidedPosition: sameDayDraft?.guidedPosition ?? null
    }
  }
  const [logs, setLogs] = useState<DraftExerciseLog[]>(() => initialStateRef.current!.logs)
  const [initialLogs, setInitialLogs] = useState<DraftExerciseLog[]>(() => initialStateRef.current!.initialLogs)
  const [startedAt, setStartedAt] = useState(() => initialStateRef.current!.startedAt)
  const [pendingDraft, setPendingDraft] = useState<StoredWorkoutDraft | null>(() => initialStateRef.current!.pendingDraft)
  const [draftActive, setDraftActive] = useState(() => initialStateRef.current!.draftActive)
  const [viewMode, setViewMode] = useState<WorkoutViewMode>(() => initialStateRef.current!.viewMode)
  const [guidedPosition, setGuidedPosition] = useState<GuidedPosition | null>(() => initialStateRef.current!.guidedPosition)
  const [guidedFeedback, setGuidedFeedback] = useState<GuidedFeedback | null>(null)
  const [guidedStepAnimationKey, setGuidedStepAnimationKey] = useState(0)
  const [draftSyncStatus, setDraftSyncStatus] = useState<DraftSyncStatus>(
    initialStateRef.current!.draftActive ? (user ? 'pending' : 'local') : 'idle'
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [localSaveError, setLocalSaveError] = useState<string | null>(null)
  const [draftSyncError, setDraftSyncError] = useState<string | null>(null)
  const [draftHydrationStatus, setDraftHydrationStatus] = useState<DraftHydrationStatus>(user ? 'hydrating' : 'ready')
  const [userChangeRevision, setUserChangeRevision] = useState(0)
  const [hydratedLocalNeedsUpload, setHydratedLocalNeedsUpload] = useState(false)
  const userChangeRevisionRef = useRef(userChangeRevision)
  userChangeRevisionRef.current = userChangeRevision
  const draftMutationBlocked = useRef(false)
  const syncGeneration = useRef(0)
  const [hydrationRetry, setHydrationRetry] = useState(0)
  const previousTemplateRef = useRef(template)
  const draftToContinueRef = useRef<StoredWorkoutDraft | null>(null)
  const guidedFeedbackTimeoutRef = useRef<number | null>(null)
  const reviewingCompletedGuidedStepRef = useRef(false)
  const remoteRestoreRequestRef = useRef(0)
  const remoteSyncTimeoutRef = useRef<number | null>(null)
  const lastSyncedDraftUpdatedAtRef = useRef<string | null>(null)
  const syncedUserChangeRevisionRef = useRef(0)
  const previousViewModeRef = useRef(viewMode)
  const resolvedSessionsRef = useRef(sessions)
  const draftWeightsAreAuthoritativeRef = useRef(initialStateRef.current!.draftActive)
  const lastLocalDraftRef = useRef<StoredWorkoutDraft | null>(
    initialStateRef.current!.draftActive
      ? createStoredWorkoutDraft(
          userKey,
          template,
          initialStateRef.current!.startedAt,
          initialStateRef.current!.logs,
          initialStateRef.current!.viewMode,
          initialStateRef.current!.guidedPosition,
          localDate,
          readWorkoutDraft(userKey, localDate, template)?.updatedAt ?? new Date().toISOString()
        )
      : null
  )
  const restoredFullScrollKeyRef = useRef<string | null>(null)
  const fullScrollKey = `${WORKOUT_FULL_SCROLL_PREFIX}.${userKey}.${template.id}.day-${template.dayOfWeek}.${startedAt}`

  const saveFullScrollPosition = useCallback(() => {
    if (viewMode !== 'full') return
    try {
      window.sessionStorage.setItem(fullScrollKey, String(Math.max(0, Math.round(window.scrollY))))
    } catch (error) {
      console.error('[workout] No se pudo guardar la posición de scroll:', error)
    }
  }, [fullScrollKey, viewMode])

  const clearFullScrollPosition = useCallback(() => {
    try {
      window.sessionStorage.removeItem(fullScrollKey)
    } catch (error) {
      console.error('[workout] No se pudo limpiar la posición de scroll:', error)
    }
  }, [fullScrollKey])

  const restoreFullScrollPosition = useCallback(() => {
    let saved = 0
    try {
      saved = Number(window.sessionStorage.getItem(fullScrollKey) ?? 0)
    } catch (error) {
      console.error('[workout] No se pudo leer la posición de scroll:', error)
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight
        )
        window.scrollTo({
          top: Math.min(Math.max(0, saved), maxScroll),
          left: 0,
          behavior: 'auto'
        })
      })
    })
  }, [fullScrollKey])

  const progress = useMemo(() => {
    const sets = logs.flatMap((log) => log.sets)
    return {
      completed: sets.filter((set) => set.completed).length,
      total: sets.length
    }
  }, [logs])
  const canonicalExerciseIds = useMemo(
    () => createCanonicalExerciseIdMap(exercises, templates, sessions),
    [exercises, sessions, templates]
  )
  const guidedSteps = useMemo(() => template.exercises.flatMap((item) => {
    const log = logs.find((entry) => entry.exerciseId === item.exerciseId)
    if (!log) return []
    return log.sets.map((set, setIndex) => ({
      templateExercise: item,
      exercise: getExerciseById(item.exerciseId),
      log,
      set,
      setIndex
    }))
  }), [getExerciseById, logs, template.exercises])
  const firstPendingStep = guidedSteps.find((step) => !step.set.completed) ?? null
  const fallbackGuidedStep = firstPendingStep ?? guidedSteps[0] ?? null
  const selectedGuidedStep = guidedSteps.find((step) =>
    step.set.id === guidedPosition?.setId &&
    (
      step.log.exerciseId === guidedPosition.exerciseId ||
      (!guidedPosition.exerciseId && step.log.id === guidedPosition.logId)
    )
  ) ?? null
  const guidedIsComplete = guidedSteps.length > 0 && guidedSteps.every((step) => step.set.completed)
  const selectedGuidedIndex = selectedGuidedStep ? guidedSteps.indexOf(selectedGuidedStep) : -1
  const resolvedPendingIndex = resolvePendingGuidedIndex(
    guidedSteps.map((step) => step.set.completed),
    selectedGuidedIndex,
    reviewingCompletedGuidedStepRef.current
  )
  const resolvedSelectedGuidedStep = guidedSteps[resolvedPendingIndex] ?? null
  const currentGuidedStep = selectedGuidedStep
    ? resolvedSelectedGuidedStep
    : !guidedPosition && !guidedIsComplete ? fallbackGuidedStep : null
  const currentGuidedIndex = currentGuidedStep
    ? guidedSteps.findIndex((step) =>
        step.log.id === currentGuidedStep.log.id && step.set.id === currentGuidedStep.set.id
      )
    : -1
  const guidedPreviousPerformance = useMemo(() => {
    if (!currentGuidedStep) return null
    const equivalentIds = new Set(getEquivalentExerciseIds(exercises, currentGuidedStep.templateExercise.exerciseId))
    for (const [from, to] of canonicalExerciseIds) {
      if (to === currentGuidedStep.templateExercise.exerciseId) equivalentIds.add(from)
    }
    return getLastExercisePerformanceFromSessions(
      sessions,
      currentGuidedStep.templateExercise.exerciseId,
      [...equivalentIds]
    )
  }, [canonicalExerciseIds, currentGuidedStep, exercises, sessions])
  const completedVolume = useMemo(() => logs.reduce(
    (total, log) => total + log.sets.reduce(
      (sum, set) => sum + (set.completed ? Number(set.reps || 0) * set.weightKg : 0),
      0
    ),
    0
  ), [logs])

  useEffect(() => {
    if (!syncReady || resolvedSessionsRef.current === sessions) return
    resolvedSessionsRef.current = sessions
    if (draftWeightsAreAuthoritativeRef.current) return
    const resolvedLogs = createExerciseLogs(template, sessions, exercises)
    setLogs((current) => reconcileUntouchedExerciseWeights(current, initialLogs, resolvedLogs))
    setInitialLogs(resolvedLogs)
  }, [exercises, initialLogs, sessions, syncReady, template])
  const hasDraftChanges = !logsAreEqual(logs, initialLogs)
  const hasDraftState = hasDraftChanges || viewMode !== 'full' || Boolean(guidedPosition)
  const draftStatusLabel = localSaveError
    ? 'No se pudo guardar en este dispositivo'
    : draftSyncError
      ? 'Guardado en este dispositivo · nube pendiente'
      : !user && draftActive
        ? 'Guardado en este dispositivo'
        : draftHydrationStatus === 'hydrating'
      ? 'Comprobando borrador sincronizado…'
      : draftSyncStatus === 'synced'
      ? 'Borrador sincronizado'
      : draftSyncStatus === 'syncing'
        ? 'Sincronizando borrador…'
        : draftSyncStatus === 'error'
          ? 'Guardado en este dispositivo · nube pendiente'
          : draftSyncStatus === 'local'
            ? 'Guardado en este dispositivo'
            : 'Guardado en este dispositivo · nube pendiente'

  const confirmRemoteSync = useCallback((
    sentDraft: StoredWorkoutDraft,
    remoteUpdatedAt: string,
    sentUserChangeRevision: number
  ) => {
    lastSyncedDraftUpdatedAtRef.current = remoteUpdatedAt
    if (lastLocalDraftRef.current !== sentDraft || userChangeRevisionRef.current !== sentUserChangeRevision) {
      setDraftSyncStatus('pending')
      return
    }
    const normalized = writeWorkoutDraft(
      userKey, template, sentDraft.startedAt, sentDraft.logs,
      sentDraft.viewMode ?? 'full', sentDraft.guidedPosition ?? null,
      localDate, remoteUpdatedAt
    )
    if (normalized) lastLocalDraftRef.current = normalized
    else setLocalSaveError('No se pudo actualizar la copia local. No cierres esta pantalla hasta resolverlo.')
    lastSyncedDraftUpdatedAtRef.current = normalized?.updatedAt ?? remoteUpdatedAt
    syncedUserChangeRevisionRef.current = sentUserChangeRevision
    setHydratedLocalNeedsUpload(false)
    setDraftSyncError(null)
    setDraftSyncStatus('synced')
  }, [localDate, template, userKey])

  useLayoutEffect(() => {
    if (viewMode !== 'full') return
    if (restoredFullScrollKeyRef.current === fullScrollKey) return
    restoredFullScrollKeyRef.current = fullScrollKey
    restoreFullScrollPosition()
  }, [fullScrollKey, restoreFullScrollPosition, viewMode])

  useEffect(() => {
    if (viewMode !== 'full') return
    let frameId = 0
    function handleScroll() {
      if (frameId) return
      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        saveFullScrollPosition()
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      saveFullScrollPosition()
      window.removeEventListener('scroll', handleScroll)
    }
  }, [saveFullScrollPosition, viewMode])

  useEffect(() => {
    if (viewMode === 'guided' && previousViewModeRef.current !== 'guided') {
      scrollToPageTop()
    }
    previousViewModeRef.current = viewMode
  }, [viewMode])

  const getGuidedPositionFromStep = useCallback((step: (typeof guidedSteps)[number]): GuidedPosition => {
    return { exerciseId: step.log.exerciseId, setId: step.set.id }
  }, [])

  function getSetNumberFromSetId(setId: string) {
    const match = setId.match(/-set-(\d+)$/)
    if (!match) return null
    const setNumber = Number(match[1])
    return Number.isInteger(setNumber) && setNumber > 0 ? setNumber : null
  }

  const findRecoveryGuidedStep = useCallback((position: GuidedPosition | null) => {
    if (guidedSteps.length === 0) return null
    if (!position) return firstPendingStep ?? guidedSteps[0]

    const exerciseSteps = guidedSteps.filter((step) =>
      position.exerciseId
        ? step.log.exerciseId === position.exerciseId
        : step.log.id === position.logId
    )
    if (exerciseSteps.length > 0) {
      const removedSetNumber = getSetNumberFromSetId(position.setId)
      if (removedSetNumber) {
        return (
          exerciseSteps.find((step) => step.set.setNumber >= removedSetNumber) ??
          exerciseSteps[exerciseSteps.length - 1]
        )
      }
      return exerciseSteps[exerciseSteps.length - 1]
    }

    return firstPendingStep ?? guidedSteps[0]
  }, [firstPendingStep, guidedSteps])

  useEffect(() => {
    if (viewMode !== 'guided') return
    if (guidedSteps.length === 0) {
      if (guidedPosition) setGuidedPosition(null)
      return
    }
    const selectedStep = guidedSteps.find((step) =>
      step.set.id === guidedPosition?.setId &&
      (
        step.log.exerciseId === guidedPosition.exerciseId ||
        (!guidedPosition.exerciseId && step.log.id === guidedPosition.logId)
      )
    ) ?? null

    if (selectedStep) {
      if (selectedStep.set.completed && !reviewingCompletedGuidedStepRef.current) {
        const selectedIndex = guidedSteps.findIndex((step) => step === selectedStep)
        const pendingIndex = resolvePendingGuidedIndex(
          guidedSteps.map((step) => step.set.completed),
          selectedIndex
        )
        const pendingStep = guidedSteps[pendingIndex]
        setGuidedPosition(pendingStep ? getGuidedPositionFromStep(pendingStep) : null)
        return
      }
      if (!guidedPosition?.exerciseId) {
        setGuidedPosition(getGuidedPositionFromStep(selectedStep))
      }
      return
    }

    if (!guidedPosition && guidedIsComplete) return

    const recoveryStep = findRecoveryGuidedStep(guidedPosition)
    if (recoveryStep) {
      setGuidedPosition(getGuidedPositionFromStep(recoveryStep))
    } else if (guidedPosition) {
      setGuidedPosition(null)
    }
  }, [
    findRecoveryGuidedStep,
    firstPendingStep,
    getGuidedPositionFromStep,
    guidedIsComplete,
    guidedPosition,
    guidedSteps,
    viewMode
  ])

  useEffect(() => () => {
    if (guidedFeedbackTimeoutRef.current) {
      window.clearTimeout(guidedFeedbackTimeoutRef.current)
    }
    if (remoteSyncTimeoutRef.current) {
      window.clearTimeout(remoteSyncTimeoutRef.current)
    }
    syncGeneration.current += 1
    remoteRestoreRequestRef.current += 1
  }, [])

  useEffect(() => {
    if (!user) {
      setDraftHydrationStatus('ready')
      setHydratedLocalNeedsUpload(false)
      setDraftSyncStatus(readWorkoutDraft(userKey, localDate, template) ? 'local' : 'idle')
      lastSyncedDraftUpdatedAtRef.current = null
      return
    }

    if (draftMutationBlocked.current) return
    const revisionAtStart = userChangeRevisionRef.current
    const requestId = remoteRestoreRequestRef.current + 1
    remoteRestoreRequestRef.current = requestId
    setDraftHydrationStatus('hydrating')
    const localDraftAtStart = readWorkoutDraft(userKey, localDate, template)

    void getRemoteWorkoutDraft<StoredWorkoutDraft>(template.dayOfWeek, getWorkoutRemoteDraftKey(localDate, template), user.id)
      .then((remoteDraft) => {
        if (remoteRestoreRequestRef.current !== requestId) return
        if (draftMutationBlocked.current) return
        setDraftSyncError(null)
        // La lectura tardía nunca sustituye una edición realizada mientras esperaba.
        if (userChangeRevisionRef.current !== revisionAtStart ||
          userChangeRevisionRef.current > syncedUserChangeRevisionRef.current) {
          setDraftHydrationStatus('ready')
          return
        }
        if (!remoteDraft || !isValidWorkoutDraftPayload(remoteDraft.payload, userKey, localDate, template)) {
          if (localDraftAtStart) {
            setInitialLogs(createExerciseLogs(template, sessions, exercises))
            setLogs(localDraftAtStart.logs)
            setStartedAt(localDraftAtStart.startedAt)
            setPendingDraft(null)
            setDraftActive(true)
            setViewMode(localDraftAtStart.viewMode ?? 'full')
            setGuidedPosition(localDraftAtStart.guidedPosition ?? null)
            lastLocalDraftRef.current = localDraftAtStart
            setHydratedLocalNeedsUpload(true)
            setDraftSyncStatus('pending')
          }
          setDraftHydrationStatus('ready')
          return
        }

        const remotePayload = {
          ...remoteDraft.payload,
          updatedAt: remoteDraft.updatedAt
        }
        if (hasCompletedSessionForDraft(sessions, remotePayload)) {
          const local = lastLocalDraftRef.current
          const completedLocal = local && hasCompletedSessionForDraft(sessions, local)
          if (completedLocal) {
            removeWorkoutDraft(userKey, localDate, template)
            lastLocalDraftRef.current = null
            const freshLogs = createExerciseLogs(template, sessions, exercises)
            setInitialLogs(freshLogs)
            setLogs(freshLogs)
            setStartedAt(new Date().toISOString())
            setDraftActive(false)
            setViewMode('full')
            setGuidedPosition(null)
          }
          void deleteRemoteWorkoutDraft(template.dayOfWeek, getWorkoutRemoteDraftKey(localDate, template), user.id).catch((error) => setDraftSyncError(getDraftSyncErrorMessage(error)))
          const needsUpload = Boolean(local && !completedLocal)
          setDraftSyncStatus(needsUpload ? 'pending' : 'idle')
          setHydratedLocalNeedsUpload(needsUpload)
          setDraftHydrationStatus('ready')
          return
        }
        if (userChangeRevisionRef.current > syncedUserChangeRevisionRef.current) {
          setDraftHydrationStatus('ready')
          return
        }
        const currentLocalDraft = readWorkoutDraft(userKey, localDate, template)
        const localDraft = currentLocalDraft ?? localDraftAtStart
        const freshLogs = createExerciseLogs(template, sessions, exercises)
        const localPristine = Boolean(localDraft) &&
          logsAreEqual(localDraft!.logs, freshLogs) &&
          (localDraft!.viewMode ?? 'full') === 'full' &&
          !localDraft!.guidedPosition
        const newestDraft = selectSafeWorkoutDraft(localDraft, remotePayload, {
          localPristine,
          remoteHasProgress: countCompletedDraftSets(remotePayload) > 0 ||
            !logsAreEqual(remotePayload.logs, freshLogs) ||
            (remotePayload.viewMode ?? 'full') !== 'full' ||
            Boolean(remotePayload.guidedPosition)
        })
        const remoteIsNewer = newestDraft.source === 'remote'

        if (remoteIsNewer) {
          setInitialLogs(createExerciseLogs(template, sessions, exercises))
          setLogs(remotePayload.logs)
          setStartedAt(remotePayload.startedAt)
          setPendingDraft(null)
          setDraftActive(true)
          setViewMode(remotePayload.viewMode ?? 'full')
          setGuidedPosition(remotePayload.guidedPosition ?? null)
          lastLocalDraftRef.current = remotePayload
          lastSyncedDraftUpdatedAtRef.current = remotePayload.updatedAt
          setHydratedLocalNeedsUpload(false)
          const restored = writeWorkoutDraft(
            userKey,
            template,
            remotePayload.startedAt,
            remotePayload.logs,
            remotePayload.viewMode ?? 'full',
            remotePayload.guidedPosition ?? null,
            localDate,
            remotePayload.updatedAt
          )
          draftWeightsAreAuthoritativeRef.current = true
          if (!restored) setLocalSaveError('El borrador está en la nube, pero no se pudo guardar su copia local. Reintenta antes de continuar.')
          setDraftSyncStatus('synced')
        } else if (localDraft) {
          setInitialLogs(createExerciseLogs(template, sessions, exercises))
          setLogs(localDraft.logs)
          setStartedAt(localDraft.startedAt)
          setPendingDraft(null)
          setDraftActive(true)
          setViewMode(localDraft.viewMode ?? 'full')
          setGuidedPosition(localDraft.guidedPosition ?? null)
          lastLocalDraftRef.current = localDraft
          setHydratedLocalNeedsUpload(true)
          setDraftSyncStatus('pending')
        } else {
          setDraftSyncStatus('idle')
        }
        setDraftHydrationStatus('ready')
      })
      .catch((error) => {
        if (remoteRestoreRequestRef.current !== requestId) return
        console.error('[workout] No se pudo recuperar el borrador sincronizado:', error)
        setDraftSyncError(getDraftSyncErrorMessage(error))
        setDraftSyncStatus('error')
        setHydratedLocalNeedsUpload(false)
        setDraftHydrationStatus('error')
      })
    return () => { remoteRestoreRequestRef.current += 1 }
  }, [exercises, hydrationRetry, localDate, sessions, template, user, userKey])

  useEffect(() => {
    const previousTemplate = previousTemplateRef.current
    if (previousTemplate.id === template.id && previousTemplate.dayOfWeek === template.dayOfWeek) return

    const shouldStorePreviousDraft = draftHydrationStatus === 'ready' &&
      userChangeRevision > syncedUserChangeRevisionRef.current &&
      (draftActive || hasDraftState)
    if (shouldStorePreviousDraft) {
      writeWorkoutDraft(userKey, previousTemplate, startedAt, logs, viewMode, guidedPosition, localDate)
    }
    clearFullScrollPosition()

    const nextInitialLogs = createExerciseLogs(template, sessions, exercises)
    const nextDraft = readWorkoutDraft(userKey, localDate, template)
    const forcedDraft = draftToContinueRef.current?.templateId === template.id
      ? draftToContinueRef.current
      : null
    draftToContinueRef.current = null
    const draftToRestore = forcedDraft ?? nextDraft
    previousTemplateRef.current = template
    setInitialLogs(nextInitialLogs)
    setLogs(draftToRestore?.logs ?? nextInitialLogs)
    setStartedAt(draftToRestore?.startedAt ?? new Date().toISOString())
    setPendingDraft(null)
    setDraftActive(Boolean(draftToRestore))
    setViewMode(draftToRestore?.viewMode ?? 'full')
    setGuidedPosition(draftToRestore?.guidedPosition ?? null)
    setSaveError(null)
  }, [clearFullScrollPosition, draftActive, draftHydrationStatus, exercises, guidedPosition, hasDraftState, localDate, logs, sessions, startedAt, template, userChangeRevision, userKey, viewMode])

  // Guardado local antes de pintar; no depende de Supabase ni de su hidratación.
  useLayoutEffect(() => {
    if (pendingDraft || draftMutationBlocked.current || (userChangeRevision === 0 && !localSaveError)) return
    const previous = lastLocalDraftRef.current
    if (!localSaveError && previous && previous.startedAt === startedAt && previous.templateId === template.id &&
      previous.localDate === localDate && logsAreEqual(previous.logs, logs) &&
      previous.viewMode === viewMode &&
      JSON.stringify(previous.guidedPosition ?? null) === JSON.stringify(normalizeGuidedPosition(logs, guidedPosition))) return
    const storedDraft = writeWorkoutDraft(userKey, template, startedAt, logs, viewMode, guidedPosition, localDate)
    if (!storedDraft) {
      setLocalSaveError('No se pudo guardar el borrador en este dispositivo. No cierres esta pantalla; libera espacio o reintenta el guardado.')
      setDraftSyncStatus('local-error')
      return
    }
    lastLocalDraftRef.current = storedDraft
    setLocalSaveError(null)
    setDraftSyncStatus(user ? 'pending' : 'local')
    setDraftActive(true)
  }, [guidedPosition, hydrationRetry, localDate, localSaveError, logs, pendingDraft, startedAt, template, user, userChangeRevision, userKey, viewMode])

  useEffect(() => {
    if (!user || pendingDraft || localSaveError || draftMutationBlocked.current || draftHydrationStatus !== 'ready') return
    if (!shouldAutosaveWorkoutDraft({
      hydrationReady: draftHydrationStatus === 'ready',
      userChangeRevision,
      syncedUserChangeRevision: syncedUserChangeRevisionRef.current,
      hydratedLocalNeedsUpload
    })) return

    const generation = syncGeneration.current
    const draftToSync = lastLocalDraftRef.current
    if (!draftToSync) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setDraftSyncError(null)
      setDraftSyncStatus('pending')
      return
    }

    if (remoteSyncTimeoutRef.current) {
      window.clearTimeout(remoteSyncTimeoutRef.current)
    }

    remoteSyncTimeoutRef.current = window.setTimeout(() => {
      if (draftMutationBlocked.current || generation !== syncGeneration.current) return
      const sentUserChangeRevision = userChangeRevision
      setDraftSyncError(null)
      setDraftSyncStatus('syncing')
      void upsertRemoteWorkoutDraft(
        template.dayOfWeek,
        getWorkoutRemoteDraftKey(localDate, template),
        draftToSync,
        user.id
      )
        .then((remoteDraft) => {
          if (generation === syncGeneration.current && !draftMutationBlocked.current) confirmRemoteSync(draftToSync, remoteDraft.updatedAt, sentUserChangeRevision)
        })
        .catch((error) => {
          if (generation !== syncGeneration.current || draftMutationBlocked.current) return
          console.error('[workout] No se pudo sincronizar el borrador:', error)
          setDraftSyncError(getDraftSyncErrorMessage(error))
          setDraftSyncStatus('error')
        })
    }, 2500)

    return () => {
      if (remoteSyncTimeoutRef.current) {
        window.clearTimeout(remoteSyncTimeoutRef.current)
      }
    }
  }, [confirmRemoteSync, draftHydrationStatus, guidedPosition, hydratedLocalNeedsUpload, localDate, localSaveError, logs, pendingDraft, startedAt, template, user, userChangeRevision, userKey, viewMode])

  useEffect(() => {
    if (!user) return
    const retry = () => setHydrationRetry((current) => current + 1)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [user])

  function updateLog(updatedLog: DraftExerciseLog) {
    setUserChangeRevision((current) => current + 1)
    setLogs((current) => current.map((log) => log.id === updatedLog.id ? updatedLog : log))
  }

  function showGuidedFeedback(feedback: GuidedFeedback) {
    setGuidedFeedback(feedback)
    setGuidedStepAnimationKey((current) => current + 1)
    if (guidedFeedbackTimeoutRef.current) {
      window.clearTimeout(guidedFeedbackTimeoutRef.current)
    }
    guidedFeedbackTimeoutRef.current = window.setTimeout(() => {
      setGuidedFeedback(null)
    }, 1100)
  }

  function updateGuidedLog(updatedLog: DraftExerciseLog) {
    updateLog(updatedLog)
  }

  function updateGuidedSet(logId: string, setId: string, changes: Partial<DraftExerciseLog['sets'][number]>) {
    setUserChangeRevision((current) => current + 1)
    setLogs((current) => current.map((log) =>
      log.id === logId
        ? {
            ...log,
            sets: log.sets.map((set) => set.id === setId ? { ...set, ...changes } : set)
          }
        : log
    ))
  }

  function goToGuidedStep(index: number) {
    const step = guidedSteps[Math.min(Math.max(index, 0), guidedSteps.length - 1)]
    if (!step) return
    setUserChangeRevision((current) => current + 1)
    saveFullScrollPosition()
    setGuidedPosition(getGuidedPositionFromStep(step))
    setViewMode('guided')
    scrollToPageTop()
  }

  function goToPreviousGuidedStep() {
    if (currentGuidedIndex <= 0) return
    reviewingCompletedGuidedStepRef.current = true
    goToGuidedStep(currentGuidedIndex - 1)
  }

  function findNextGuidedStep(fromIndex: number) {
    return guidedSteps[fromIndex + 1] ?? null
  }

  function completeGuidedSet() {
    if (!currentGuidedStep) return
    const reps = currentGuidedStep.set.reps.trim()
    if (!currentGuidedStep.set.completed && reps === '') {
      setSaveError('Escribe las repeticiones de la serie actual antes de marcarla como hecha.')
      return
    }
    if (!currentGuidedStep.set.completed && (!/^\d+$/.test(reps) || Number(reps) <= 0)) {
      setSaveError('Las repeticiones deben ser un numero entero mayor que 0.')
      return
    }

    setUserChangeRevision((current) => current + 1)
    reviewingCompletedGuidedStepRef.current = false
    setSaveError(null)
    const nextStep = findNextGuidedStep(currentGuidedIndex)
    if (!currentGuidedStep.set.completed) {
      updateGuidedSet(currentGuidedStep.log.id, currentGuidedStep.set.id, { completed: true, reps })
    }
    if (nextStep) {
      const exerciseChanged = nextStep.log.id !== currentGuidedStep.log.id
      if (!currentGuidedStep.set.completed) {
        showGuidedFeedback(
          exerciseChanged
            ? {
                message: 'Ejercicio completado',
                detail: `Siguiente: ${nextStep.exercise?.name ?? 'siguiente ejercicio'}`
              }
            : {
                message: `Serie ${currentGuidedStep.setIndex + 1} completada`
              }
        )
      }
      setGuidedPosition(getGuidedPositionFromStep(nextStep))
    } else {
      showGuidedFeedback({ message: 'Entrenamiento completado' })
      setGuidedPosition(null)
    }
  }

  function updateGuidedWeight(value: number) {
    if (!currentGuidedStep) return
    updateGuidedLog(applyWorkingWeight(currentGuidedStep.log, value))
  }

  function updateGuidedReps(value: string) {
    if (!currentGuidedStep) return
    updateGuidedSet(currentGuidedStep.log.id, currentGuidedStep.set.id, {
      reps: normalizeRepsInput(value)
    })
  }

  function enterGuidedMode() {
    setUserChangeRevision((current) => current + 1)
    saveFullScrollPosition()
    reviewingCompletedGuidedStepRef.current = false
    const selectedIndex = selectedGuidedStep
      ? guidedSteps.findIndex((step) => step === selectedGuidedStep)
      : -1
    const pendingIndex = resolvePendingGuidedIndex(
      guidedSteps.map((step) => step.set.completed),
      selectedIndex
    )
    const pendingStep = guidedSteps[pendingIndex]
    if (pendingStep) {
      setGuidedPosition(getGuidedPositionFromStep(pendingStep))
    } else {
      setGuidedPosition(null)
    }
    setViewMode('guided')
    scrollToPageTop()
  }

  function enterFullMode() {
    setUserChangeRevision((current) => current + 1)
    setViewMode('full')
    restoredFullScrollKeyRef.current = null
  }

  function restoreDraft(draft: StoredWorkoutDraft) {
    if (draft.templateId !== template.id) {
      draftToContinueRef.current = draft
      navigate(`/entrenamiento/${draft.templateId}`)
      return
    }
    const nextInitialLogs = createExerciseLogs(template, sessions, exercises)
    draftWeightsAreAuthoritativeRef.current = true
    setInitialLogs(nextInitialLogs)
    setLogs(draft.logs)
    setStartedAt(draft.startedAt)
    setDraftActive(true)
    setViewMode(draft.viewMode ?? 'full')
    setGuidedPosition(draft.guidedPosition ?? null)
    setPendingDraft(null)
    setSaveError(null)
  }

  function continueDraft() {
    if (!pendingDraft) return
    restoreDraft(pendingDraft)
  }

  async function discardDraft() {
    if (draftMutationBlocked.current || !window.confirm('¿Seguro que quieres descartar el entrenamiento en curso?')) return
    draftMutationBlocked.current = true
    syncGeneration.current += 1
    const generation = syncGeneration.current
    remoteRestoreRequestRef.current += 1
    if (remoteSyncTimeoutRef.current) window.clearTimeout(remoteSyncTimeoutRef.current)
    setSaving(true)
    try {
      if (user) {
        const day = pendingDraft?.dayOfWeek ?? template.dayOfWeek
        const key = pendingDraft
          ? getDatedRemoteDraftKey(pendingDraft.localDate, pendingDraft.templateId)
          : getWorkoutRemoteDraftKey(localDate, template)
        await deleteRemoteWorkoutDraft(day, key, user.id)
      }
      if (generation !== syncGeneration.current) return
      if (pendingDraft) removeWorkoutDraftByKey(userKey, pendingDraft.localDate, pendingDraft.templateId)
      else removeWorkoutDraft(userKey, localDate, template)
      lastLocalDraftRef.current = null
      lastSyncedDraftUpdatedAtRef.current = null
      clearFullScrollPosition()
      const nextLogs = createExerciseLogs(template, sessions, exercises)
      draftWeightsAreAuthoritativeRef.current = false
      setInitialLogs(nextLogs)
      setLogs(nextLogs)
      setStartedAt(new Date().toISOString())
      setPendingDraft(null)
      setDraftActive(false)
      setDraftSyncStatus('idle')
      syncedUserChangeRevisionRef.current = 0
      setUserChangeRevision(0)
      setHydratedLocalNeedsUpload(false)
      setViewMode('full')
      setGuidedPosition(null)
      setSaveError(null)
      setLocalSaveError(null)
      setDraftSyncError(null)
    } catch {
      setSaveError('No se pudo confirmar el descarte en la nube. El borrador se conserva; vuelve a intentarlo cuando tengas conexión.')
    } finally {
      draftMutationBlocked.current = false
      setSaving(false)
      setHydrationRetry((current) => current + 1)
    }
  }

  async function finishWorkout() {
    if (draftMutationBlocked.current) return
    setSaveError(null)
    const validationError = validateWorkoutDraft(logs)[0]
    if (validationError) {
      const exerciseName =
        getExerciseById(validationError.exerciseId)?.name ?? validationError.exerciseId
      setSaveError(
        `${exerciseName}, serie ${validationError.setNumber}: ${validationError.message}`
      )
      return
    }

    // El snapshot se conserva también si la respuesta del servidor se pierde.
    const savedDraft = writeWorkoutDraft(userKey, template, startedAt, logs, viewMode, guidedPosition, localDate)
    if (!savedDraft) {
      setLocalSaveError('No se pudo conservar el borrador. Libera espacio y reintenta antes de cerrar esta pantalla.')
      return
    }
    lastLocalDraftRef.current = savedDraft
    setLocalSaveError(null)
    draftMutationBlocked.current = true
    syncGeneration.current += 1
    const generation = syncGeneration.current
    remoteRestoreRequestRef.current += 1
    if (remoteSyncTimeoutRef.current) window.clearTimeout(remoteSyncTimeoutRef.current)
    setSaving(true)
    let completed = false
    try {
      const session = createWorkoutSession({ template, logs, startedAt })
      await saveSession(session)
      if (generation !== syncGeneration.current) return
      removeWorkoutDraft(userKey, localDate, template)
      clearFullScrollPosition()
      if (user) {
        try {
          await deleteRemoteWorkoutDraft(template.dayOfWeek, getWorkoutRemoteDraftKey(localDate, template), user.id)
        } catch (draftError) {
          console.error('[workout] No se pudo borrar el borrador sincronizado tras guardar:', draftError)
        }
      }
      lastLocalDraftRef.current = null
      lastSyncedDraftUpdatedAtRef.current = null
      setDraftActive(false)
      setPendingDraft(null)
      setDraftSyncStatus('idle')
      setViewMode('full')
      setGuidedPosition(null)
      completed = true
      if (generation === syncGeneration.current) navigate('/historial', { state: { workoutSaved: true } })
    } catch (error) {
      console.error('[workout] Error exacto al guardar el entrenamiento:', error)
      setSaveError(error instanceof Error ? error.message : 'No se pudo confirmar el guardado. Tu borrador está en este dispositivo; puedes reintentar sin duplicar la sesión.')
    } finally {
      if (!completed) {
        draftMutationBlocked.current = false
        setHydrationRetry((current) => current + 1)
      }
      setSaving(false)
    }
  }

  return (
    !syncReady ? (
      <div className="card p-6 text-center" role="status" aria-live="polite">
        <Dumbbell className="mx-auto size-7 animate-pulse text-brand" aria-hidden="true" />
        <p className="mt-3 font-extrabold text-ink">Preparando pesos del entrenamiento…</p>
      </div>
    ) : (
    <fieldset disabled={saving} className="min-w-0 space-y-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-5 lg:pb-0">
      <div
        className="pointer-events-none fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top))] z-40 flex justify-center lg:left-[calc(232px+1rem)] lg:top-20"
        aria-live="polite"
        aria-atomic="true"
      >
        {guidedFeedback && (
          <div
            role="status"
            className="w-fit max-w-md animate-[guidedToast_1100ms_ease-in-out_both] rounded-xl border border-success/30 bg-surface/95 px-4 py-2.5 text-center shadow-card backdrop-blur-xl"
          >
            <p className="text-sm font-extrabold text-success-text">{guidedFeedback.message}</p>
            {guidedFeedback.detail && (
              <p className="mt-0.5 text-xs font-bold text-secondary">{guidedFeedback.detail}</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line/70 bg-raised p-1">
        <button
          type="button"
          onClick={enterFullMode}
          className={`min-h-10 rounded-lg px-3 text-sm font-extrabold transition ${
            viewMode === 'full'
              ? 'bg-brand-solid text-on-brand shadow-sm'
              : 'text-secondary hover:bg-muted'
          }`}
        >
          Vista completa
        </button>
        <button
          type="button"
          onClick={enterGuidedMode}
          className={`min-h-10 rounded-lg px-3 text-sm font-extrabold transition ${
            viewMode === 'guided'
              ? 'bg-brand-solid text-on-brand shadow-sm'
              : 'text-secondary hover:bg-muted'
          }`}
        >
          Modo guiado
        </button>
      </div>

      <section className="rounded-2xl border border-line/70 bg-surface/90 px-3.5 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="truncate text-lg font-extrabold text-ink">{template.name}</h2>
          <span className="shrink-0 text-sm font-extrabold text-secondary">
            {progress.completed}/{progress.total} series
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Progreso de series realizadas"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
        >
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }}
          />
        </div>
        {(draftActive || (hasDraftState && !pendingDraft)) && (
          <div className="mt-2 flex items-center">
            <span role="status" aria-live="polite" className="rounded-full bg-muted px-2 py-1 text-[11px] font-extrabold leading-none text-secondary">
              {draftStatusLabel}
            </span>
          </div>
        )}
      </section>

      {localSaveError && <p role="alert" className="status-error">{localSaveError}</p>}
      {(draftSyncError || localSaveError) && (
        <p role="alert" className="status-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{draftSyncError ?? 'El guardado local requiere atención.'}</span>
          <button type="button" className="underline" onClick={() => setHydrationRetry((current) => current + 1)}>Reintentar</button>
        </p>
      )}

      {pendingDraft && (
        <section className="rounded-xl border border-brand/25 bg-brand-soft/70 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-xs font-bold text-secondary sm:text-sm">
              <span className="font-extrabold text-ink">Entrenamiento en curso</span>
              <span aria-hidden="true"> · </span>
              {draftStatusLabel}
            </p>
            <button
              type="button"
              onClick={continueDraft}
              className="btn-primary shrink-0 !min-h-11 !px-3 !py-2 !text-sm"
            >
              Continuar
            </button>
          </div>
        </section>
      )}

      {viewMode === 'guided' ? (
        <section className="card overflow-hidden">
          {guidedIsComplete && !currentGuidedStep ? (
            <div className="space-y-5 p-5 sm:p-6">
              <div>
                <p className="eyebrow">{template.name}</p>
                <h3 className="mt-1 text-2xl font-extrabold text-ink">Entrenamiento completado</h3>
                <p className="mt-1 text-sm font-semibold text-secondary">
                  Revisa el resumen antes de guardar definitivamente.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-muted p-3">
                  <p className="text-lg font-extrabold text-ink">{logs.length}</p>
                  <p className="text-[11px] font-bold text-secondary">ejercicios</p>
                </div>
                <div className="rounded-2xl bg-muted p-3">
                  <p className="text-lg font-extrabold text-ink">{progress.completed}</p>
                  <p className="text-[11px] font-bold text-secondary">series hechas</p>
                </div>
                <div className="rounded-2xl bg-muted p-3">
                  <p className="text-lg font-extrabold text-ink">{formatCompactNumber(completedVolume)}</p>
                  <p className="text-[11px] font-bold text-secondary">kg volumen</p>
                </div>
              </div>
              {saveError && (
                <p role="alert" className="status-error">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{saveError}</span>
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void finishWorkout()}
                  disabled={saving || progress.completed === 0}
                  className="btn-primary !min-h-12 !bg-success-solid hover:!bg-success-solid-hover"
                >
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                  {saving ? 'Guardando...' : 'Finalizar y guardar'}
                </button>
                <button type="button" onClick={() => goToGuidedStep(0)} className="btn-secondary !min-h-12">
                  Volver a revisar
                </button>
              </div>
            </div>
          ) : currentGuidedStep ? (
            <div className="mx-auto max-w-lg space-y-3 p-3.5 sm:p-4">
              <div
                key={guidedStepAnimationKey}
                className="space-y-3 animate-[guidedStepIn_220ms_ease-out]"
              >
                <div className="text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-secondary">
                    {currentGuidedStep.exercise?.muscleGroup ?? 'Ejercicio'}
                  </p>
                  <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                    {currentGuidedStep.exercise?.name ?? 'Ejercicio'}
                  </h3>
                  <div className="mt-2 space-y-2">
                    <p className="text-sm font-bold text-secondary">
                      Serie {currentGuidedStep.setIndex + 1} de {currentGuidedStep.log.sets.length} · {currentGuidedStep.templateExercise.targetReps} reps · Descanso {formatRestSeconds(currentGuidedStep.templateExercise.restSeconds)}
                    </p>
                    {currentGuidedStep.set.completed && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success-soft px-2 py-0.5 text-xs font-extrabold text-success-text">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        Completada
                      </span>
                    )}
                    <div
                      className="flex flex-wrap items-center justify-center gap-1.5"
                      aria-label={`Series de ${currentGuidedStep.exercise?.name ?? 'este ejercicio'}`}
                    >
                      {currentGuidedStep.log.sets.map((set) => {
                        const isCurrent = set.id === currentGuidedStep.set.id

                        return (
                          <span
                            key={set.id}
                            aria-current={isCurrent ? 'step' : undefined}
                            aria-label={
                              set.completed
                                ? `Serie ${set.setNumber} completada`
                                : isCurrent
                                  ? `Serie ${set.setNumber} actual`
                                  : `Serie ${set.setNumber} pendiente`
                            }
                            className={`inline-flex size-7 items-center justify-center rounded-lg border text-xs font-extrabold leading-none transition ${
                              set.completed && isCurrent
                                ? 'border-brand bg-success-soft text-success-text shadow-sm ring-2 ring-brand'
                                : set.completed
                                  ? 'border-success/40 bg-success-soft text-success-text'
                                  : isCurrent
                                    ? 'border-brand bg-brand-solid text-on-brand shadow-sm ring-2 ring-brand-soft'
                                    : 'border-line bg-muted text-secondary'
                            }`}
                          >
                            {set.completed ? (
                              <CheckCircle2 className="size-4" aria-hidden="true" />
                            ) : (
                              set.setNumber
                            )}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-muted/45 p-3.5">
                  <div>
                    <label className="min-w-0" htmlFor={`guided-weight-${currentGuidedStep.log.id}`}>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-secondary">Peso</span>
                      <span className="relative block">
                        <input
                          id={`guided-weight-${currentGuidedStep.log.id}`}
                          className="min-h-11 w-full rounded-lg border border-control bg-surface py-2 pl-3 pr-10 text-xl font-extrabold text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.25"
                          value={String(getWorkingWeight(currentGuidedStep.log))}
                          onChange={(event) => updateGuidedWeight(Number(event.target.value))}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-secondary">
                          kg
                        </span>
                      </span>
                    </label>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-secondary">Reps reales</span>
                    <input
                      className="min-h-14 w-full rounded-xl border border-control bg-surface px-4 text-center text-4xl font-extrabold text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={currentGuidedStep.set.reps}
                      placeholder={currentGuidedStep.templateExercise.targetReps}
                      onChange={(event) => updateGuidedReps(event.target.value)}
                    />
                  </label>
                </div>

                {guidedPreviousPerformance && (
                  <div className="px-1 text-center text-xs font-semibold text-secondary">
                    {guidedPreviousPerformance && (
                      <p>
                        Última vez: <strong className="text-ink">{guidedPreviousPerformance.reps.join('-')}</strong>
                        {guidedPreviousPerformance.weightKg > 0
                          ? ` con ${guidedPreviousPerformance.weightKg} kg`
                          : ' sin peso añadido'}
                      </p>
                    )}
                  </div>
                )}

              {saveError && (
                <p role="alert" className="status-error">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{saveError}</span>
                </p>
              )}

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={completeGuidedSet}
                  className={`btn-primary !min-h-14 !text-base ${
                    guidedFeedback
                      ? '!bg-success !text-on-brand'
                      : '!bg-success-solid hover:!bg-success-solid-hover'
                  }`}
                >
                  <CheckCircle2 className={guidedFeedback ? 'size-6' : 'size-5'} aria-hidden="true" />
                  {currentGuidedStep.set.completed ? 'Continuar' : 'Marcar hecha y continuar'}
                </button>
                <button
                  type="button"
                  onClick={goToPreviousGuidedStep}
                  disabled={currentGuidedIndex === 0}
                  className="btn-secondary w-full !min-h-11 !px-3 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
              </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <Dumbbell className="mx-auto size-8 text-subtle" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-secondary">No hay series para guiar en este día.</p>
            </div>
          )}
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
        {template.exercises.length === 0 && (
          <div className="card border-dashed p-6 text-center xl:col-span-2">
            <Dumbbell className="mx-auto size-8 text-subtle" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-extrabold text-ink">Día sin ejercicios</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-secondary">
              Añade ejercicios a {template.name.toLowerCase()} desde la configuración de rutina.
            </p>
            <Link to="/configuracion" className="btn-secondary mt-4">
              Configurar rutina
            </Link>
          </div>
        )}
        {template.exercises.map((item) => {
          const log = logs.find((entry) => entry.exerciseId === item.exerciseId)
          const equivalentIds = new Set(getEquivalentExerciseIds(exercises, item.exerciseId))
          for (const [from, to] of canonicalExerciseIds) {
            if (to === item.exerciseId) equivalentIds.add(from)
          }
          const exercise = getExerciseById(item.exerciseId)
          const previousPerformance = getLastExercisePerformanceFromSessions(
            sessions,
            item.exerciseId,
            [...equivalentIds]
          )
          if (!log) return null
          return (
            <ExerciseLogger
              key={item.id}
              templateExercise={item}
              log={log}
              previousPerformance={previousPerformance}
              onChange={updateLog}
              exercise={exercise}
              showWeightIncrement={false}
            />
          )
        })}
        </div>
      )}

      {viewMode === 'full' && (draftActive || (hasDraftState && !pendingDraft)) && (
        <section className="rounded-2xl border border-danger/20 bg-danger-soft/30 px-3.5 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-danger-text">Borrador del entrenamiento</p>
              <p className="mt-0.5 text-xs font-semibold text-secondary">
                Descarta los cambios locales y vuelve al entrenamiento inicial.
              </p>
            </div>
            <button
              type="button"
              onClick={discardDraft}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger/30 bg-surface px-3 py-2 text-sm font-extrabold text-danger-text transition hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20 sm:w-auto"
            >
              Descartar borrador
            </button>
          </div>
        </section>
      )}

      {viewMode === 'full' && (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur-xl lg:bottom-4">
          {saveError && (
            <p role="alert" className="status-error mb-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{saveError}</span>
            </p>
          )}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
            <div className="rounded-xl bg-muted px-3 py-2 text-center">
              <p className="text-base font-extrabold text-ink">{progress.completed}/{progress.total}</p>
              <p className="text-[11px] font-bold text-secondary">series</p>
            </div>
            <button
              type="button"
              onClick={() => void finishWorkout()}
              disabled={saving || progress.completed === 0}
              className="btn-primary w-full !min-h-12 !bg-success-solid !text-base !text-on-brand hover:!bg-success-solid-hover"
            >
              <CheckCircle2 className="size-5" aria-hidden="true" />
              {saving ? 'Guardando…' : 'Finalizar y guardar'}
            </button>
          </div>
        </div>
      )}
    </fieldset>
    )
  )
}

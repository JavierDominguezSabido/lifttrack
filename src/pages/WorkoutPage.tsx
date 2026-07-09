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
  getProgressionSuggestion,
  getTodayTemplate
} from '../utils/workout'
import {
  applyWorkingWeight,
  createExerciseLogs,
  createWorkoutSession,
  getWorkingWeight,
  normalizeRepsInput,
  validateWorkoutDraft
} from '../utils/workoutDraft'
import { getLastExercisePerformanceFromSessions } from '../utils/workoutHistory'

type WorkoutViewMode = 'full' | 'guided'
type DraftSyncStatus = 'idle' | 'local' | 'pending' | 'synced'

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
  return { exerciseId: log.exerciseId, setId: set.id }
}

const WORKOUT_DRAFT_VERSION = 1
const WORKOUT_DRAFT_PREFIX = 'lifttrack.workoutDraft'
const WORKOUT_DRAFT_MAX_AUTO_RESTORE_MS = 12 * 60 * 60 * 1000
const WORKOUT_FULL_SCROLL_PREFIX = 'lifttrack.workoutFullScroll'

interface StoredWorkoutDraft {
  version: number
  userKey: string
  templateId: string
  dayOfWeek: number
  startedAt: string
  logs: DraftExerciseLog[]
  updatedAt: string
  viewMode?: WorkoutViewMode
  guidedPosition?: GuidedPosition
}

function getDraftUserKey(userId?: string) {
  return userId ? `user:${userId}` : 'local'
}

function getWorkoutDraftKey(userKey: string, template: WorkoutTemplate) {
  return `${WORKOUT_DRAFT_PREFIX}.${userKey}.day-${template.dayOfWeek}`
}

function getWorkoutRemoteDraftKey(template: WorkoutTemplate) {
  return `day-${template.dayOfWeek}`
}

function createStoredWorkoutDraft(
  userKey: string,
  template: WorkoutTemplate,
  startedAt: string,
  logs: DraftExerciseLog[],
  viewMode: WorkoutViewMode,
  guidedPosition: GuidedPosition | null,
  updatedAt = new Date().toISOString()
): StoredWorkoutDraft {
  const normalizedGuidedPosition = normalizeGuidedPosition(logs, guidedPosition)
  return {
    version: WORKOUT_DRAFT_VERSION,
    userKey,
    templateId: template.id,
    dayOfWeek: template.dayOfWeek,
    startedAt,
    logs,
    updatedAt,
    viewMode,
    guidedPosition: normalizedGuidedPosition ?? undefined
  }
}

function getDraftUpdatedTime(draft: Pick<StoredWorkoutDraft, 'updatedAt'> | null | undefined) {
  if (!draft) return 0
  const updatedAt = new Date(draft.updatedAt).getTime()
  return Number.isFinite(updatedAt) ? updatedAt : 0
}

function readWorkoutDraft(userKey: string, template: WorkoutTemplate): StoredWorkoutDraft | null {
  try {
    const raw = window.localStorage.getItem(getWorkoutDraftKey(userKey, template))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredWorkoutDraft>
    if (
      parsed.version !== WORKOUT_DRAFT_VERSION ||
      parsed.userKey !== userKey ||
      parsed.templateId !== template.id ||
      parsed.dayOfWeek !== template.dayOfWeek ||
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

function readWorkoutDrafts(userKey: string) {
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

function isRecentWorkoutDraft(draft: StoredWorkoutDraft) {
  const updatedAt = new Date(draft.updatedAt).getTime()
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= WORKOUT_DRAFT_MAX_AUTO_RESTORE_MS
}

function writeWorkoutDraft(
  userKey: string,
  template: WorkoutTemplate,
  startedAt: string,
  logs: DraftExerciseLog[],
  viewMode: WorkoutViewMode,
  guidedPosition: GuidedPosition | null,
  updatedAt?: string
) {
  try {
    const draft = createStoredWorkoutDraft(userKey, template, startedAt, logs, viewMode, guidedPosition, updatedAt)
    window.localStorage.setItem(getWorkoutDraftKey(userKey, template), JSON.stringify(draft))
    return draft
  } catch (error) {
    console.error('[workout] No se pudo guardar el borrador local:', error)
    return null
  }
}

function isValidWorkoutDraftPayload(
  draft: StoredWorkoutDraft,
  userKey: string,
  template: WorkoutTemplate
) {
  return (
    draft.version === WORKOUT_DRAFT_VERSION &&
    draft.userKey === userKey &&
    draft.templateId === template.id &&
    draft.dayOfWeek === template.dayOfWeek &&
    typeof draft.startedAt === 'string' &&
    typeof draft.updatedAt === 'string' &&
    Array.isArray(draft.logs)
  )
}

function removeWorkoutDraft(userKey: string, template: WorkoutTemplate) {
  try {
    window.localStorage.removeItem(getWorkoutDraftKey(userKey, template))
  } catch (error) {
    console.error('[workout] No se pudo borrar el borrador local:', error)
  }
}

function removeWorkoutDraftByDay(userKey: string, dayOfWeek: number) {
  try {
    window.localStorage.removeItem(`${WORKOUT_DRAFT_PREFIX}.${userKey}.day-${dayOfWeek}`)
  } catch (error) {
    console.error('[workout] No se pudo borrar el borrador local:', error)
  }
}

function removeRemoteWorkoutDraftByDayIfAvailable(user: { id: string } | null, dayOfWeek: number) {
  if (!user) return
  void deleteRemoteWorkoutDraft(dayOfWeek, `day-${dayOfWeek}`)
    .catch((error) => {
      console.error('[workout] No se pudo borrar el borrador sincronizado:', error)
    })
}

function removeRemoteWorkoutDraftIfAvailable(user: { id: string } | null, template: WorkoutTemplate) {
  removeRemoteWorkoutDraftByDayIfAvailable(user, template.dayOfWeek)
}

function scrollToPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

function logsAreEqual(left: DraftExerciseLog[], right: DraftExerciseLog[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function createFreshWorkoutLogs(
  template: WorkoutTemplate,
  sessions: Parameters<typeof createExerciseLogs>[1],
  exercises: Parameters<typeof createExerciseLogs>[2]
) {
  return createExerciseLogs(template, sessions, exercises)
}

export function WorkoutPage() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { sessions, saveSession, templates, exercises, getExerciseById } = useWorkouts()
  const template = templates.find((item) => item.id === templateId) ?? getTodayTemplate(templates)
  const userKey = getDraftUserKey(user?.id)
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
    const sameDayDraft = readWorkoutDraft(userKey, template)
    const allDrafts = readWorkoutDrafts(userKey)
    const ambiguousDraft = !sameDayDraft && allDrafts.length > 0 ? allDrafts[0] : null
    const canAutoRestore = sameDayDraft && isRecentWorkoutDraft(sameDayDraft)
    initialStateRef.current = {
      logs: canAutoRestore ? sameDayDraft.logs : freshLogs,
      initialLogs: freshLogs,
      startedAt: canAutoRestore ? sameDayDraft.startedAt : new Date().toISOString(),
      pendingDraft: canAutoRestore ? null : sameDayDraft ?? ambiguousDraft,
      draftActive: Boolean(canAutoRestore),
      viewMode: canAutoRestore ? sameDayDraft.viewMode ?? 'full' : 'full',
      guidedPosition: canAutoRestore ? sameDayDraft.guidedPosition ?? null : null
    }
  }
  const [logs, setLogs] = useState<DraftExerciseLog[]>(() => initialStateRef.current!.logs)
  const [initialLogs, setInitialLogs] = useState<DraftExerciseLog[]>(() => initialStateRef.current!.initialLogs)
  const [startedAt, setStartedAt] = useState(() => initialStateRef.current!.startedAt)
  const [pendingDraft, setPendingDraft] = useState<StoredWorkoutDraft | null>(() => initialStateRef.current!.pendingDraft)
  const [draftActive, setDraftActive] = useState(() => initialStateRef.current!.draftActive)
  const [viewMode, setViewMode] = useState<WorkoutViewMode>(() => initialStateRef.current!.viewMode)
  const [guidedPosition, setGuidedPosition] = useState<GuidedPosition | null>(() => initialStateRef.current!.guidedPosition)
  const [openFullExerciseId, setOpenFullExerciseId] = useState<string | null>(
    () => initialStateRef.current!.logs.find((log) => log.sets.some((set) => !set.completed))?.id ??
      initialStateRef.current!.logs[0]?.id ??
      null
  )
  const [guidedFeedback, setGuidedFeedback] = useState<GuidedFeedback | null>(null)
  const [guidedStepAnimationKey, setGuidedStepAnimationKey] = useState(0)
  const [draftSyncStatus, setDraftSyncStatus] = useState<DraftSyncStatus>(
    initialStateRef.current!.draftActive ? (user ? 'pending' : 'local') : 'idle'
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const previousTemplateRef = useRef(template)
  const draftToContinueRef = useRef<StoredWorkoutDraft | null>(null)
  const guidedFeedbackTimeoutRef = useRef<number | null>(null)
  const remoteRestoreRequestRef = useRef(0)
  const remoteSyncTimeoutRef = useRef<number | null>(null)
  const lastSyncedDraftUpdatedAtRef = useRef<string | null>(null)
  const previousViewModeRef = useRef(viewMode)
  const lastLocalDraftRef = useRef<StoredWorkoutDraft | null>(
    initialStateRef.current!.draftActive
      ? createStoredWorkoutDraft(
          userKey,
          template,
          initialStateRef.current!.startedAt,
          initialStateRef.current!.logs,
          initialStateRef.current!.viewMode,
          initialStateRef.current!.guidedPosition,
          readWorkoutDraft(userKey, template)?.updatedAt ?? new Date().toISOString()
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
  const workoutStatus = progress.total > 0 && progress.completed === progress.total
    ? 'Completado'
    : progress.completed > 0
      ? 'En curso'
      : 'Pendiente'
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
  const currentGuidedStep = selectedGuidedStep ?? (!guidedPosition && !guidedIsComplete ? fallbackGuidedStep : null)
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
  const guidedSuggestion = currentGuidedStep && guidedPreviousPerformance
    ? getProgressionSuggestion(guidedPreviousPerformance, currentGuidedStep.templateExercise)
    : null
  const completedVolume = useMemo(() => logs.reduce(
    (total, log) => total + log.sets.reduce(
      (sum, set) => sum + (set.completed ? Number(set.reps || 0) * set.weightKg : 0),
      0
    ),
    0
  ), [logs])
  const hasDraftChanges = !logsAreEqual(logs, initialLogs)
  const hasDraftState = hasDraftChanges || viewMode !== 'full' || Boolean(guidedPosition)
  const draftStatusLabel =
    draftSyncStatus === 'synced'
      ? 'Borrador sincronizado'
      : draftSyncStatus === 'pending'
        ? 'Pendiente de sincronizar'
        : 'Borrador guardado localmente'

  useEffect(() => {
    if (viewMode !== 'full' || logs.length === 0) return
    if (!openFullExerciseId || !logs.some((log) => log.id === openFullExerciseId)) {
      setOpenFullExerciseId(logs.find((log) => log.sets.some((set) => !set.completed))?.id ?? logs[0]?.id ?? null)
    }
  }, [logs, openFullExerciseId, viewMode])

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
  }, [])

  useEffect(() => {
    if (!user) {
      setDraftSyncStatus(readWorkoutDraft(userKey, template) ? 'local' : 'idle')
      lastSyncedDraftUpdatedAtRef.current = null
      return
    }

    const requestId = remoteRestoreRequestRef.current + 1
    remoteRestoreRequestRef.current = requestId
    const localDraftAtStart = readWorkoutDraft(userKey, template)

    void getRemoteWorkoutDraft<StoredWorkoutDraft>(template.dayOfWeek, getWorkoutRemoteDraftKey(template))
      .then((remoteDraft) => {
        if (remoteRestoreRequestRef.current !== requestId) return
        if (!remoteDraft || !isValidWorkoutDraftPayload(remoteDraft.payload, userKey, template)) {
          if (localDraftAtStart && isRecentWorkoutDraft(localDraftAtStart)) {
            setInitialLogs(createExerciseLogs(template, sessions, exercises))
            setLogs(localDraftAtStart.logs)
            setStartedAt(localDraftAtStart.startedAt)
            setPendingDraft(null)
            setDraftActive(true)
            setViewMode(localDraftAtStart.viewMode ?? 'full')
            setGuidedPosition(localDraftAtStart.guidedPosition ?? null)
            lastLocalDraftRef.current = localDraftAtStart
            setDraftSyncStatus('pending')
          } else if (localDraftAtStart) {
            setPendingDraft(localDraftAtStart)
            setDraftSyncStatus('local')
          }
          return
        }

        const remotePayload = {
          ...remoteDraft.payload,
          updatedAt: remoteDraft.updatedAt
        }
        const currentLocalDraft = readWorkoutDraft(userKey, template)
        const localDraft = currentLocalDraft ?? localDraftAtStart
        const remoteIsNewer = getDraftUpdatedTime(remotePayload) > getDraftUpdatedTime(localDraft)

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
          writeWorkoutDraft(
            userKey,
            template,
            remotePayload.startedAt,
            remotePayload.logs,
            remotePayload.viewMode ?? 'full',
            remotePayload.guidedPosition ?? null,
            remotePayload.updatedAt
          )
          setDraftSyncStatus('synced')
        } else if (localDraft && isRecentWorkoutDraft(localDraft)) {
          setInitialLogs(createExerciseLogs(template, sessions, exercises))
          setLogs(localDraft.logs)
          setStartedAt(localDraft.startedAt)
          setPendingDraft(null)
          setDraftActive(true)
          setViewMode(localDraft.viewMode ?? 'full')
          setGuidedPosition(localDraft.guidedPosition ?? null)
          lastLocalDraftRef.current = localDraft
          setDraftSyncStatus('pending')
        } else if (localDraft) {
          setPendingDraft(localDraft)
          setDraftSyncStatus('local')
        } else {
          setDraftSyncStatus('idle')
        }
      })
      .catch((error) => {
        if (remoteRestoreRequestRef.current !== requestId) return
        console.error('[workout] No se pudo recuperar el borrador sincronizado:', error)
        if (localDraftAtStart) setDraftSyncStatus('pending')
      })
  }, [exercises, sessions, template, user, userKey])

  useEffect(() => {
    const previousTemplate = previousTemplateRef.current
    if (previousTemplate.id === template.id && previousTemplate.dayOfWeek === template.dayOfWeek) return

    let previousDraft: StoredWorkoutDraft | null = null
    const shouldStorePreviousDraft = draftActive || hasDraftState
    if (shouldStorePreviousDraft) {
      writeWorkoutDraft(userKey, previousTemplate, startedAt, logs, viewMode, guidedPosition)
      previousDraft = readWorkoutDraft(userKey, previousTemplate)
    }
    clearFullScrollPosition()

    const nextInitialLogs = createExerciseLogs(template, sessions, exercises)
    const nextDraft = readWorkoutDraft(userKey, template)
    const forcedDraft = draftToContinueRef.current?.templateId === template.id
      ? draftToContinueRef.current
      : null
    draftToContinueRef.current = null
    const draftToRestore = forcedDraft ?? (nextDraft && isRecentWorkoutDraft(nextDraft) ? nextDraft : null)
    const draftToAsk = draftToRestore
      ? null
      : nextDraft ?? previousDraft ?? readWorkoutDrafts(userKey).find((draft) => draft.templateId !== template.id) ?? null
    previousTemplateRef.current = template
    setInitialLogs(nextInitialLogs)
    setLogs(draftToRestore?.logs ?? nextInitialLogs)
    setStartedAt(draftToRestore?.startedAt ?? new Date().toISOString())
    setPendingDraft(draftToAsk)
    setDraftActive(Boolean(draftToRestore))
    setViewMode(draftToRestore?.viewMode ?? 'full')
    setGuidedPosition(draftToRestore?.guidedPosition ?? null)
    setSaveError(null)
  }, [clearFullScrollPosition, draftActive, exercises, guidedPosition, hasDraftState, logs, sessions, startedAt, template, userKey, viewMode])

  useEffect(() => {
    if (pendingDraft) return
    if (!draftActive && !hasDraftState) return
    const storedDraft = writeWorkoutDraft(userKey, template, startedAt, logs, viewMode, guidedPosition)
    if (storedDraft) {
      lastLocalDraftRef.current = storedDraft
      if (user) {
        if (lastSyncedDraftUpdatedAtRef.current !== storedDraft.updatedAt) {
          setDraftSyncStatus('pending')
        }
      } else {
        setDraftSyncStatus('local')
      }
    }
    setDraftActive(true)
  }, [draftActive, guidedPosition, hasDraftState, logs, pendingDraft, startedAt, template, user, userKey, viewMode])

  useEffect(() => {
    if (!user || pendingDraft || (!draftActive && !hasDraftState)) return

    const draftToSync = lastLocalDraftRef.current
    if (!draftToSync || lastSyncedDraftUpdatedAtRef.current === draftToSync.updatedAt) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setDraftSyncStatus('pending')
      return
    }

    if (remoteSyncTimeoutRef.current) {
      window.clearTimeout(remoteSyncTimeoutRef.current)
    }

    remoteSyncTimeoutRef.current = window.setTimeout(() => {
      void upsertRemoteWorkoutDraft(
        template.dayOfWeek,
        getWorkoutRemoteDraftKey(template),
        draftToSync
      )
        .then((remoteDraft) => {
          lastSyncedDraftUpdatedAtRef.current = remoteDraft.updatedAt
          setDraftSyncStatus('synced')
        })
        .catch((error) => {
          console.error('[workout] No se pudo sincronizar el borrador:', error)
          setDraftSyncStatus('pending')
        })
    }, 2500)

    return () => {
      if (remoteSyncTimeoutRef.current) {
        window.clearTimeout(remoteSyncTimeoutRef.current)
      }
    }
  }, [draftActive, guidedPosition, hasDraftState, logs, pendingDraft, startedAt, template, user, userKey, viewMode])

  useEffect(() => {
    if (!user || draftSyncStatus !== 'pending') return

    function syncPendingDraft() {
      const draftToSync = lastLocalDraftRef.current ?? readWorkoutDraft(userKey, template)
      if (!draftToSync) return
      void upsertRemoteWorkoutDraft(
        template.dayOfWeek,
        getWorkoutRemoteDraftKey(template),
        draftToSync
      )
        .then((remoteDraft) => {
          lastSyncedDraftUpdatedAtRef.current = remoteDraft.updatedAt
          setDraftSyncStatus('synced')
        })
        .catch((error) => {
          console.error('[workout] No se pudo sincronizar el borrador pendiente:', error)
          setDraftSyncStatus('pending')
        })
    }

    window.addEventListener('online', syncPendingDraft)
    return () => window.removeEventListener('online', syncPendingDraft)
  }, [draftSyncStatus, template, user, userKey])

  function updateLog(updatedLog: DraftExerciseLog) {
    const previousLog = logs.find((log) => log.id === updatedLog.id)
    const wasCompleted = previousLog
      ? previousLog.sets.length > 0 && previousLog.sets.every((set) => set.completed)
      : false
    const isCompleted = updatedLog.sets.length > 0 && updatedLog.sets.every((set) => set.completed)
    setLogs((current) => current.map((log) => log.id === updatedLog.id ? updatedLog : log))
    if (!wasCompleted && isCompleted) {
      const currentIndex = logs.findIndex((log) => log.id === updatedLog.id)
      const nextLog = logs.find((log, index) => index > currentIndex && log.sets.some((set) => !set.completed))
      if (nextLog) setOpenFullExerciseId(nextLog.id)
    }
  }

  function showGuidedFeedback(feedback: GuidedFeedback) {
    setGuidedFeedback(feedback)
    setGuidedStepAnimationKey((current) => current + 1)
    if (guidedFeedbackTimeoutRef.current) {
      window.clearTimeout(guidedFeedbackTimeoutRef.current)
    }
    guidedFeedbackTimeoutRef.current = window.setTimeout(() => {
      setGuidedFeedback(null)
    }, 1600)
  }

  function updateGuidedLog(updatedLog: DraftExerciseLog) {
    updateLog(updatedLog)
  }

  function updateGuidedSet(logId: string, setId: string, changes: Partial<DraftExerciseLog['sets'][number]>) {
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
    saveFullScrollPosition()
    setGuidedPosition(getGuidedPositionFromStep(step))
    setViewMode('guided')
    scrollToPageTop()
  }

  function goToPreviousGuidedStep() {
    if (currentGuidedIndex <= 0) return
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
    saveFullScrollPosition()
    if (selectedGuidedStep) {
      setGuidedPosition(getGuidedPositionFromStep(selectedGuidedStep))
    } else if (firstPendingStep) {
      setGuidedPosition(getGuidedPositionFromStep(firstPendingStep))
    } else {
      setGuidedPosition(null)
    }
    setViewMode('guided')
    scrollToPageTop()
  }

  function enterFullMode() {
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

  function discardDraft() {
    if (!window.confirm('¿Seguro que quieres descartar el entrenamiento en curso?')) {
      return
    }

    if (pendingDraft) {
      removeWorkoutDraftByDay(userKey, pendingDraft.dayOfWeek)
      removeRemoteWorkoutDraftByDayIfAvailable(user, pendingDraft.dayOfWeek)
    } else {
      removeWorkoutDraft(userKey, template)
      removeRemoteWorkoutDraftIfAvailable(user, template)
    }
    lastLocalDraftRef.current = null
    lastSyncedDraftUpdatedAtRef.current = null
    clearFullScrollPosition()
    const nextLogs = createExerciseLogs(template, sessions, exercises)
    setInitialLogs(nextLogs)
    setLogs(nextLogs)
    setStartedAt(new Date().toISOString())
    setPendingDraft(null)
    setDraftActive(false)
    setDraftSyncStatus('idle')
    setViewMode('full')
    setGuidedPosition(null)
    setSaveError(null)
  }

  function startNewWorkout() {
    if (pendingDraft && !window.confirm('Hay un borrador guardado para este entrenamiento. ¿Quieres empezar uno nuevo y descartar ese borrador?')) {
      return
    }

    const nextLogs = createExerciseLogs(template, sessions, exercises)
    if (pendingDraft) {
      removeWorkoutDraftByDay(userKey, pendingDraft.dayOfWeek)
      removeRemoteWorkoutDraftByDayIfAvailable(user, pendingDraft.dayOfWeek)
    }
    lastLocalDraftRef.current = null
    lastSyncedDraftUpdatedAtRef.current = null
    clearFullScrollPosition()
    setInitialLogs(nextLogs)
    setLogs(nextLogs)
    setStartedAt(new Date().toISOString())
    setPendingDraft(null)
    setDraftActive(false)
    setDraftSyncStatus('idle')
    setViewMode('full')
    setGuidedPosition(null)
    setSaveError(null)
  }

  async function finishWorkout() {
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

    setSaving(true)
    try {
      const session = createWorkoutSession({ template, logs, startedAt })
      console.info('[workout] Payload que se intenta guardar:', session)
      await saveSession(session)
      removeWorkoutDraft(userKey, template)
      clearFullScrollPosition()
      if (user) {
        try {
          await deleteRemoteWorkoutDraft(template.dayOfWeek, getWorkoutRemoteDraftKey(template))
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
      navigate('/historial', { state: { workoutSaved: true } })
    } catch (error) {
      console.error('[workout] Error exacto al guardar el entrenamiento:', error)
      setSaveError('No se pudo guardar el entrenamiento. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-5 lg:pb-0">
      {viewMode === 'guided' ? (
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
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-extrabold leading-none text-secondary">
                {draftStatusLabel}
              </span>
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-line/70 bg-hero p-4 text-on-hero shadow-card md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-hero-accent">Entrenar</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{template.name}</h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-hero-muted">
                <span className="flex items-center gap-1.5">
                  <Dumbbell className="size-4 text-hero-accent" aria-hidden="true" />
                  {template.exercises.length} ejercicios
                </span>
                <span>{progress.completed}/{progress.total} series</span>
                <span className="font-extrabold text-hero-accent">{workoutStatus}</span>
                {(draftActive || (hasDraftState && !pendingDraft)) && (
                  <span className="rounded-full bg-on-hero/10 px-2 py-0.5 text-xs font-extrabold text-hero-accent">
                    {draftStatusLabel}
                  </span>
                )}
              </div>
              {(draftActive || (hasDraftState && !pendingDraft)) && (
                <button
                  type="button"
                  onClick={discardDraft}
                  className="mt-3 text-xs font-extrabold text-hero-muted underline decoration-on-hero/30 underline-offset-4 transition hover:text-on-hero"
                >
                  Descartar borrador
                </button>
              )}
            </div>
            <div className="min-w-36 flex-1 sm:max-w-64">
              <div className="mb-2 flex justify-between text-xs font-bold">
                <span>Progreso</span>
                <span className="text-hero-muted">{progress.completed} / {progress.total}</span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-on-hero/15"
                role="progressbar"
                aria-label="Progreso de series realizadas"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.completed}
              >
                <div
                  className="h-full rounded-full bg-hero-accent transition-all duration-300"
                  style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {pendingDraft && (
        <section className="rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-ink">Tienes un entrenamiento en curso.</p>
              <p className="mt-0.5 text-xs font-semibold text-secondary">
                Elige si quieres continuar ese borrador o empezar este entrenamiento desde cero.
              </p>
            </div>
            <div className="grid gap-2 sm:flex sm:shrink-0">
              <button
                type="button"
                onClick={continueDraft}
                className="btn-primary !min-h-10 !px-3 !py-2 !text-sm"
              >
                Continuar borrador
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className="btn-secondary !min-h-10 !px-3 !py-2 !text-sm"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={startNewWorkout}
                className="btn-secondary !min-h-10 !px-3 !py-2 !text-sm"
              >
                Empezar nuevo
              </button>
            </div>
          </div>
        </section>
      )}

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
              {guidedFeedback && (
                <div
                  role="status"
                  className="rounded-xl border border-success/30 bg-success-soft px-3 py-2 text-center transition-all duration-300"
                >
                  <p className="text-sm font-extrabold text-success-text">{guidedFeedback.message}</p>
                  {guidedFeedback.detail && (
                    <p className="mt-0.5 text-xs font-bold text-success-text/80">{guidedFeedback.detail}</p>
                  )}
                </div>
              )}

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
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
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
                    <button
                      type="button"
                      onClick={() => updateGuidedWeight(getWorkingWeight(currentGuidedStep.log) + 1.25)}
                      className="min-h-11 whitespace-nowrap rounded-lg bg-brand-solid px-3 text-sm font-extrabold text-on-brand shadow-sm transition hover:bg-brand-solid-hover active:scale-[0.98]"
                    >
                      +1.25 kg
                    </button>
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

                {(guidedPreviousPerformance || guidedSuggestion) && (
                  <div className="space-y-1 px-1 text-center text-xs font-semibold text-secondary">
                    {guidedPreviousPerformance && (
                      <p>
                        Última vez: <strong className="text-ink">{guidedPreviousPerformance.reps.join('-')}</strong>
                        {guidedPreviousPerformance.weightKg > 0
                          ? ` con ${guidedPreviousPerformance.weightKg} kg`
                          : ' sin peso añadido'}
                      </p>
                    )}
                    {guidedSuggestion && (
                      <p className="font-extrabold text-brand">Sugerencia: {guidedSuggestion}</p>
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
                <div>
                  <button type="button" onClick={goToPreviousGuidedStep} disabled={currentGuidedIndex === 0} className="btn-secondary !min-h-11 !px-2 disabled:cursor-not-allowed disabled:opacity-40">
                    Anterior
                  </button>
                </div>
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
          const completedSets = log?.sets.filter((set) => set.completed).length ?? 0
          const totalSets = log?.sets.length ?? 0
          const isOpen = log?.id === openFullExerciseId
          const isComplete = totalSets > 0 && completedSets === totalSets
          const previousPerformance = getLastExercisePerformanceFromSessions(
            sessions,
            item.exerciseId,
            [...equivalentIds]
          )
          if (!log) return null
          return isOpen ? (
            <ExerciseLogger
              key={item.id}
              templateExercise={item}
              log={log}
              previousPerformance={previousPerformance}
              onChange={updateLog}
              exercise={exercise}
            />
          ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenFullExerciseId(log.id)}
              className="card flex min-h-20 items-center justify-between gap-3 p-3.5 text-left transition hover:border-brand/50"
              aria-expanded={false}
            >
              <span className="min-w-0">
                <span className="block truncate font-extrabold text-ink">{exercise?.name ?? 'Ejercicio'}</span>
                <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-semibold text-secondary">
                  <span>{getWorkingWeight(log)} kg</span>
                  <span aria-hidden="true">·</span>
                  <span>{completedSets}/{totalSets} series</span>
                  <span aria-hidden="true">·</span>
                  <span>{isComplete ? 'Completado' : completedSets > 0 ? 'En curso' : 'Pendiente'}</span>
                </span>
              </span>
              <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-extrabold ${
                isComplete ? 'bg-success-soft text-success-text' : 'bg-muted text-secondary'
              }`}>
                {isComplete ? 'Hecho' : 'Abrir'}
              </span>
            </button>
          )
        })}
        </div>
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
    </div>
  )
}

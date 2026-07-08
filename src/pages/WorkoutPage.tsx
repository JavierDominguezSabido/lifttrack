import { AlertCircle, CheckCircle2, Dumbbell } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExerciseLogger } from '../components/workout/ExerciseLogger'
import { useAuth } from '../context/AuthContext'
import { useWorkouts } from '../context/WorkoutContext'
import type { DraftExerciseLog, WorkoutTemplate } from '../types'
import {
  createCanonicalExerciseIdMap,
  getEquivalentExerciseIds
} from '../utils/exerciseIdentity'
import { getTodayTemplate } from '../utils/workout'
import {
  createExerciseLogs,
  createWorkoutSession,
  validateWorkoutDraft
} from '../utils/workoutDraft'
import { getLastExercisePerformanceFromSessions } from '../utils/workoutHistory'

const WORKOUT_DRAFT_VERSION = 1
const WORKOUT_DRAFT_PREFIX = 'lifttrack.workoutDraft'

interface StoredWorkoutDraft {
  version: number
  userKey: string
  templateId: string
  dayOfWeek: number
  startedAt: string
  logs: DraftExerciseLog[]
  updatedAt: string
}

function getDraftUserKey(userId?: string) {
  return userId ? `user:${userId}` : 'local'
}

function getWorkoutDraftKey(userKey: string, template: WorkoutTemplate) {
  return `${WORKOUT_DRAFT_PREFIX}.${userKey}.day-${template.dayOfWeek}`
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

function writeWorkoutDraft(userKey: string, template: WorkoutTemplate, startedAt: string, logs: DraftExerciseLog[]) {
  try {
    const draft: StoredWorkoutDraft = {
      version: WORKOUT_DRAFT_VERSION,
      userKey,
      templateId: template.id,
      dayOfWeek: template.dayOfWeek,
      startedAt,
      logs,
      updatedAt: new Date().toISOString()
    }
    window.localStorage.setItem(getWorkoutDraftKey(userKey, template), JSON.stringify(draft))
  } catch (error) {
    console.error('[workout] No se pudo guardar el borrador local:', error)
  }
}

function removeWorkoutDraft(userKey: string, template: WorkoutTemplate) {
  try {
    window.localStorage.removeItem(getWorkoutDraftKey(userKey, template))
  } catch (error) {
    console.error('[workout] No se pudo borrar el borrador local:', error)
  }
}

function logsAreEqual(left: DraftExerciseLog[], right: DraftExerciseLog[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function WorkoutPage() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { sessions, saveSession, templates, exercises, getExerciseById } = useWorkouts()
  const template = templates.find((item) => item.id === templateId) ?? getTodayTemplate(templates)
  const userKey = getDraftUserKey(user?.id)
  const [logs, setLogs] = useState<DraftExerciseLog[]>(() => createExerciseLogs(template, sessions, exercises))
  const [initialLogs, setInitialLogs] = useState<DraftExerciseLog[]>(() => createExerciseLogs(template, sessions, exercises))
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString())
  const [pendingDraft, setPendingDraft] = useState<StoredWorkoutDraft | null>(() => readWorkoutDraft(userKey, template))
  const [draftActive, setDraftActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const previousTemplateRef = useRef(template)

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
  const hasDraftChanges = !logsAreEqual(logs, initialLogs)

  useEffect(() => {
    const previousTemplate = previousTemplateRef.current
    if (previousTemplate.id === template.id && previousTemplate.dayOfWeek === template.dayOfWeek) return

    const shouldStorePreviousDraft = draftActive || hasDraftChanges
    if (shouldStorePreviousDraft) {
      const keepDraft = window.confirm(
        'Tienes un entrenamiento en curso. Acepta para conservarlo como borrador y cambiar de dia. Cancela para descartarlo y cambiar de dia.'
      )
      if (keepDraft) {
        writeWorkoutDraft(userKey, previousTemplate, startedAt, logs)
      } else {
        removeWorkoutDraft(userKey, previousTemplate)
      }
    }

    const nextInitialLogs = createExerciseLogs(template, sessions, exercises)
    const nextDraft = readWorkoutDraft(userKey, template)
    previousTemplateRef.current = template
    setInitialLogs(nextInitialLogs)
    setLogs(nextInitialLogs)
    setStartedAt(new Date().toISOString())
    setPendingDraft(nextDraft)
    setDraftActive(false)
    setSaveError(null)
  }, [draftActive, exercises, hasDraftChanges, logs, sessions, startedAt, template, userKey])

  useEffect(() => {
    const storedDraft = readWorkoutDraft(userKey, template)
    setPendingDraft(storedDraft)
    setDraftActive(false)
  }, [template, userKey])

  useEffect(() => {
    if (pendingDraft) return
    if (!draftActive && !hasDraftChanges) return
    writeWorkoutDraft(userKey, template, startedAt, logs)
    setDraftActive(true)
  }, [draftActive, hasDraftChanges, logs, pendingDraft, startedAt, template, userKey])

  function updateLog(updatedLog: DraftExerciseLog) {
    setLogs((current) => current.map((log) => log.id === updatedLog.id ? updatedLog : log))
  }

  function continueDraft() {
    if (!pendingDraft) return
    setLogs(pendingDraft.logs)
    setStartedAt(pendingDraft.startedAt)
    setDraftActive(true)
    setPendingDraft(null)
    setSaveError(null)
  }

  function discardDraft() {
    removeWorkoutDraft(userKey, template)
    const nextLogs = createExerciseLogs(template, sessions, exercises)
    setInitialLogs(nextLogs)
    setLogs(nextLogs)
    setStartedAt(new Date().toISOString())
    setPendingDraft(null)
    setDraftActive(false)
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
      setDraftActive(false)
      setPendingDraft(null)
      navigate('/historial', { state: { workoutSaved: true } })
    } catch (error) {
      console.error('[workout] Error exacto al guardar el entrenamiento:', error)
      setSaveError('No se pudo guardar el entrenamiento. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-24 sm:space-y-5">
      <section className="overflow-hidden rounded-3xl bg-hero p-4 text-on-hero shadow-card md:p-5">
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
              {(draftActive || (hasDraftChanges && !pendingDraft)) && (
                <span className="font-extrabold text-hero-accent">Borrador guardado</span>
              )}
            </div>
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

      {pendingDraft && (
        <section className="rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-ink">Tienes un entrenamiento en curso.</p>
              <p className="mt-0.5 text-xs font-semibold text-secondary">
                Continualo o descartalo para empezar este dia desde cero.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              <button
                type="button"
                onClick={continueDraft}
                className="btn-primary !min-h-10 !px-3 !py-2 !text-sm"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className="btn-secondary !min-h-10 !px-3 !py-2 !text-sm"
              >
                Descartar
              </button>
            </div>
          </div>
        </section>
      )}

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
          const previousPerformance = getLastExercisePerformanceFromSessions(
            sessions,
            item.exerciseId,
            [...equivalentIds]
          )
          return log ? (
            <ExerciseLogger
              key={item.id}
              templateExercise={item}
              log={log}
              previousPerformance={previousPerformance}
              onChange={updateLog}
              exercise={getExerciseById(item.exerciseId)}
            />
          ) : null
        })}
      </div>

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
    </div>
  )
}

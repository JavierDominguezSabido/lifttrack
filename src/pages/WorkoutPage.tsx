import { AlertCircle, CheckCircle2, Clock3, Dumbbell } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExerciseLogger } from '../components/workout/ExerciseLogger'
import { useWorkouts } from '../context/WorkoutContext'
import { templates } from '../data/mockData'
import type { DraftExerciseLog } from '../types'
import { getExercise, getTodayTemplate } from '../utils/workout'
import {
  createExerciseLogs,
  createWorkoutSession,
  validateWorkoutDraft
} from '../utils/workoutDraft'
import { getLastExercisePerformanceFromSessions } from '../utils/workoutHistory'

export function WorkoutPage() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const { sessions, saveSession } = useWorkouts()
  const template = templates.find((item) => item.id === templateId) ?? getTodayTemplate(templates)
  const [logs, setLogs] = useState<DraftExerciseLog[]>(() => createExerciseLogs(template, sessions))
  const [startedAt] = useState(() => new Date().toISOString())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const progress = useMemo(() => {
    const sets = logs.flatMap((log) => log.sets)
    return {
      completed: sets.filter((set) => set.completed).length,
      total: sets.length
    }
  }, [logs])

  function updateLog(updatedLog: DraftExerciseLog) {
    setLogs((current) => current.map((log) => log.id === updatedLog.id ? updatedLog : log))
  }

  async function finishWorkout() {
    setSaveError(null)
    const validationError = validateWorkoutDraft(logs)[0]
    if (validationError) {
      const exerciseName =
        getExercise(validationError.exerciseId)?.name ?? validationError.exerciseId
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
      navigate('/historial', { state: { workoutSaved: true } })
    } catch (error) {
      console.error('[workout] Error exacto al guardar el entrenamiento:', error)
      setSaveError('No se pudo guardar el entrenamiento. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="overflow-hidden rounded-3xl bg-hero p-5 text-on-hero shadow-card md:flex md:items-center md:justify-between md:p-6">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-hero-accent">Sesión en curso</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{template.name}</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-hero-muted">
            <span className="flex items-center gap-1.5"><Dumbbell className="size-4 text-hero-accent" aria-hidden="true" />{template.exercises.length} ejercicios</span>
            <span className="flex items-center gap-1.5"><Clock3 className="size-4 text-hero-accent" aria-hidden="true" />Entrenamiento activo</span>
          </div>
        </div>
        <div className="mt-5 min-w-56 md:mt-0">
          <div className="mb-2 flex justify-between text-xs font-bold">
            <span>Progreso</span>
            <span className="text-hero-muted">{progress.completed} / {progress.total} series</span>
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
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {template.exercises.map((item) => {
          const log = logs.find((entry) => entry.exerciseId === item.exerciseId)
          const previousPerformance = getLastExercisePerformanceFromSessions(sessions, item.exerciseId)
          return log ? (
            <ExerciseLogger
              key={item.id}
              templateExercise={item}
              log={log}
              previousPerformance={previousPerformance}
              onChange={updateLog}
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
        <button
          type="button"
          onClick={() => void finishWorkout()}
          disabled={saving || progress.completed === 0}
          className="btn-primary w-full !min-h-12 !bg-success-solid !text-base !text-on-brand hover:!bg-success-solid-hover"
        >
          <CheckCircle2 className="size-5" aria-hidden="true" />
          {saving ? 'Guardando…' : 'Finalizar y guardar entrenamiento'}
        </button>
      </div>
    </div>
  )
}

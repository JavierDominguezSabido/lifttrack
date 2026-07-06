import { AlertCircle, ArrowLeft, Save } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ExerciseLogger } from '../components/workout/ExerciseLogger'
import { useWorkouts } from '../context/WorkoutContext'
import type { DraftExerciseLog } from '../types'
import { formatDate, isInitialSession } from '../utils/workout'
import {
  createDraftFromSession,
  updateWorkoutSession,
  validateWorkoutDraft
} from '../utils/workoutDraft'

export function EditSessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { sessions, saveSession, templates, getExerciseById } = useWorkouts()
  const session = sessions.find((item) => item.id === sessionId)
  const template =
    templates.find((item) => item.id === session?.templateId) ??
    templates.find((item) =>
      session?.exerciseLogs.some((log) =>
        item.exercises.some((exercise) => exercise.exerciseId === log.exerciseId)
      )
    )
  const [logs, setLogs] = useState<DraftExerciseLog[]>(
    () => session ? createDraftFromSession(session) : []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session || !template || isInitialSession(session.id)) {
    return <Navigate to="/historial" replace />
  }

  function updateLog(updatedLog: DraftExerciseLog) {
    setLogs((current) =>
      current.map((log) => log.id === updatedLog.id ? updatedLog : log)
    )
  }

  async function saveChanges() {
    setError(null)
    const validationError = validateWorkoutDraft(logs)[0]
    if (validationError) {
      const exerciseName =
        getExerciseById(validationError.exerciseId)?.name ?? validationError.exerciseId
      setError(`${exerciseName}, serie ${validationError.setNumber}: ${validationError.message}`)
      return
    }

    setSaving(true)
    try {
      const updatedSession = updateWorkoutSession(session!, logs)
      console.info('[workout] Sesión local actualizada:', updatedSession)
      await saveSession(updatedSession)
      navigate('/historial', { state: { sessionUpdated: true } })
    } catch (saveError) {
      console.error('[workout] Error al actualizar la sesión:', saveError)
      setError('No se pudieron guardar los cambios. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="card p-5 md:p-6">
        <Link
          to="/historial"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-secondary hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al historial
        </Link>
        <p className="eyebrow mt-3">Editar entrenamiento</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">{session.name}</h2>
        <p className="mt-1 text-sm font-medium text-secondary">
          {formatDate(session.startedAt, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {logs.map((log) => {
          const templateExercise = template.exercises.find(
            (item) => item.exerciseId === log.exerciseId
          ) ?? {
            id: `historical-${log.id}`,
            templateId: template.id,
            exerciseId: log.exerciseId,
            order: log.order,
            targetSets: Math.max(1, log.sets.length),
            targetReps: String(log.sets[0]?.reps ?? 8)
          }
          return templateExercise ? (
            <ExerciseLogger
              key={log.id}
              templateExercise={templateExercise}
              log={log}
              previousPerformance={null}
              onChange={updateLog}
              exercise={getExerciseById(log.exerciseId)}
            />
          ) : null
        })}
      </div>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur-xl lg:bottom-4">
        {error && (
          <p role="alert" className="status-error mb-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => void saveChanges()}
          disabled={saving || logs.length === 0}
          className="btn-primary w-full !min-h-12 !bg-success-solid !text-base !text-on-brand hover:!bg-success-solid-hover"
        >
          <Save className="size-5" aria-hidden="true" />
          {saving ? 'Guardando cambios…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

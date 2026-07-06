import {
  AlertCircle,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Edit3,
  Trash2,
  Trophy
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useWorkouts } from '../context/WorkoutContext'
import { exercises } from '../data/mockData'
import type { SetLog } from '../types'
import {
  dayNames,
  formatCompactNumber,
  formatDate,
  getExercise,
  getSessionVolume,
  isInitialSession
} from '../utils/workout'

export function HistoryPage() {
  const { exerciseId } = useParams()
  const location = useLocation()
  const { sessions, deleteSession, clearLocalSessions } = useWorkouts()
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const exercise = exercises.find((item) => item.id === exerciseId) ?? exercises[0]
  const localSessions = sessions
    .filter((session) => !isInitialSession(session.id))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const entries = localSessions.flatMap((session) => {
    const log = session.exerciseLogs.find((item) => item.exerciseId === exercise.id)
    if (!log) return []
    return [{
      session,
      log,
      bestSet: log.sets
        .filter((set) => set.completed)
        .reduce<SetLog | undefined>(
          (best, set) => !best || set.weightKg > best.weightKg ? set : best,
          undefined
        )
    }]
  })
  const chartEntries = [...entries].reverse().slice(-8)
  const maxWeight = Math.max(1, ...chartEntries.map((entry) => entry.bestSet?.weightKg ?? 0))
  const bestWeight = Math.max(0, ...entries.map((entry) => entry.bestSet?.weightKg ?? 0))
  const accumulatedVolume = entries.reduce(
    (sum, entry) => sum + getSessionVolume({
      ...entry.session,
      exerciseLogs: [entry.log]
    }),
    0
  )

  async function removeSession(sessionId: string) {
    if (!window.confirm('¿Quieres borrar este entrenamiento? Esta acción no se puede deshacer.')) {
      return
    }

    setActionError(null)
    setActionMessage(null)
    try {
      await deleteSession(sessionId)
      setActionMessage('Entrenamiento borrado correctamente.')
    } catch (error) {
      console.error('[workout] Error al borrar la sesión:', error)
      setActionError('No se pudo borrar el entrenamiento. Inténtalo de nuevo.')
    }
  }

  async function clearTestData() {
    if (!window.confirm('¿Borrar todos los entrenamientos guardados localmente? La rutina base se conservará.')) {
      return
    }

    setActionError(null)
    setActionMessage(null)
    try {
      await clearLocalSessions()
      setActionMessage('Datos locales borrados. La rutina base se ha conservado.')
    } catch (error) {
      console.error('[workout] Error al limpiar los datos locales:', error)
      setActionError('No se pudieron borrar los datos locales. Inténtalo de nuevo.')
    }
  }

  const successMessage = location.state?.workoutSaved
    ? 'Entrenamiento guardado correctamente.'
    : location.state?.sessionUpdated
      ? 'Entrenamiento actualizado correctamente.'
      : actionMessage

  return (
    <div className="space-y-5 md:space-y-6">
      {successMessage && (
        <p role="status" className="status-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </p>
      )}
      {actionError && (
        <p role="alert" className="status-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </p>
      )}

      <section aria-labelledby="saved-workouts-title">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Historial local</p>
            <h2 id="saved-workouts-title" className="mt-1 text-xl font-extrabold tracking-tight text-ink">
              Entrenamientos guardados
            </h2>
          </div>
          {localSessions.length > 0 && (
            <button
              type="button"
              onClick={() => void clearTestData()}
              className="min-h-11 text-right text-xs font-bold text-secondary underline decoration-line underline-offset-4 hover:text-danger"
            >
              Borrar datos locales de prueba
            </button>
          )}
        </div>

        {localSessions.length > 0 ? (
          <div className="space-y-4">
            {localSessions.map((session) => (
              <article key={session.id} className="card overflow-hidden">
                <header className="border-b border-line bg-muted/40 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {dayNames[session.dayOfWeek] ?? session.name}
                      </p>
                      <h3 className="mt-1 text-lg font-extrabold text-ink">
                        {formatDate(session.startedAt, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-secondary">
                        {session.exerciseLogs.length} ejercicios · {session.durationMinutes ?? 0} min
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-secondary">Volumen</p>
                      <p className="mt-1 text-lg font-extrabold text-ink">
                        {formatCompactNumber(session.volumeKg ?? getSessionVolume(session))} kg
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link
                      to={`/historial/sesion/${session.id}/editar`}
                      className="btn-secondary !min-h-11 !py-2.5"
                    >
                      <Edit3 className="size-4" aria-hidden="true" />
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => void removeSession(session.id)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-danger/40 bg-raised px-3 py-2.5 text-sm font-bold text-danger-text transition hover:bg-danger-soft active:scale-[0.98]"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Borrar
                    </button>
                  </div>
                </header>

                <div className="divide-y divide-line px-4 sm:px-5">
                  {session.exerciseLogs.map((log) => {
                    const loggedExercise = getExercise(log.exerciseId)
                    const completedSets = log.sets.filter((set) => set.completed)
                    const weight = log.workingWeightKg ?? completedSets[0]?.weightKg ?? 0
                    return (
                      <div key={log.id} className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-extrabold leading-tight text-ink">
                              {loggedExercise?.name ?? log.exerciseId}
                            </p>
                            <p className="mt-1 text-xs font-medium text-secondary">
                              {completedSets.length} de {log.sets.length} series hechas
                            </p>
                          </div>
                          <span className="shrink-0 rounded-xl bg-brand-soft px-3 py-1.5 text-sm font-extrabold text-brand">
                            {weight} kg
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {log.sets.map((set) => (
                            <span
                              key={set.id}
                              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                                set.completed
                                  ? 'bg-success-soft text-success-text'
                                  : 'bg-muted text-secondary'
                              }`}
                            >
                              S{set.setNumber}: {set.reps} reps · {set.completed ? 'hecha' : 'pendiente'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="card border-dashed px-5 py-12 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-subtle">
              <Dumbbell className="size-7" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-extrabold text-ink">Aún no hay entrenamientos guardados</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-secondary">
              Cuando termines una sesión aparecerá aquí con sus ejercicios, pesos y repeticiones.
            </p>
            <Link to="/entrenamiento" className="btn-primary mt-5">
              Empezar entrenamiento
            </Link>
          </div>
        )}
      </section>

      <section aria-labelledby="exercise-progress-title" className="space-y-4">
        <div>
          <p className="eyebrow">Progreso por ejercicio</p>
          <h2 id="exercise-progress-title" className="mt-1 text-xl font-extrabold tracking-tight text-ink">
            Evolución local
          </h2>
        </div>
        <div aria-label="Seleccionar ejercicio" className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          {exercises.map((item) => (
            <Link
              key={item.id}
              to={`/historial/${item.id}`}
              className={`flex min-h-11 shrink-0 snap-start items-center rounded-xl border px-3 py-2 text-sm font-bold transition ${
                item.id === exercise.id
                  ? 'border-brand-solid bg-brand-solid text-on-brand'
                  : 'border-line bg-surface text-secondary hover:border-brand hover:text-ink'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <HistoryStat icon={Trophy} label="Mejor peso" value={`${bestWeight} kg`} />
          <HistoryStat icon={Dumbbell} label="Sesiones" value={String(entries.length)} />
          <HistoryStat
            icon={BarChart3}
            label="Volumen acumulado"
            value={`${formatCompactNumber(accumulatedVolume)} kg`}
            wide
          />
        </div>

        <div className="card p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{exercise.muscleGroup}</p>
              <h3 className="mt-1 text-2xl font-extrabold text-ink">{exercise.name}</h3>
            </div>
            {entries.length >= 2 && (
              <span className="flex items-center gap-1 rounded-lg bg-success-soft px-2.5 py-1.5 text-xs font-bold text-success-text">
                <ArrowUp className="size-3.5" aria-hidden="true" />
                Historial disponible
              </span>
            )}
          </div>

          {chartEntries.length > 0 ? (
            <div className="mt-8">
              <div className="flex h-52 items-end gap-3 border-b border-line px-2 md:gap-6">
                {chartEntries.map((entry) => {
                  const weight = entry.bestSet?.weightKg ?? 0
                  return (
                    <div key={entry.session.id} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[11px] font-bold text-secondary">{weight} kg</span>
                      <div
                        className="w-full max-w-16 rounded-t-lg bg-brand"
                        style={{ height: `${Math.max(8, (weight / maxWeight) * 80)}%` }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex gap-3 px-2 md:gap-6">
                {chartEntries.map((entry) => (
                  <span key={entry.session.id} className="flex-1 text-center text-[10px] font-semibold text-secondary">
                    {formatDate(entry.session.startedAt, { day: '2-digit', month: '2-digit' })}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-muted px-4 py-8 text-center">
              <BarChart3 className="mx-auto size-7 text-subtle" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-secondary">
                Guarda una sesión con este ejercicio para ver su evolución.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function HistoryStat({
  icon: Icon,
  label,
  value,
  wide = false
}: {
  icon: typeof Trophy
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <div className={`card flex min-h-24 items-center gap-3 p-3.5 sm:p-4 ${wide ? 'col-span-2 md:col-span-1' : ''}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand sm:size-11">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-tight text-secondary">{label}</p>
        <p className="mt-1 truncate text-base font-extrabold text-ink sm:text-lg">{value}</p>
      </div>
    </div>
  )
}

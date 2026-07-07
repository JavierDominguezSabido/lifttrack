import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Edit3,
  Filter,
  Search,
  Trash2,
  Trophy
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useWorkouts } from '../context/WorkoutContext'
import type { Exercise, ExerciseLog, SetLog, WorkoutSession } from '../types'
import {
  createCanonicalExerciseIdMap,
  getEquivalentExerciseIds
} from '../utils/exerciseIdentity'
import {
  dayNames,
  formatCompactNumber,
  formatDate,
  getNextWeekStart,
  getSessionVolume,
  getWeekStart,
  isInitialSession
} from '../utils/workout'

const INITIAL_VISIBLE_SESSIONS = 10

type RangeFilter = 'week' | 'month' | 'all'

interface ProgressEntry {
  session: WorkoutSession
  log: ExerciseLog
  bestSet?: SetLog
}

interface ExerciseProgressSummary {
  exercise: Exercise
  entries: ProgressEntry[]
  bestWeight: number
  sessionCount: number
  accumulatedVolume: number
  latestEntry?: ProgressEntry
  latestReps: string
  latestWeight: number
}

function formatSetReps(sets: SetLog[]) {
  return sets
    .filter((set) => set.completed)
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((set) => set.reps)
    .join('-')
}

function getProgressEntryWeight(entry: ProgressEntry) {
  const completed = entry.log.sets
    .filter((set) => set.completed)
    .sort((a, b) => a.setNumber - b.setNumber)
  return entry.log.workingWeightKg ?? completed[0]?.weightKg ?? entry.bestSet?.weightKg ?? 0
}

export function HistoryPage() {
  const { exerciseId } = useParams()
  const location = useLocation()
  const {
    sessions,
    deleteSession,
    clearLocalSessions,
    exercises,
    templates,
    getExerciseById,
    dataMode
  } = useWorkouts()
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedProgressId, setSelectedProgressId] = useState<string | undefined>(exerciseId)
  const [filterExerciseId, setFilterExerciseId] = useState('all')
  const [filterDay, setFilterDay] = useState('all')
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all')
  const [search, setSearch] = useState('')
  const [progressSearch, setProgressSearch] = useState('')
  const [visibleProgressCount, setVisibleProgressCount] = useState(8)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_SESSIONS)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)

  const realSessions = useMemo(
    () => [...sessions]
      .filter((session) => !isInitialSession(session.id))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions]
  )
  const canonicalExerciseIds = useMemo(
    () => createCanonicalExerciseIdMap(exercises, templates, realSessions),
    [exercises, realSessions, templates]
  )
  const exerciseOptions = useMemo(
    () => getExerciseOptions(exercises, realSessions, canonicalExerciseIds),
    [canonicalExerciseIds, exercises, realSessions]
  )
  const exerciseProgressSummaries = useMemo(
    () => getExerciseProgressSummaries(exerciseOptions, realSessions, exercises, canonicalExerciseIds),
    [canonicalExerciseIds, exerciseOptions, exercises, realSessions]
  )
  const filteredExerciseProgressSummaries = useMemo(() => {
    const normalized = progressSearch.trim().toLowerCase()
    if (!normalized) return exerciseProgressSummaries
    return exerciseProgressSummaries.filter((item) =>
      item.exercise.name.toLowerCase().includes(normalized)
    )
  }, [exerciseProgressSummaries, progressSearch])
  const selectedExerciseId = selectedProgressId
    ? canonicalExerciseIds.get(selectedProgressId) ?? selectedProgressId
    : undefined
  const selectedExercise =
    exerciseProgressSummaries.find((item) => item.exercise.id === selectedExerciseId)?.exercise ??
    exerciseProgressSummaries[0]?.exercise
  const selectedEquivalentIds = useMemo(
    () => selectedExercise
      ? getEquivalentIdsForExercise(selectedExercise.id, exercises, canonicalExerciseIds)
      : new Set<string>(),
    [canonicalExerciseIds, exercises, selectedExercise]
  )
  const progressEntries = useMemo(
    () => selectedExercise
      ? getProgressEntries(realSessions, selectedEquivalentIds, canonicalExerciseIds)
      : [],
    [canonicalExerciseIds, realSessions, selectedEquivalentIds, selectedExercise]
  )
  const chartEntries = [...progressEntries].reverse().slice(-8)
  const selectedSummary = selectedExercise
    ? exerciseProgressSummaries.find((item) => item.exercise.id === selectedExercise.id)
    : undefined
  const bestWeight = selectedSummary?.bestWeight ?? 0
  const accumulatedVolume = selectedSummary?.accumulatedVolume ?? 0
  const latestProgressSession = progressEntries[0]?.session
  const recentProgressEntries = progressEntries.slice(0, visibleProgressCount)
  const filteredSessions = useMemo(
    () => filterSessions({
      sessions: realSessions,
      exercises,
      canonicalExerciseIds,
      filterExerciseId,
      filterDay,
      rangeFilter,
      search
    }),
    [canonicalExerciseIds, exercises, filterDay, filterExerciseId, rangeFilter, realSessions, search]
  )
  const visibleSessions = filteredSessions.slice(0, visibleCount)

  async function removeSession(session: WorkoutSession) {
    const label = `${dayNames[session.dayOfWeek] ?? session.name}, ${formatDate(session.startedAt, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })}`

    if (!window.confirm(`Vas a borrar esta sesión: ${label}. Esta acción no se puede deshacer. ¿Continuar?`)) {
      return
    }

    setActionError(null)
    setActionMessage(null)
    try {
      await deleteSession(session.id)
      setExpandedSessionId(null)
      setActionMessage('Entrenamiento borrado correctamente.')
    } catch (error) {
      console.error('[workout] Error al borrar la sesión:', error)
      setActionError('No se pudo borrar el entrenamiento. Inténtalo de nuevo.')
    }
  }

  async function clearTestData() {
    if (!window.confirm('Vas a borrar todos los entrenamientos guardados en este dispositivo. La rutina base se conservará. Esta acción no se puede deshacer. ¿Continuar?')) {
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Historial</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
            Entrenamientos y progreso
          </h1>
          <p className="mt-1 text-sm leading-6 text-secondary">
            Revisa tu evolución y gestiona sesiones sin cargar toda la pantalla de detalles.
          </p>
        </div>
        {realSessions.length > 0 && dataMode === 'local' && (
          <button
            type="button"
            onClick={() => void clearTestData()}
            className="min-h-11 rounded-xl px-2 text-right text-xs font-bold text-secondary underline decoration-line underline-offset-4 hover:text-danger"
          >
            Borrar datos de este dispositivo
          </button>
        )}
      </header>

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

      <section aria-labelledby="exercise-progress-title" className="card overflow-hidden">
        <div className="border-b border-line bg-muted/40 p-5 md:p-6">
          <p className="eyebrow">Progreso por ejercicio</p>
          <h2 id="exercise-progress-title" className="mt-1 text-xl font-extrabold tracking-tight text-ink">
            Evolución
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary">
            Busca un ejercicio y revisa cómo evoluciona su peso de trabajo sesión a sesión.
          </p>
        </div>

        {selectedExercise && selectedSummary ? (
          <div className="grid gap-5 p-5 md:p-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <aside className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-secondary">
                  Ejercicio
                </span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                  <input
                    className="input min-h-12 !text-left !font-semibold pl-9"
                    value={progressSearch}
                    placeholder="Buscar ejercicio..."
                    onChange={(event) => setProgressSearch(event.target.value)}
                  />
                </span>
              </label>

              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {filteredExerciseProgressSummaries.map((summary) => {
                  const selected = summary.exercise.id === selectedExercise.id
                  return (
                    <button
                      key={summary.exercise.id}
                      type="button"
                      onClick={() => {
                        setSelectedProgressId(summary.exercise.id)
                        setVisibleProgressCount(8)
                      }}
                      className={`w-full rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                        selected
                          ? 'border-brand bg-brand-soft text-ink ring-2 ring-brand-soft'
                          : 'border-line bg-surface hover:border-brand/50 hover:bg-muted/60'
                      }`}
                      aria-pressed={selected}
                    >
                      <span className="block font-extrabold leading-tight text-ink">{summary.exercise.name}</span>
                      <span className="mt-1 block text-xs font-semibold text-secondary">
                        {summary.bestWeight} kg · {summary.sessionCount} sesiones · última: {summary.latestReps || 'sin reps'}
                      </span>
                    </button>
                  )
                })}
                {filteredExerciseProgressSummaries.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm font-semibold text-secondary">
                    No hay ejercicios que coincidan con la búsqueda.
                  </p>
                )}
              </div>
            </aside>

            <div className="min-w-0 space-y-5">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">{selectedExercise.muscleGroup ?? 'Ejercicio'}</p>
                    <h3 className="mt-1 text-2xl font-extrabold text-ink">{selectedExercise.name}</h3>
                    <p className="mt-1 text-sm font-medium text-secondary">
                      Última sesión: {latestProgressSession
                        ? formatDate(latestProgressSession.startedAt, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })
                        : 'sin sesiones registradas'}
                    </p>
                    <p className="mt-1 text-sm font-bold text-ink">
                      {selectedSummary.latestWeight} kg · {selectedSummary.latestReps || 'sin reps'}
                    </p>
                  </div>
                  <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-bold text-secondary">
                    Peso de trabajo por fecha
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  <HistoryStat icon={Trophy} label="Mejor peso" value={`${bestWeight} kg`} compact />
                  <HistoryStat icon={Dumbbell} label="Sesiones" value={String(selectedSummary.sessionCount)} compact />
                  <HistoryStat
                    icon={BarChart3}
                    label="Volumen acumulado"
                    value={`${formatCompactNumber(accumulatedVolume)} kg`}
                    compact
                    wide
                  />
                </div>
              </div>

              {chartEntries.length > 0 ? (
                <ProgressLineChart entries={chartEntries} />
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-muted px-4 py-8 text-center">
                  <BarChart3 className="mx-auto size-7 text-subtle" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold text-secondary">
                    Guarda una sesión con este ejercicio para ver su evolución.
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-line bg-surface">
                <div className="border-b border-line px-4 py-3">
                  <h4 className="font-extrabold text-ink">Registros recientes</h4>
                </div>
                <div className="divide-y divide-line px-4">
                  {recentProgressEntries.map((entry) => (
                    <div key={entry.session.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 text-sm sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-center">
                      <span className="font-bold text-ink">
                        {formatDate(entry.session.startedAt, { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                      <span className="font-extrabold text-brand">{getProgressEntryWeight(entry)} kg</span>
                      <span className="font-semibold text-secondary">{formatSetReps(entry.log.sets)}</span>
                      <span className="col-span-2 text-xs font-semibold text-secondary sm:col-span-1 sm:text-right">
                        {formatCompactNumber(getSessionVolume({ ...entry.session, exerciseLogs: [entry.log] }))} kg
                      </span>
                    </div>
                  ))}
                </div>
                {visibleProgressCount < progressEntries.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleProgressCount((current) => current + 8)}
                    className="btn-secondary m-4 w-[calc(100%-2rem)]"
                  >
                    Ver más registros
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <EmptyHistoryState
            title="No hay ejercicios con progreso"
            message="Guarda una sesión para ver aquí la evolución por ejercicio."
            showAction={realSessions.length === 0}
          />
        )}
      </section>

      <section aria-labelledby="history-filters-title" className="card p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Filter className="size-5 text-brand" aria-hidden="true" />
          <h2 id="history-filters-title" className="font-extrabold text-ink">Filtros</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label>
            <span className="mb-1 block text-xs font-bold text-secondary">Ejercicio</span>
            <select
              className="input min-h-12"
              value={filterExerciseId}
              onChange={(event) => {
                setFilterExerciseId(event.target.value)
                setVisibleCount(INITIAL_VISIBLE_SESSIONS)
              }}
            >
              <option value="all">Todos</option>
              {exerciseOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-secondary">Día</span>
            <select
              className="input min-h-12"
              value={filterDay}
              onChange={(event) => {
                setFilterDay(event.target.value)
                setVisibleCount(INITIAL_VISIBLE_SESSIONS)
              }}
            >
              <option value="all">Todos</option>
              {dayNames.map((day, index) => (
                <option key={day} value={index}>{day}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-secondary">Periodo</span>
            <select
              className="input min-h-12"
              value={rangeFilter}
              onChange={(event) => {
                setRangeFilter(event.target.value as RangeFilter)
                setVisibleCount(INITIAL_VISIBLE_SESSIONS)
              }}
            >
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
              <option value="all">Todo</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-secondary">Buscar</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input
                className="input min-h-12 pl-9"
                value={search}
                placeholder="Nombre de ejercicio"
                onChange={(event) => {
                  setSearch(event.target.value)
                  setVisibleCount(INITIAL_VISIBLE_SESSIONS)
                }}
              />
            </span>
          </label>
        </div>
      </section>

      <section aria-labelledby="saved-workouts-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Sesiones</p>
            <h2 id="saved-workouts-title" className="mt-1 text-xl font-extrabold tracking-tight text-ink">
              Entrenamientos guardados
            </h2>
          </div>
          <p className="text-sm font-semibold text-secondary">
            {filteredSessions.length} de {realSessions.length} sesiones
          </p>
        </div>

        {visibleSessions.length > 0 ? (
          <div className="space-y-3">
            {visibleSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                expanded={expandedSessionId === session.id}
                onToggle={() => setExpandedSessionId((current) =>
                  current === session.id ? null : session.id
                )}
                onDelete={() => void removeSession(session)}
                getExerciseById={getExerciseById}
              />
            ))}
            {visibleCount < filteredSessions.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((current) => current + INITIAL_VISIBLE_SESSIONS)}
                className="btn-secondary w-full"
              >
                Ver más sesiones
              </button>
            )}
          </div>
        ) : (
          <EmptyHistoryState />
        )}
      </section>
    </div>
  )
}

function SessionCard({
  session,
  expanded,
  onToggle,
  onDelete,
  getExerciseById
}: {
  session: WorkoutSession
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  getExerciseById: (exerciseId: string) => Exercise | undefined
}) {
  const completedSets = session.exerciseLogs.reduce(
    (sum, log) => sum + log.sets.filter((set) => set.completed).length,
    0
  )
  const totalSets = session.exerciseLogs.reduce((sum, log) => sum + log.sets.length, 0)
  const volume = session.volumeKg ?? getSessionVolume(session)
  const status = completedSets >= totalSets ? 'Completada' : 'Parcial'

  return (
    <article className="card overflow-hidden">
      <header className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {dayNames[session.dayOfWeek] ?? session.name}
            </p>
            <h3 className="mt-1 text-lg font-extrabold text-ink">
              {formatDate(session.startedAt, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </h3>
            <p className="mt-1 text-sm font-medium text-secondary">
              {session.exerciseLogs.length} ejercicios · {completedSets} series · {formatCompactNumber(volume)} kg
            </p>
          </div>
          <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
            status === 'Completada'
              ? 'bg-success-soft text-success-text'
              : 'bg-warning-soft text-warning-text'
          }`}>
            {status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="btn-secondary !min-h-11 !px-2 !py-2.5 text-xs sm:text-sm"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {expanded ? 'Ocultar' : 'Ver detalle'}
          </button>
          <Link
            to={`/historial/sesion/${session.id}/editar`}
            className="btn-secondary !min-h-11 !px-2 !py-2.5 text-xs sm:text-sm"
          >
            <Edit3 className="size-4" aria-hidden="true" />
            Editar
          </Link>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-raised px-2 py-2.5 text-xs font-bold text-secondary transition hover:border-danger/40 hover:bg-danger-soft hover:text-danger-text active:scale-[0.98] sm:text-sm"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Borrar
          </button>
        </div>
      </header>

      {expanded && (
        <div className="border-t border-line bg-muted/30 px-4 sm:px-5">
          <div className="divide-y divide-line">
            {session.exerciseLogs.map((log) => {
              const loggedExercise = getExerciseById(log.exerciseId)
              const completed = log.sets.filter((set) => set.completed)
              const weight = log.workingWeightKg ?? completed[0]?.weightKg ?? 0
              return (
                <div key={log.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold leading-tight text-ink">
                        {loggedExercise?.name ?? log.exerciseId}
                      </p>
                      <p className="mt-1 text-xs font-medium text-secondary">
                        {completed.length} de {log.sets.length} series hechas
                      </p>
                      {completed.length > 0 && (
                        <p className="mt-1 text-sm font-extrabold text-ink">
                          {formatSetReps(log.sets)}
                        </p>
                      )}
                      {log.notes && (
                        <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-xs font-medium text-secondary">
                          {log.notes}
                        </p>
                      )}
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
                            : 'bg-surface text-secondary'
                        }`}
                      >
                        S{set.setNumber}: {set.reps} reps · {set.weightKg} kg · {set.completed ? 'hecha' : 'pendiente'}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {session.notes && (
            <p className="mb-4 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-secondary">
              {session.notes}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

function ProgressLineChart({ entries }: { entries: ProgressEntry[] }) {
  const weights = entries.map(getProgressEntryWeight)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const range = Math.max(1, maxWeight - minWeight)
  const points = entries.map((entry, index) => {
    const x = entries.length === 1 ? 50 : (index / (entries.length - 1)) * 100
    const y = 56 - ((getProgressEntryWeight(entry) - minWeight) / range) * 42 - 7
    return { x, y, entry }
  })
  const path = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  ).join(' ')

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="font-extrabold text-ink">Peso de trabajo</h4>
          <p className="text-xs font-semibold text-secondary">Últimas {entries.length} sesiones registradas</p>
        </div>
        <p className="text-xs font-bold text-secondary">{minWeight} - {maxWeight} kg</p>
      </div>

      <svg viewBox="0 0 100 62" role="img" aria-label="Evolución del peso de trabajo por fecha" className="h-40 w-full overflow-visible">
        <line x1="0" y1="55" x2="100" y2="55" className="stroke-line" strokeWidth="1" />
        <line x1="0" y1="10" x2="100" y2="10" className="stroke-line" strokeWidth="1" strokeDasharray="3 3" />
        <path d={path} className="fill-none stroke-brand" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(({ x, y, entry }) => (
          <g key={entry.session.id}>
            <circle cx={x} cy={y} r="3.2" className="fill-surface stroke-brand" strokeWidth="2.2" />
            <text x={x} y={Math.max(7, y - 6)} textAnchor="middle" className="fill-secondary text-[5px] font-bold">
              {getProgressEntryWeight(entry)} kg
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(entries.length, 8)}, minmax(0, 1fr))` }}>
        {entries.map((entry) => (
          <span key={entry.session.id} className="truncate text-center text-[10px] font-semibold text-secondary">
            {formatDate(entry.session.startedAt, { day: '2-digit', month: '2-digit' })}
          </span>
        ))}
      </div>
    </div>
  )
}

function HistoryStat({
  icon: Icon,
  label,
  value,
  wide = false,
  compact = false
}: {
  icon: typeof Trophy
  label: string
  value: string
  wide?: boolean
  compact?: boolean
}) {
  return (
    <div className={`card flex ${compact ? 'min-h-20' : 'min-h-24'} items-center gap-3 p-3.5 sm:p-4 ${wide ? 'col-span-2 md:col-span-1' : ''}`}>
      <span className={`${compact ? 'size-9' : 'size-10 sm:size-11'} grid shrink-0 place-items-center rounded-xl bg-brand-soft text-brand`}>
        <Icon className={compact ? 'size-4' : 'size-5'} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-tight text-secondary">{label}</p>
        <p className="mt-1 truncate text-base font-extrabold text-ink sm:text-lg">{value}</p>
      </div>
    </div>
  )
}

function EmptyHistoryState({
  title = 'No hay sesiones para mostrar',
  message = 'Ajusta los filtros o guarda una sesión para ver aquí tus ejercicios, pesos y repeticiones.',
  showAction = true
}: {
  title?: string
  message?: string
  showAction?: boolean
}) {
  return (
    <div className="card border-dashed px-5 py-12 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-subtle">
        <Dumbbell className="size-7" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-extrabold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-secondary">
        {message}
      </p>
      {showAction && (
        <Link to="/entrenamiento" className="btn-primary mt-5">
          Empezar entrenamiento
        </Link>
      )}
    </div>
  )
}

function getExerciseOptions(
  exercises: Exercise[],
  sessions: WorkoutSession[],
  canonicalExerciseIds: Map<string, string>
) {
  const loggedIds = new Set<string>()
  const logCounts = new Map<string, number>()

  for (const session of sessions) {
    for (const log of session.exerciseLogs) {
      const canonicalId = canonicalExerciseIds.get(log.exerciseId) ?? log.exerciseId
      loggedIds.add(canonicalId)
      logCounts.set(canonicalId, (logCounts.get(canonicalId) ?? 0) + 1)
    }
  }

  const shownIds = new Set<string>()
  return exercises
    .filter((exercise) => {
      const canonicalId = canonicalExerciseIds.get(exercise.id) ?? exercise.id
      if (canonicalId !== exercise.id || shownIds.has(canonicalId)) return false
      shownIds.add(canonicalId)
      return loggedIds.has(canonicalId)
    })
    .sort((a, b) =>
      (logCounts.get(b.id) ?? 0) - (logCounts.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name)
    )
}

function getExerciseProgressSummaries(
  exerciseOptions: Exercise[],
  sessions: WorkoutSession[],
  exercises: Exercise[],
  canonicalExerciseIds: Map<string, string>
): ExerciseProgressSummary[] {
  return exerciseOptions
    .map((exercise) => {
      const equivalentIds = getEquivalentIdsForExercise(exercise.id, exercises, canonicalExerciseIds)
      const entries = getProgressEntries(sessions, equivalentIds, canonicalExerciseIds)
      const latestEntry = entries[0]
      return {
        exercise,
        entries,
        bestWeight: Math.max(0, ...entries.map(getProgressEntryWeight)),
        sessionCount: entries.length,
        accumulatedVolume: entries.reduce(
          (sum, entry) => sum + getSessionVolume({ ...entry.session, exerciseLogs: [entry.log] }),
          0
        ),
        latestEntry,
        latestReps: latestEntry ? formatSetReps(latestEntry.log.sets) : '',
        latestWeight: latestEntry ? getProgressEntryWeight(latestEntry) : 0
      }
    })
    .filter((summary) => summary.sessionCount > 0)
    .sort((a, b) =>
      (b.latestEntry?.session.startedAt ?? '').localeCompare(a.latestEntry?.session.startedAt ?? '') ||
      b.sessionCount - a.sessionCount ||
      a.exercise.name.localeCompare(b.exercise.name)
    )
}

function getEquivalentIdsForExercise(
  exerciseId: string,
  exercises: Exercise[],
  canonicalExerciseIds: Map<string, string>
) {
  const ids = new Set(getEquivalentExerciseIds(exercises, exerciseId))
  for (const [from, to] of canonicalExerciseIds) {
    if (to === exerciseId) ids.add(from)
  }
  ids.add(exerciseId)
  return ids
}

function getProgressEntries(
  sessions: WorkoutSession[],
  equivalentExerciseIds: Set<string>,
  canonicalExerciseIds: Map<string, string>
): ProgressEntry[] {
  return sessions.flatMap((session) => {
    const log = session.exerciseLogs.find((item) =>
      equivalentExerciseIds.has(canonicalExerciseIds.get(item.exerciseId) ?? item.exerciseId)
    )
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
}

function filterSessions({
  sessions,
  exercises,
  canonicalExerciseIds,
  filterExerciseId,
  filterDay,
  rangeFilter,
  search
}: {
  sessions: WorkoutSession[]
  exercises: Exercise[]
  canonicalExerciseIds: Map<string, string>
  filterExerciseId: string
  filterDay: string
  rangeFilter: RangeFilter
  search: string
}) {
  const now = new Date()
  const weekStart = getWeekStart(now)
  const nextWeekStart = getNextWeekStart(now)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const normalizedSearch = search.trim().toLowerCase()

  return sessions.filter((session) => {
    const startedAt = new Date(session.startedAt)
    if (rangeFilter === 'week' && (startedAt < weekStart || startedAt >= nextWeekStart)) return false
    if (rangeFilter === 'month' && (startedAt < monthStart || startedAt >= nextMonthStart)) return false
    if (filterDay !== 'all' && session.dayOfWeek !== Number(filterDay)) return false

    if (filterExerciseId !== 'all') {
      const canonicalFilterId = canonicalExerciseIds.get(filterExerciseId) ?? filterExerciseId
      const hasExercise = session.exerciseLogs.some((log) =>
        (canonicalExerciseIds.get(log.exerciseId) ?? log.exerciseId) === canonicalFilterId
      )
      if (!hasExercise) return false
    }

    if (normalizedSearch) {
      const hasMatch = session.exerciseLogs.some((log) => {
        const exercise = exercises.find((item) => item.id === log.exerciseId)
        return (exercise?.name ?? log.exerciseId).toLowerCase().includes(normalizedSearch)
      })
      if (!hasMatch) return false
    }

    return true
  })
}

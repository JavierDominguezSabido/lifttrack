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
  Trophy,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
  getSessionDate,
  getSessionDateObject,
  getSessionVolume,
  getWeekStart,
  isInitialSession
} from '../utils/workout'

const INITIAL_VISIBLE_SESSIONS = 10

type RangeFilter = 'week' | 'month' | 'all'
type HistoryTab = 'progress' | 'sessions'

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
    exercises,
    templates,
    getExerciseById
  } = useWorkouts()
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [historyTab, setHistoryTab] = useState<HistoryTab>('progress')
  const [selectedProgressId, setSelectedProgressId] = useState<string | undefined>(exerciseId)
  const [filterExerciseId, setFilterExerciseId] = useState('all')
  const [filterDay, setFilterDay] = useState('all')
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all')
  const [search, setSearch] = useState('')
  const [progressSearch, setProgressSearch] = useState('')
  const [progressSelectorOpen, setProgressSelectorOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [visibleProgressCount, setVisibleProgressCount] = useState(8)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_SESSIONS)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)

  const realSessions = useMemo(
    () => [...sessions]
      .filter((session) => !isInitialSession(session.id))
      .sort((a, b) => getSessionDate(b).localeCompare(getSessionDate(a))),
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
  const activeFilterCount = [
    filterExerciseId !== 'all',
    filterDay !== 'all',
    rangeFilter !== 'all',
    search.trim() !== ''
  ].filter(Boolean).length
  const filterSummary = activeFilterCount === 0
    ? 'Sin filtros activos'
    : [
        filterExerciseId !== 'all'
          ? exerciseOptions.find((item) => item.id === filterExerciseId)?.name ?? 'Ejercicio'
          : null,
        filterDay !== 'all' ? dayNames[Number(filterDay)] : null,
        rangeFilter !== 'all'
          ? rangeFilter === 'week' ? 'Esta semana' : 'Este mes'
          : null,
        search.trim() ? `"${search.trim()}"` : null
      ].filter(Boolean).join(' · ')

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [historyTab])

  async function removeSession(session: WorkoutSession) {
    const sessionDate = getSessionDateObject(session)
    const label = `${dayNames[sessionDate.getDay()]}, ${formatDate(sessionDate, {
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

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line/70 bg-raised p-1">
        {([
          ['progress', 'Progreso'],
          ['sessions', 'Sesiones']
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setHistoryTab(value)}
            className={`min-h-10 rounded-lg text-sm font-extrabold transition ${
              historyTab === value ? 'bg-brand-soft text-brand' : 'text-secondary hover:bg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {historyTab === 'progress' && (
      <section aria-labelledby="exercise-progress-title" className="card overflow-hidden">
        <div className="border-b border-line/70 p-4 md:p-5">
          <p className="eyebrow">Progreso por ejercicio</p>
          <h2 id="exercise-progress-title" className="mt-1 text-xl font-extrabold tracking-tight text-ink">
            Evolución
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary">
            Busca un ejercicio y revisa cómo evoluciona su peso de trabajo sesión a sesión.
          </p>
        </div>

        {selectedExercise && selectedSummary ? (
          <div className="space-y-4 p-4 md:p-5">
            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-secondary">
                Ejercicio seleccionado
              </span>
              <button
                type="button"
                onClick={() => setProgressSelectorOpen(true)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-control bg-raised px-3 py-2.5 text-left text-base font-extrabold text-ink outline-none transition hover:bg-muted focus-visible:ring-4 focus-visible:ring-brand-soft sm:max-w-xl"
                aria-haspopup="dialog"
                aria-expanded={progressSelectorOpen}
              >
                <span className="min-w-0 truncate">{selectedExercise.name}</span>
                <ChevronDown className="size-4 shrink-0 text-secondary" aria-hidden="true" />
              </button>
            </div>

            <div className="min-w-0 space-y-5">
              <div className="rounded-xl bg-muted/45 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">{selectedExercise.muscleGroup ?? 'Ejercicio'}</p>
                    <h3 className="mt-1 text-2xl font-extrabold text-ink">{selectedExercise.name}</h3>
                    <p className="mt-1 text-sm font-medium text-secondary">
                      Última sesión: {latestProgressSession
                        ? formatDate(getSessionDateObject(latestProgressSession), {
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
                  <span className="rounded-md bg-raised px-2 py-1 text-xs font-bold text-secondary">
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
                <div className="rounded-xl border border-dashed border-line bg-muted/60 px-4 py-8 text-center">
                  <BarChart3 className="mx-auto size-7 text-subtle" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold text-secondary">
                    Guarda una sesión con este ejercicio para ver su evolución.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-line/70 bg-surface">
                <div className="border-b border-line/70 px-4 py-3">
                  <h4 className="font-extrabold text-ink">Registros recientes</h4>
                </div>
                <div className="divide-y divide-line px-4">
                  {recentProgressEntries.map((entry) => (
                    <div key={entry.session.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 text-sm sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-center">
                      <span className="font-bold text-ink">
                        {formatDate(getSessionDateObject(entry.session), { day: '2-digit', month: '2-digit', year: '2-digit' })}
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

            {progressSelectorOpen && (
              <ExerciseProgressSelector
                summaries={filteredExerciseProgressSummaries}
                search={progressSearch}
                selectedExerciseId={selectedExercise.id}
                onSearchChange={setProgressSearch}
                onClose={() => setProgressSelectorOpen(false)}
                onSelect={(summary) => {
                  setSelectedProgressId(summary.exercise.id)
                  setVisibleProgressCount(8)
                  setProgressSelectorOpen(false)
                }}
              />
            )}
          </div>
        ) : (
          <EmptyHistoryState
            title="No hay ejercicios con progreso"
            message="Guarda una sesión para ver aquí la evolución por ejercicio."
            showAction={realSessions.length === 0}
          />
        )}
      </section>
      )}

      {historyTab === 'sessions' && (
      <>
      <section aria-labelledby="history-filters-title" className="card p-3.5 md:p-4">
        <div className="flex items-center justify-between gap-3 md:mb-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((current) => !current)}
            className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg text-left md:pointer-events-none"
            aria-expanded={filtersOpen}
            aria-controls="history-filters-panel"
          >
            <Filter className="size-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0">
              <span id="history-filters-title" className="block font-extrabold text-ink">Filtros</span>
              <span className="block truncate text-xs font-semibold text-secondary">{filterSummary}</span>
            </span>
            {activeFilterCount > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-extrabold text-brand">
                {activeFilterCount}
              </span>
            )}
            {filtersOpen ? (
              <ChevronUp className="size-4 shrink-0 text-secondary md:hidden" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-secondary md:hidden" aria-hidden="true" />
            )}
          </button>
        </div>
        <div
          id="history-filters-panel"
          className={`${filtersOpen ? 'grid' : 'hidden'} mt-3 gap-2.5 sm:grid-cols-2 md:grid xl:grid-cols-4`}
        >
          <label>
            <span className="mb-1 block text-xs font-bold text-secondary">Ejercicio</span>
            <select
              className="input min-h-12 !text-left !font-semibold"
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
              className="input min-h-12 !text-left !font-semibold"
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
              className="input min-h-12 !text-left !font-semibold"
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
                className="input min-h-12 !text-left !font-semibold pl-9"
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
      </>
      )}
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
  const sessionDate = getSessionDateObject(session)

  return (
    <article className="card overflow-hidden">
      <header className="p-3.5 sm:p-5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {dayNames[sessionDate.getDay()]}
            </p>
            <h3 className="mt-0.5 break-words text-base font-extrabold leading-snug text-ink sm:text-lg">
              {formatDate(sessionDate, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-secondary sm:text-sm">
              <span>{session.exerciseLogs.length} ejercicios</span>
              <span aria-hidden="true">·</span>
              <span>{completedSets} series</span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{formatCompactNumber(volume)} kg</span>
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

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="btn-secondary !min-h-10 !px-2 !py-2 text-xs sm:!min-h-11 sm:text-sm"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {expanded ? 'Ocultar' : 'Ver detalle'}
          </button>
          <Link
            to={`/historial/sesion/${session.id}/editar`}
            className="btn-secondary !min-h-10 !px-2 !py-2 text-xs sm:!min-h-11 sm:text-sm"
          >
            <Edit3 className="size-4" aria-hidden="true" />
            Editar
          </Link>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-10 w-11 items-center justify-center rounded-xl border border-line bg-transparent text-subtle transition hover:border-danger/40 hover:bg-danger-soft hover:text-danger-text active:scale-[0.98] sm:min-h-11"
            aria-label="Borrar sesión"
          >
            <Trash2 className="size-4" aria-hidden="true" />
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
                      <p className="break-words font-extrabold leading-tight text-ink">
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

function ExerciseProgressSelector({
  summaries,
  search,
  selectedExerciseId,
  onSearchChange,
  onSelect,
  onClose
}: {
  summaries: ExerciseProgressSummary[]
  search: string
  selectedExerciseId: string
  onSearchChange: (value: string) => void
  onSelect: (summary: ExerciseProgressSummary) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40 p-3 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Seleccionar ejercicio">
      <div className="max-h-[86vh] w-full overflow-hidden rounded-3xl border border-line bg-surface shadow-card sm:max-w-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line bg-muted/40 p-4 sm:p-5">
          <div>
            <p className="eyebrow">Ejercicio</p>
            <h3 className="mt-1 text-xl font-extrabold text-ink">Seleccionar ejercicio</h3>
          </div>
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-raised" aria-label="Cerrar selector">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-secondary">
              Buscar
            </span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input
                autoFocus
                className="input min-h-12 !text-left !font-semibold pl-9"
                value={search}
                placeholder="Buscar ejercicio..."
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </span>
          </label>

          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {summaries.map((summary) => {
              const selected = summary.exercise.id === selectedExerciseId
              return (
                <button
                  key={summary.exercise.id}
                  type="button"
                  onClick={() => onSelect(summary)}
                  className={`w-full rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                    selected
                      ? 'border-brand bg-brand-soft text-ink ring-2 ring-brand-soft'
                      : 'border-line bg-raised hover:border-brand/50 hover:bg-muted/60'
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
            {summaries.length === 0 && (
              <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm font-semibold text-secondary">
                No hay ejercicios que coincidan con la búsqueda.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProgressLineChart({ entries }: { entries: ProgressEntry[] }) {
  const weights = entries.map(getProgressEntryWeight)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const range = Math.max(1, maxWeight - minWeight)
  const pointTop = 18
  const pointBottom = 78
  const points = entries.map((entry, index) => {
    const weight = getProgressEntryWeight(entry)
    const x = entries.length === 1 ? 50 : 4 + (index / (entries.length - 1)) * 92
    const y = pointBottom - ((weight - minWeight) / range) * (pointBottom - pointTop)
    const label = `${weight} kg`
    const labelOffset = 24
    const reps = formatSetReps(entry.log.sets)
    return {
      x,
      y,
      entry,
      label,
      labelOffset,
      reps
    }
  })
  const path = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  ).join(' ')

  return (
    <div className="rounded-xl border border-line/70 bg-surface px-3.5 py-4 sm:px-5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-extrabold text-ink">Peso de trabajo</h4>
          <p className="text-xs font-semibold text-secondary">Últimas {entries.length} sesiones registradas</p>
        </div>
        <p className="rounded-md bg-muted px-2 py-1 text-xs font-bold text-secondary">{minWeight} - {maxWeight} kg</p>
      </div>

      <div className="relative mt-4 h-48 overflow-visible" role="img" aria-label="Evolucion del peso de trabajo por fecha">
        <div className="absolute inset-x-1 top-12 bottom-10 sm:inset-x-2">
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path
              d={path}
              className="fill-none stroke-brand"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {points.map(({ x, y, entry, label, labelOffset, reps }) => {
            const date = formatDate(getSessionDateObject(entry.session), { day: '2-digit', month: '2-digit', year: '2-digit' })
            return (
              <div
                key={entry.session.id}
                className="absolute"
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                title={[
                  date,
                  label,
                  reps ? `${reps} reps` : undefined
                ].filter(Boolean).join('\n')}
                aria-label={[
                  date,
                  label,
                  reps ? `${reps} reps` : undefined
                ].filter(Boolean).join(', ')}
              >
                <span
                  className="absolute left-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-ink shadow-sm"
                  style={{ bottom: `${labelOffset}px`, transform: 'translateX(-50%)' }}
                >
                  {label}
                </span>
                <span className="block size-3.5 rounded-full border-[2.5px] border-brand bg-surface shadow-sm" />
                <span className="absolute left-1/2 top-1/2 block size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />
                <span
                  className="absolute left-1/2 top-7 whitespace-nowrap text-[10px] font-bold leading-none text-secondary"
                  style={{ transform: 'translateX(-50%)' }}
                >
                  {formatDate(getSessionDateObject(entry.session), { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            )
          })}
        </div>
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
    <div className={`card flex ${compact ? 'min-h-18' : 'min-h-20'} items-center gap-3 p-3 sm:p-3.5 ${wide ? 'col-span-2 md:col-span-1' : ''}`}>
      <span className={`${compact ? 'size-8' : 'size-9'} grid shrink-0 place-items-center rounded-lg bg-muted text-brand`}>
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
    <div className="card border-dashed px-5 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-subtle">
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
      (b.latestEntry ? getSessionDate(b.latestEntry.session) : '')
        .localeCompare(a.latestEntry ? getSessionDate(a.latestEntry.session) : '') ||
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
    const sessionDate = getSessionDateObject(session)
    if (rangeFilter === 'week' && (sessionDate < weekStart || sessionDate >= nextWeekStart)) return false
    if (rangeFilter === 'month' && (sessionDate < monthStart || sessionDate >= nextMonthStart)) return false
    if (filterDay !== 'all' && sessionDate.getDay() !== Number(filterDay)) return false

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

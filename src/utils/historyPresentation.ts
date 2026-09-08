import type { Exercise, ExerciseLog, SetLog, WorkoutSession, WorkoutTemplate } from '../types'
import { getEquivalentExerciseIds } from './exerciseIdentity'
import { getSessionRoutineIdentity } from './historySession'
import { calculateWeeklyStreak, dayNames, formatCompactNumber, formatDate, getNextWeekStart, getSessionDate, getSessionDateObject, getSessionVolume, getPerformedWeight, getWeekStart } from './workout'
export type RangeFilter = 'week' | 'month' | 'all'
export interface ProgressEntry {
  session: WorkoutSession
  log: ExerciseLog
  bestSet?: SetLog
}

export interface ExerciseProgressSummary {
  exercise: Exercise
  entries: ProgressEntry[]
  bestWeight: number
  sessionCount: number
  accumulatedVolume: number
  latestDate?: string
  latestEntry?: ProgressEntry
  latestReps: string
  latestWeight: number
}

export function formatSetReps(sets: SetLog[]) {
  return sets
    .filter((set) => set.completed)
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((set) => set.reps)
    .join('-')
}

export function getProgressEntryWeight(entry: ProgressEntry) {
  const completed = entry.log.sets
    .filter((set) => set.completed)
    .sort((a, b) => a.setNumber - b.setNumber)
  return entry.log.workingWeightKg ?? completed[0]?.weightKg ?? entry.bestSet?.weightKg ?? 0
}

export function countCompletedSets(session: WorkoutSession) {
  return session.exerciseLogs.reduce(
    (total, log) => total + log.sets.filter((set) => set.completed).length,
    0
  )
}

export function getSessionDeletionMessage(session: WorkoutSession, templates: WorkoutTemplate[]) {
  const sessionDate = getSessionDateObject(session)
  const routine = getSessionRoutineIdentity(session, templates, sessionDate.getDay())
  const registeredDate = formatDate(sessionDate, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
  const routineLabel = `${routine.dayIsExplicit ? dayNames[routine.dayOfWeek] : 'Día de rutina sin confirmar'}${routine.template?.name ? ` · ${routine.template.name}` : ''}`
  return [
    'Vas a eliminar:',
    routineLabel,
    `Fecha registrada: ${registeredDate}`,
    `${session.exerciseLogs.length} ejercicios · ${countCompletedSets(session)} series · ${formatCompactNumber(getSessionVolume(session))} kg`,
    '',
    'Esta acción no se puede deshacer. ¿Continuar?'
  ].join('\n')
}

export function getHistorySummary(sessions: WorkoutSession[]) {
  const weekStarts = [...new Set(sessions.map((session) => {
    const weekStart = getWeekStart(getSessionDateObject(session))
    return `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`
  }))].map((key) => {
    const [year, month, day] = key.split('-').map(Number)
    return new Date(year, month, day)
  }).sort((a, b) => b.getTime() - a.getTime())

  return {
    sessionCount: sessions.length,
    activeWeeks: weekStarts.length,
    streakWeeks: calculateWeeklyStreak(sessions),
    totalVolume: sessions.reduce((total, session) => total + (getSessionVolume(session)), 0),
    latestSession: sessions[0]
  }
}

export function getExerciseOptions(
  exercises: Exercise[],
  sessions: WorkoutSession[],
  canonicalExerciseIds: Map<string, string>,
  historicalCounts?: Record<string, number>
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

  if (historicalCounts) {
    loggedIds.clear(); logCounts.clear()
    for (const [id,count] of Object.entries(historicalCounts)) {
      const canonical = canonicalExerciseIds.get(id) ?? id
      loggedIds.add(canonical); logCounts.set(canonical,(logCounts.get(canonical) ?? 0)+count)
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

export function getExerciseProgressSummaries(
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
        bestWeight: Math.max(0, ...entries.map(entry => getPerformedWeight(entry.log))),
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

export function getEquivalentIdsForExercise(
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

export function getProgressEntries(
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

export function filterSessions({
  sessions,
  exercises,
  templates,
  canonicalExerciseIds,
  filterExerciseId,
  filterDay,
  rangeFilter,
  search
}: {
  sessions: WorkoutSession[]
  exercises: Exercise[]
  templates: WorkoutTemplate[]
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
    const routine = getSessionRoutineIdentity(session, templates, sessionDate.getDay())
    if (filterDay !== 'all' && routine.dayOfWeek !== Number(filterDay)) return false

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

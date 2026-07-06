import { exercises } from '../data/mockData'
import type {
  LastExercisePerformance,
  WorkoutSession,
  WorkoutTemplate,
  WorkoutTemplateExercise
} from '../types'

export const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const shortDayNames = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

export function getExercise(exerciseId: string) {
  return exercises.find((exercise) => exercise.id === exerciseId)
}

export function isInitialSession(sessionId: string) {
  return sessionId.startsWith('initial-')
}

export function getCurrentWeekSessions(
  sessions: WorkoutSession[],
  date = new Date()
) {
  const start = getWeekStart(date)
  const end = getNextWeekStart(date)

  return sessions.filter((session) => {
    if (!session.completedAt || isInitialSession(session.id)) return false
    const startedAt = new Date(session.startedAt)
    return startedAt >= start && startedAt < end
  })
}

export function getWeekStart(date = new Date()) {
  const start = new Date(date)
  const dayFromMonday = (start.getDay() + 6) % 7
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - dayFromMonday)
  return start
}

export function getNextWeekStart(date = new Date()) {
  const next = getWeekStart(date)
  next.setDate(next.getDate() + 7)
  return next
}

export function getWeekKey(date: Date) {
  const monday = getWeekStart(date)
  const year = monday.getFullYear()
  const month = String(monday.getMonth() + 1).padStart(2, '0')
  const day = String(monday.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCompletedRoutineDaysForWeek(
  sessions: WorkoutSession[],
  templates: WorkoutTemplate[],
  date = new Date()
) {
  const routineDays = new Set(templates.map((template) => template.dayOfWeek))
  return new Set(
    getCurrentWeekSessions(sessions, date)
      .filter((session) => routineDays.has(session.dayOfWeek))
      .map((session) => session.dayOfWeek)
  )
}

export function calculateWeeklyStreak(
  sessions: WorkoutSession[],
  date = new Date()
) {
  const activeWeeks = new Set(
    sessions
      .filter((session) => session.completedAt && !isInitialSession(session.id))
      .map((session) => getWeekKey(new Date(session.startedAt)))
  )

  let streak = 0
  const cursor = getWeekStart(date)
  while (activeWeeks.has(getWeekKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 7)
  }

  return streak
}

export function getNextPendingTemplate(
  templates: WorkoutTemplate[],
  completedDays: Set<number>,
  date = new Date()
) {
  const sortedTemplates = [...templates].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  const today = date.getDay()

  return sortedTemplates.find((template) =>
    template.dayOfWeek >= today && !completedDays.has(template.dayOfWeek)
  ) ?? sortedTemplates.find((template) => !completedDays.has(template.dayOfWeek))
}

export function getTodayTemplate(templates: WorkoutTemplate[], date = new Date()) {
  const today = date.getDay()
  return templates.find((template) => template.dayOfWeek >= today) ?? templates[0]
}

export function formatRestSeconds(seconds?: number) {
  if (!seconds) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function completedTarget(
  performance: LastExercisePerformance,
  target: WorkoutTemplateExercise
) {
  const targetReps = Number.parseInt(target.targetReps, 10)
  return performance.reps.length >= target.targetSets &&
    performance.reps
      .slice(0, target.targetSets)
      .every((reps) => reps >= targetReps)
}

export function getProgressionSuggestion(
  performance: LastExercisePerformance,
  target: WorkoutTemplateExercise
) {
  return completedTarget(performance, target) ? 'subir peso' : 'repetir peso'
}

export function getSessionVolume(session: WorkoutSession) {
  return session.exerciseLogs.reduce(
    (total, log) =>
      total +
      log.sets.reduce(
        (exerciseTotal, set) => exerciseTotal + (set.completed ? set.reps * set.weightKg : 0),
        0
      ),
    0
  )
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('es-ES', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value)
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('es-ES', options ?? {
    day: 'numeric',
    month: 'short'
  }).format(new Date(value))
}

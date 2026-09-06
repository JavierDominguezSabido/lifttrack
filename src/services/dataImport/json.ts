import type { Exercise, WorkoutSession, WorkoutTemplate } from '../../types'
import type { ImportPayload } from './types'

import { amount, boolean, day, integer, optional, string, text as nonempty, unique, validDate } from './validation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const notes = (v: Record<string, unknown>) => optional(v.notes, string) && optional(v.syncRevision, nonempty)
function validateExercise(v: unknown): v is Exercise {
  return isRecord(v) && nonempty(v.id) && nonempty(v.name) && notes(v) &&
    optional(v.active, boolean) && optional(v.equipment, string) && optional(v.dayOfWeek, day) &&
    optional(v.muscleGroup, x => ['Pecho', 'Espalda', 'Pierna', 'Hombro', 'Bíceps', 'Tríceps', 'Core'].includes(x as string)) &&
    optional(v.targetSets, x => integer(x, 1)) && optional(v.targetReps, nonempty) &&
    optional(v.restSeconds, integer) && optional(v.lastWeightKg, amount) &&
    optional(v.lastReps, x => Array.isArray(x) && x.every(n => integer(n)))
}
function validateSession(v: unknown): v is WorkoutSession {
  if (!isRecord(v) || !nonempty(v.id) || !nonempty(v.name) || !day(v.dayOfWeek) || !notes(v) ||
    !optional(v.templateId, nonempty) || !validDate(v.startedAt) || !optional(v.completedAt, validDate) ||
    (typeof v.completedAt === 'string' && Date.parse(v.completedAt) < Date.parse(v.startedAt)) ||
    !optional(v.durationMinutes, integer) || !optional(v.volumeKg, x => amount(x, 999999999999.99)) ||
    !Array.isArray(v.exerciseLogs)) return false
  return v.exerciseLogs.every(log => isRecord(log) && nonempty(log.id) && nonempty(log.exerciseId) &&
    optional(log.sessionId, x => x === v.id) && integer(log.order, 1) && notes(log) &&
    optional(log.workingWeightKg, amount) && Array.isArray(log.sets) &&
    log.sets.every(set => isRecord(set) && nonempty(set.id) && optional(set.exerciseLogId, x => x === log.id) &&
      integer(set.setNumber, 1) && integer(set.reps) && amount(set.weightKg) &&
      optional(set.weightOverrideKg, amount) && optional(set.isWarmup, boolean) && boolean(set.completed) &&
      (!set.completed || set.reps > 0)) && unique(log.sets.map(set => set.setNumber))) &&
    unique(v.exerciseLogs.map(log => log.order)) &&
    amount(v.exerciseLogs.reduce((sum, log) => sum + log.sets.reduce((total: number, set: { completed: boolean; reps: number; weightKg: number; weightOverrideKg?: number }) => total + (set.completed ? set.reps * (set.weightOverrideKg ?? set.weightKg) : 0), 0), 0), 999999999999.99)
}
function validateTemplate(v: unknown): v is WorkoutTemplate {
  return isRecord(v) && nonempty(v.id) && nonempty(v.name) && day(v.dayOfWeek) && notes(v) &&
    Array.isArray(v.exercises) && v.exercises.every(item => isRecord(item) && nonempty(item.id) &&
      item.templateId === v.id && nonempty(item.exerciseId) && integer(item.order, 1) &&
      integer(item.targetSets, 1) && nonempty(item.targetReps) && optional(item.restSeconds, integer) && notes(item)) &&
    unique(v.exercises.map(item => item.order)) && unique(v.exercises.map(item => item.exerciseId))
}

export function parseWorkoutBackup(text: string, filename: string): ImportPayload {
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      !isRecord(parsed) ||
      parsed.format !== 'lifttrack-backup' ||
      parsed.version !== 1 ||
      !optional(parsed.exportedAt, validDate) ||
      !optional(parsed.dataMode, x => x === 'local' || x === 'cloud') ||
      !Array.isArray(parsed.sessions) ||
      !Array.isArray(parsed.exercises) ||
      (parsed.templates !== undefined && !Array.isArray(parsed.templates))
    ) {
      return {
        source: 'json',
        filename,
        sessions: [],
        exercises: [],
        templates: [],
        errors: ['El archivo no es una copia de seguridad válida de LiftTrack.']
      }
    }

    const rawTemplates = Array.isArray(parsed.templates) ? parsed.templates : []
    const invalidSessions = parsed.sessions.filter((session) => !validateSession(session)).length
    const invalidExercises = parsed.exercises.filter((exercise) => !validateExercise(exercise)).length
    const invalidTemplates = rawTemplates.filter((template) => !validateTemplate(template)).length
    const errors: string[] = []
    if (invalidSessions) errors.push(`${invalidSessions} sesiones tienen un formato no válido.`)
    if (invalidExercises) errors.push(`${invalidExercises} ejercicios tienen un formato no válido.`)
    if (invalidTemplates) errors.push(`${invalidTemplates} rutinas tienen un formato no válido.`)

    const sessions = parsed.sessions.filter(validateSession)
    const templates = rawTemplates.filter(validateTemplate)
    const exercises = parsed.exercises.filter(validateExercise)
    const groups = [sessions, templates, exercises, templates.flatMap(t => t.exercises),
      sessions.flatMap(s => s.exerciseLogs), sessions.flatMap(s => s.exerciseLogs.flatMap(l => l.sets))]
    if (groups.some(group => !unique(group.map(item => item.id)))) errors.push('El archivo contiene identificadores duplicados.')
    if (errors.length) return { source: 'json', filename, sessions: [], templates: [], exercises: [], errors }

    return {
      source: 'json',
      filename,
      sessions: sessions.map((session) => ({
        ...session,
        exerciseLogs: session.exerciseLogs.map((log) => ({
          ...log,
          sessionId: session.id,
          sets: log.sets.map((set) => ({
            ...set,
            exerciseLogId: log.id
          }))
        }))
      })),
      exercises: exercises
        .map((exercise) => ({ ...exercise, active: exercise.active !== false })),
      templates,
      errors
    }
  } catch {
    return {
      source: 'json',
      filename,
      sessions: [],
      exercises: [],
      templates: [],
      errors: ['No se pudo leer el JSON. Comprueba que el archivo no esté dañado.']
    }
  }
}

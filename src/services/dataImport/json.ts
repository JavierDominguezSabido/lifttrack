import type { Exercise, WorkoutSession, WorkoutTemplate } from '../../types'
import type { ImportPayload } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validateExercise(value: unknown): value is Exercise {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0
}

function validateSession(value: unknown): value is WorkoutSession {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.trim().length === 0 ||
    typeof value.name !== 'string' ||
    value.name.trim().length === 0 ||
    typeof value.dayOfWeek !== 'number' ||
    !Number.isInteger(value.dayOfWeek) ||
    value.dayOfWeek < 0 ||
    value.dayOfWeek > 6 ||
    typeof value.startedAt !== 'string' ||
    Number.isNaN(new Date(value.startedAt).getTime()) ||
    !Array.isArray(value.exerciseLogs)
  ) return false

  return value.exerciseLogs.every((log) =>
    isRecord(log) &&
    typeof log.id === 'string' &&
    log.id.length > 0 &&
    typeof log.exerciseId === 'string' &&
    log.exerciseId.length > 0 &&
    typeof log.order === 'number' &&
    Number.isInteger(log.order) &&
    log.order > 0 &&
    Array.isArray(log.sets) &&
    log.sets.every((set) =>
      isRecord(set) &&
      typeof set.id === 'string' &&
      typeof set.setNumber === 'number' &&
      Number.isInteger(set.setNumber) &&
      set.setNumber > 0 &&
      typeof set.reps === 'number' &&
      Number.isInteger(set.reps) &&
      set.reps >= 0 &&
      typeof set.weightKg === 'number' &&
      Number.isFinite(set.weightKg) &&
      set.weightKg >= 0 &&
      typeof set.completed === 'boolean' &&
      (!set.completed || set.reps > 0)
    )
  )
}

function validateTemplate(value: unknown): value is WorkoutTemplate {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.trim().length === 0 ||
    typeof value.name !== 'string' ||
    value.name.trim().length === 0 ||
    typeof value.dayOfWeek !== 'number' ||
    !Number.isInteger(value.dayOfWeek) ||
    value.dayOfWeek < 0 ||
    value.dayOfWeek > 6 ||
    !Array.isArray(value.exercises)
  ) return false

  return value.exercises.every((item) =>
    isRecord(item) &&
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.templateId === 'string' &&
    item.templateId.length > 0 &&
    typeof item.exerciseId === 'string' &&
    item.exerciseId.length > 0 &&
    typeof item.order === 'number' &&
    Number.isInteger(item.order) &&
    item.order > 0 &&
    typeof item.targetSets === 'number' &&
    Number.isInteger(item.targetSets) &&
    item.targetSets > 0 &&
    typeof item.targetReps === 'string' &&
    item.targetReps.trim().length > 0 &&
    (item.restSeconds === undefined ||
      (typeof item.restSeconds === 'number' && Number.isFinite(item.restSeconds) && item.restSeconds >= 0))
  )
}

export function parseWorkoutBackup(text: string, filename: string): ImportPayload {
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      !isRecord(parsed) ||
      parsed.format !== 'lifttrack-backup' ||
      parsed.version !== 1 ||
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

    return {
      source: 'json',
      filename,
      sessions: parsed.sessions.filter(validateSession).map((session) => ({
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
      exercises: parsed.exercises
        .filter(validateExercise)
        .map((exercise) => ({ ...exercise, active: exercise.active !== false })),
      templates: rawTemplates.filter(validateTemplate),
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

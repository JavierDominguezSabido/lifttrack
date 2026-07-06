import type { Exercise, WorkoutSession } from '../../types'
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

export function parseWorkoutBackup(text: string, filename: string): ImportPayload {
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      !isRecord(parsed) ||
      parsed.format !== 'lifttrack-backup' ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.sessions) ||
      !Array.isArray(parsed.exercises)
    ) {
      return {
        source: 'json',
        filename,
        sessions: [],
        exercises: [],
        errors: ['El archivo no es una copia de seguridad válida de LiftTrack.']
      }
    }

    const invalidSessions = parsed.sessions.filter((session) => !validateSession(session)).length
    const invalidExercises = parsed.exercises.filter((exercise) => !validateExercise(exercise)).length
    const errors: string[] = []
    if (invalidSessions) errors.push(`${invalidSessions} sesiones tienen un formato no válido.`)
    if (invalidExercises) errors.push(`${invalidExercises} ejercicios tienen un formato no válido.`)

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
      errors
    }
  } catch {
    return {
      source: 'json',
      filename,
      sessions: [],
      exercises: [],
      errors: ['No se pudo leer el JSON. Comprueba que el archivo no esté dañado.']
    }
  }
}

import type {
  DraftExerciseLog,
  DraftSetLog,
  Exercise,
  SetLog,
  WorkoutSession,
  WorkoutTemplate
} from '../types'
import { getEquivalentExerciseIds } from './exerciseIdentity'
import { getLastExercisePerformanceFromSessions } from './workoutHistory'

export interface WorkoutDraftValidationError {
  exerciseId: string
  setNumber: number
  message: string
}

export function normalizeWeight(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value * 100) / 100)
}

export function normalizeRepsInput(value: string) {
  return value.replace(/^0+(?=\d)/, '')
}

export function getWorkingWeight(log: DraftExerciseLog) {
  return normalizeWeight(log.workingWeightKg ?? log.sets[0]?.weightKg ?? 0)
}

export function applyWorkingWeight(
  log: DraftExerciseLog,
  value: number
): DraftExerciseLog {
  const workingWeightKg = normalizeWeight(value)

  return {
    ...log,
    workingWeightKg,
    sets: log.sets.map((set) => ({
      ...set,
      weightKg: workingWeightKg,
      weightOverrideKg: undefined
    }))
  }
}

export function setAllSetsCompleted(
  log: DraftExerciseLog,
  completed: boolean
): DraftExerciseLog {
  return {
    ...log,
    sets: log.sets.map((set) => ({ ...set, completed }))
  }
}

export function createExerciseLogs(
  template: WorkoutTemplate,
  sessions: WorkoutSession[],
  exercises: Exercise[] = []
): DraftExerciseLog[] {
  return template.exercises.map((item) => {
    const logId = `draft-${item.id}`
    const equivalentIds = getEquivalentExerciseIds(exercises, item.exerciseId)
    const previousWeight =
      getLastExercisePerformanceFromSessions(sessions, item.exerciseId, equivalentIds)?.weightKg ?? 0

    return {
      id: logId,
      sessionId: 'draft',
      exerciseId: item.exerciseId,
      order: item.order,
      workingWeightKg: previousWeight,
      sets: Array.from({ length: item.targetSets }, (_, index): DraftSetLog => ({
        id: `${logId}-set-${index + 1}`,
        exerciseLogId: logId,
        setNumber: index + 1,
        reps: item.targetReps,
        weightKg: previousWeight,
        completed: false
      }))
    }
  })
}

export function createDraftFromSession(session: WorkoutSession): DraftExerciseLog[] {
  return session.exerciseLogs.map((log) => ({
    ...log,
    sets: log.sets.map((set) => ({
      ...set,
      reps: set.reps > 0 ? String(set.reps) : ''
    }))
  }))
}

export function validateWorkoutDraft(logs: DraftExerciseLog[]) {
  const errors: WorkoutDraftValidationError[] = []

  for (const log of logs) {
    for (const set of log.sets) {
      const reps = set.reps.trim()
      if (set.completed && reps === '') {
        errors.push({
          exerciseId: log.exerciseId,
          setNumber: set.setNumber,
          message: 'Las repeticiones son obligatorias en una serie marcada como hecha.'
        })
      } else if (reps !== '' && (!/^\d+$/.test(reps) || Number(reps) <= 0)) {
        errors.push({
          exerciseId: log.exerciseId,
          setNumber: set.setNumber,
          message: 'Las repeticiones deben ser un número entero mayor que 0.'
        })
      }
    }
  }

  return errors
}

function createSafeId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `workout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

interface CreateWorkoutSessionOptions {
  template: WorkoutTemplate
  logs: DraftExerciseLog[]
  startedAt: string
  completedAt?: Date
  createId?: () => string
}

export function createWorkoutSession({
  template,
  logs,
  startedAt,
  completedAt = new Date(),
  createId = createSafeId
}: CreateWorkoutSessionOptions): WorkoutSession {
  const validationErrors = validateWorkoutDraft(logs)
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0].message)
  }

  const sessionId = createId()
  const exerciseLogs = logs.flatMap((log) => {
    const completedSets = log.sets.filter((set) => set.completed)
    if (completedSets.length === 0) return []

    const exerciseLogId = createId()
    const workingWeightKg = getWorkingWeight(log)
    return [{
      ...log,
      id: exerciseLogId,
      sessionId,
      workingWeightKg,
      sets: completedSets.map((set): SetLog => ({
        ...set,
        id: createId(),
        exerciseLogId,
        reps: Number(set.reps),
        weightKg: normalizeWeight(set.weightOverrideKg ?? workingWeightKg),
        completed: true
      }))
    }]
  })
  const volumeKg = exerciseLogs.reduce(
    (total, log) =>
      total + log.sets.reduce((sum, set) => sum + set.reps * set.weightKg, 0),
    0
  )

  return {
    id: sessionId,
    templateId: template.id,
    name: template.name,
    dayOfWeek: template.dayOfWeek,
    startedAt,
    completedAt: completedAt.toISOString(),
    durationMinutes: Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startedAt).getTime()) / 60000)
    ),
    volumeKg,
    exerciseLogs
  }
}

export function updateWorkoutSession(
  session: WorkoutSession,
  logs: DraftExerciseLog[]
): WorkoutSession {
  const validationErrors = validateWorkoutDraft(logs)
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0].message)
  }

  const exerciseLogs = logs.flatMap((log) => {
    const workingWeightKg = getWorkingWeight(log)
    const sets = log.sets.flatMap((set): SetLog[] => {
      const reps = set.reps.trim()
      if (!set.completed && reps === '') return []

      return [{
        ...set,
        reps: Number(reps),
        weightKg: normalizeWeight(set.weightOverrideKg ?? workingWeightKg)
      }]
    })
    if (sets.length === 0) return []

    return [{
      ...log,
      workingWeightKg,
      sets
    }]
  })
  const volumeKg = exerciseLogs.reduce(
    (total, log) =>
      total + log.sets.reduce(
        (sum, set) => sum + (set.completed ? set.reps * set.weightKg : 0),
        0
      ),
    0
  )

  return {
    ...session,
    volumeKg,
    exerciseLogs
  }
}

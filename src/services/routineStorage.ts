import { exercises as exampleExercises, templates as exampleTemplates } from '../data/mockData'
import type { Exercise, WorkoutTemplate } from '../types'

const LEGACY_EXERCISES_KEY = 'lifttrack.exercises.v1'
const LEGACY_TEMPLATES_KEY = 'lifttrack.workoutTemplates.v1'
const PREFIX = 'lifttrack.routine.v2'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

function keys(owner: string) {
  return {
    exercises: `${PREFIX}.exercises:${owner}`,
    templates: `${PREFIX}.templates:${owner}`
  }
}

/** Catálogo integrado de solo lectura. No incluye marcas, pesos ni últimas repeticiones. */
export function getExerciseCatalog(): Exercise[] {
  return clone(exampleExercises).map((exercise) => {
    const sanitized: Exercise = { ...exercise, active: true }
    delete sanitized.dayOfWeek
    delete sanitized.targetSets
    delete sanitized.targetReps
    delete sanitized.restSeconds
    delete sanitized.lastReps
    delete sanitized.lastWeightKg
    delete sanitized.notes
    return sanitized
  })
}

export function getEmptyRoutine(): WorkoutTemplate[] {
  return clone(exampleTemplates).map((template) => ({ ...template, notes: undefined, exercises: [] }))
}

export function getExampleRoutine(): WorkoutTemplate[] {
  return clone(exampleTemplates)
}

export function getStoredExercises(owner: string): Exercise[] {
  const stored = read<Exercise[]>(keys(owner).exercises)
  if (!Array.isArray(stored)) return getExerciseCatalog()
  const byId = new Map(getExerciseCatalog().map((exercise) => [exercise.id, exercise]))
  for (const exercise of stored) byId.set(exercise.id, { ...exercise, active: exercise.active !== false })
  return [...byId.values()]
}

export function getStoredTemplates(owner: string): WorkoutTemplate[] {
  const stored = read<WorkoutTemplate[]>(keys(owner).templates)
  return Array.isArray(stored) ? clone(stored).sort((a, b) => a.dayOfWeek - b.dayOfWeek) : getEmptyRoutine()
}

export function storeExercises(owner: string, exercises: Exercise[]) {
  localStorage.setItem(keys(owner).exercises, JSON.stringify(exercises))
}

export function storeTemplates(owner: string, templates: WorkoutTemplate[]) {
  localStorage.setItem(keys(owner).templates, JSON.stringify(templates))
}

export function hasCustomRoutine(owner: string) {
  return localStorage.getItem(keys(owner).templates) !== null
}

export function hasLegacyRoutine() {
  return localStorage.getItem(LEGACY_TEMPLATES_KEY) !== null || localStorage.getItem(LEGACY_EXERCISES_KEY) !== null
}

/** Copia, nunca mueve ni borra, las claves globales de versiones anteriores. */
export function copyLegacyRoutine(owner: string, includeExampleFallback = false) {
  if (hasCustomRoutine(owner)) return false
  const templates = read<WorkoutTemplate[]>(LEGACY_TEMPLATES_KEY)
  const exercises = read<Exercise[]>(LEGACY_EXERCISES_KEY)
  if (!templates && !exercises && !includeExampleFallback) return false
  storeTemplates(owner, templates ?? getExampleRoutine())
  storeExercises(owner, exercises ?? clone(exampleExercises))
  return true
}

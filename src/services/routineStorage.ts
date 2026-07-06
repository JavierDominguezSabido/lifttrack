import { exercises as baseExercises, templates as baseTemplates } from '../data/mockData'
import type { Exercise, WorkoutTemplate } from '../types'

const EXERCISES_KEY = 'lifttrack.exercises.v1'
const TEMPLATES_KEY = 'lifttrack.workoutTemplates.v1'

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

export function getStoredExercises(): Exercise[] {
  const stored = read<Exercise[]>(EXERCISES_KEY)
  if (!Array.isArray(stored)) return clone(baseExercises)

  const storedIds = new Set(stored.map((exercise) => exercise.id))
  const missingBaseExercises = baseExercises.filter((exercise) => !storedIds.has(exercise.id))
  return [...stored, ...clone(missingBaseExercises)].map((exercise) => ({
    ...exercise,
    active: exercise.active !== false
  }))
}

export function getStoredTemplates(): WorkoutTemplate[] {
  const stored = read<WorkoutTemplate[]>(TEMPLATES_KEY)
  return Array.isArray(stored) && stored.length > 0 ? stored : clone(baseTemplates)
}

export function storeExercises(exercises: Exercise[]) {
  localStorage.setItem(EXERCISES_KEY, JSON.stringify(exercises))
}

export function storeTemplates(templates: WorkoutTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

export function hasCustomRoutine() {
  return localStorage.getItem(TEMPLATES_KEY) !== null
}

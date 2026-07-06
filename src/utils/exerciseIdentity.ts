import type { Exercise, WorkoutSession, WorkoutTemplate } from '../types'

const CONNECTOR_WORDS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'los',
  'por',
  'un',
  'una'
])

export interface ExerciseDuplicateGroup {
  normalizedName: string
  canonicalId: string
  canonicalName: string
  duplicateIds: string[]
  duplicateNames: string[]
  affectedSessionCount: number
  affectedLogCount: number
}

export function normalizeExerciseName(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token && !CONNECTOR_WORDS.has(token))
    .join(' ')
}

function exerciseNameById(exercises: Exercise[], exerciseId: string) {
  return exercises.find((exercise) => exercise.id === exerciseId)?.name ?? exerciseId
}

function normalizeExerciseIdOrName(exercises: Exercise[], exerciseId: string) {
  return normalizeExerciseName(exerciseNameById(exercises, exerciseId))
}

export function getEquivalentExerciseIds(
  exercises: Exercise[],
  exerciseId: string
) {
  const normalized = normalizeExerciseIdOrName(exercises, exerciseId)
  if (!normalized) return [exerciseId]

  const ids = exercises
    .filter((exercise) => normalizeExerciseName(exercise.name) === normalized)
    .map((exercise) => exercise.id)

  return ids.includes(exerciseId) ? ids : [exerciseId, ...ids]
}

function countLogsByExercise(sessions: WorkoutSession[]) {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    for (const log of session.exerciseLogs) {
      counts.set(log.exerciseId, (counts.get(log.exerciseId) ?? 0) + 1)
    }
  }
  return counts
}

function pickCanonicalId(
  ids: string[],
  exercises: Exercise[],
  templates: WorkoutTemplate[],
  sessions: WorkoutSession[]
) {
  const templateIds = new Set(
    templates.flatMap((template) => template.exercises.map((item) => item.exerciseId))
  )
  const logCounts = countLogsByExercise(sessions)

  return [...ids].sort((a, b) => {
    const aTemplate = Number(templateIds.has(a))
    const bTemplate = Number(templateIds.has(b))
    if (aTemplate !== bTemplate) return bTemplate - aTemplate

    const aActive = Number(exercises.find((exercise) => exercise.id === a)?.active !== false)
    const bActive = Number(exercises.find((exercise) => exercise.id === b)?.active !== false)
    if (aActive !== bActive) return bActive - aActive

    const countDifference = (logCounts.get(b) ?? 0) - (logCounts.get(a) ?? 0)
    if (countDifference !== 0) return countDifference

    return a.localeCompare(b)
  })[0]
}

export function createCanonicalExerciseIdMap(
  exercises: Exercise[],
  templates: WorkoutTemplate[],
  sessions: WorkoutSession[]
) {
  const grouped = new Map<string, Set<string>>()

  for (const exercise of exercises) {
    const normalized = normalizeExerciseName(exercise.name)
    if (!normalized) continue
    grouped.set(normalized, (grouped.get(normalized) ?? new Set()).add(exercise.id))
  }

  for (const session of sessions) {
    for (const log of session.exerciseLogs) {
      const normalized = normalizeExerciseIdOrName(exercises, log.exerciseId)
      if (!normalized) continue
      grouped.set(normalized, (grouped.get(normalized) ?? new Set()).add(log.exerciseId))
    }
  }

  const aliases = new Map<string, string>()
  for (const ids of grouped.values()) {
    const values = [...ids]
    if (values.length <= 1) continue
    const canonicalId = pickCanonicalId(values, exercises, templates, sessions)
    for (const id of values) aliases.set(id, canonicalId)
  }

  return aliases
}

export function canonicalizeSessionExercises(
  sessions: WorkoutSession[],
  canonicalIds: Map<string, string>
) {
  if (canonicalIds.size === 0) return sessions

  return sessions.map((session) => ({
    ...session,
    exerciseLogs: session.exerciseLogs.map((log) => {
      const canonicalId = canonicalIds.get(log.exerciseId)
      return canonicalId ? { ...log, exerciseId: canonicalId } : log
    })
  }))
}

export function findExerciseDuplicateGroups(
  exercises: Exercise[],
  templates: WorkoutTemplate[],
  sessions: WorkoutSession[]
): ExerciseDuplicateGroup[] {
  const grouped = new Map<string, Set<string>>()

  for (const exercise of exercises) {
    const normalized = normalizeExerciseName(exercise.name)
    if (!normalized) continue
    grouped.set(normalized, (grouped.get(normalized) ?? new Set()).add(exercise.id))
  }

  for (const session of sessions) {
    for (const log of session.exerciseLogs) {
      const normalized = normalizeExerciseIdOrName(exercises, log.exerciseId)
      if (!normalized) continue
      grouped.set(normalized, (grouped.get(normalized) ?? new Set()).add(log.exerciseId))
    }
  }

  return [...grouped.entries()].flatMap(([normalizedName, ids]) => {
    const values = [...ids]
    if (values.length <= 1) return []

    const canonicalId = pickCanonicalId(values, exercises, templates, sessions)
    const duplicateIds = values.filter((id) => id !== canonicalId)
    const affectedSessions = new Set<string>()
    let affectedLogCount = 0

    for (const session of sessions) {
      for (const log of session.exerciseLogs) {
        if (!duplicateIds.includes(log.exerciseId)) continue
        affectedSessions.add(session.id)
        affectedLogCount += 1
      }
    }

    if (affectedLogCount === 0) return []

    return [{
      normalizedName,
      canonicalId,
      canonicalName: exerciseNameById(exercises, canonicalId),
      duplicateIds,
      duplicateNames: duplicateIds.map((id) => exerciseNameById(exercises, id)),
      affectedSessionCount: affectedSessions.size,
      affectedLogCount
    }]
  }).sort((a, b) => b.affectedLogCount - a.affectedLogCount)
}

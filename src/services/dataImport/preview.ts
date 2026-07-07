import type { WorkoutSession } from '../../types'
import type { ImportPayload, ImportPreview } from './types'

function sessionSignature(session: WorkoutSession) {
  const day = session.startedAt.slice(0, 10)
  const exercises = session.exerciseLogs
    .map((log) => {
      const sets = log.sets
        .map((set) => `${set.setNumber}:${set.reps}:${set.weightKg}:${set.completed}`)
        .sort()
        .join('|')
      return `${log.exerciseId}[${sets}]`
    })
    .sort()
    .join(';')
  return `${day}:${session.dayOfWeek}:${exercises}`
}

export function createImportPreview(
  payload: ImportPayload,
  existingSessions: WorkoutSession[]
): ImportPreview {
  const existingIds = new Set(existingSessions.map((session) => session.id))
  const existingSignatures = new Set(existingSessions.map(sessionSignature))
  const seenIds = new Set<string>()
  const seenSignatures = new Set<string>()
  const duplicateSessionIds: string[] = []
  const sessionsToImport: WorkoutSession[] = []

  for (const session of payload.sessions) {
    const signature = sessionSignature(session)
    const duplicate =
      existingIds.has(session.id) ||
      existingSignatures.has(signature) ||
      seenIds.has(session.id) ||
      seenSignatures.has(signature)

    if (duplicate) duplicateSessionIds.push(session.id)
    else sessionsToImport.push(session)

    seenIds.add(session.id)
    seenSignatures.add(signature)
  }

  return {
    ...payload,
    sessionCount: payload.sessions.length,
    exerciseCount: new Set([
      ...payload.exercises.map((exercise) => exercise.id),
      ...payload.sessions.flatMap((session) =>
        session.exerciseLogs.map((log) => log.exerciseId)
      )
    ]).size,
    setCount: payload.sessions.reduce(
      (total, session) =>
        total + session.exerciseLogs.reduce((sum, log) => sum + log.sets.length, 0),
      0
    ),
    duplicateSessionIds,
    sessionsToImport,
    hasPossibleDuplicates: duplicateSessionIds.length > 0
  }
}

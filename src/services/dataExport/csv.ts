import type { Exercise, WorkoutSession, WorkoutTemplate } from '../../types'
import { dayNames, formatRestSeconds, getSessionDate, getSessionDateObject } from '../../utils/workout'
import { toLocalDateKey } from '../../utils/date'

export const CSV_COLUMNS = [
  'session_id',
  'fecha',
  'dia',
  'exercise_id',
  'ejercicio',
  'objetivo',
  'descanso',
  'peso_trabajo',
  'serie',
  'reps',
  'peso',
  'hecha',
  'volumen',
  'nota'
] as const

function escapeCsv(value: unknown) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function sessionsToCsv(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  templates: WorkoutTemplate[]
) {
  const rows: unknown[][] = [[...CSV_COLUMNS]]

  for (const session of sessions) {
    const template = templates.find((item) => item.id === session.templateId)
    for (const log of session.exerciseLogs) {
      const exercise = exercises.find((item) => item.id === log.exerciseId)
      const templateExercise = template?.exercises.find(
        (item) => item.exerciseId === log.exerciseId
      )
      const objective = templateExercise
        ? `${templateExercise.targetReps}x${templateExercise.targetSets}`
        : ''
      const note = log.notes ?? session.notes ?? templateExercise?.notes ?? ''

      for (const set of log.sets) {
        const setVolume = set.completed ? set.reps * set.weightKg : 0
        rows.push([
          session.id,
          toLocalDateKey(getSessionDate(session)),
          dayNames[getSessionDateObject(session).getDay()],
          log.exerciseId,
          exercise?.name ?? log.exerciseId,
          objective,
          templateExercise?.restSeconds
            ? formatRestSeconds(templateExercise.restSeconds)
            : '',
          log.workingWeightKg ?? set.weightKg,
          set.setNumber,
          set.reps,
          set.weightKg,
          set.completed,
          setVolume,
          note
        ])
      }
    }
  }

  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`
}

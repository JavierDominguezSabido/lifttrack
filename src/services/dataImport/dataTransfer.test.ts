import { describe, expect, it } from 'vitest'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../../types'
import { createBackup } from '../dataExport/backup'
import { sessionsToCsv } from '../dataExport/csv'
import { parseWorkoutCsv } from './csv'
import { parseWorkoutBackup } from './json'
import { createImportPreview } from './preview'

const exercise: Exercise = {
  id: 'press-banca',
  name: 'Press banca',
  muscleGroup: 'Pecho',
  active: true
}

const session: WorkoutSession = {
  id: 'session-1',
  templateId: 'lunes',
  name: 'Lunes',
  dayOfWeek: 1,
  startedAt: '2026-07-06T18:00:00.000Z',
  completedAt: '2026-07-06T19:00:00.000Z',
  exerciseLogs: [{
    id: 'log-1',
    sessionId: 'session-1',
    exerciseId: exercise.id,
    order: 1,
    workingWeightKg: 65,
    notes: 'Controlar, pausa',
    sets: [
      {
        id: 'set-1',
        exerciseLogId: 'log-1',
        setNumber: 1,
        reps: 8,
        weightKg: 65,
        completed: true
      },
      {
        id: 'set-2',
        exerciseLogId: 'log-1',
        setNumber: 2,
        reps: 7,
        weightKg: 65,
        completed: true
      }
    ]
  }]
}

const template: WorkoutTemplate = {
  id: 'lunes',
  name: 'Lunes',
  dayOfWeek: 1,
  exercises: [{
    id: 'lunes-press',
    templateId: 'lunes',
    exerciseId: exercise.id,
    order: 1,
    targetSets: 4,
    targetReps: '8',
    restSeconds: 150
  }]
}

describe('transferencia de datos', () => {
  it('exporta e importa una sesión CSV con una fila por serie', () => {
    const csv = sessionsToCsv([session], [exercise], [template])
    const parsed = parseWorkoutCsv(csv, 'entrenamientos.csv')

    expect(parsed.errors).toEqual([])
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.sessions[0].exerciseLogs[0].sets).toHaveLength(2)
    expect(csv).toContain('8x4')
    expect(csv).toContain('2:30')
    expect(csv).toContain('"Controlar, pausa"')
  })

  it('detecta sesiones duplicadas y las excluye de la importación', () => {
    const payload = parseWorkoutCsv(
      sessionsToCsv([session], [exercise], [template]),
      'entrenamientos.csv'
    )
    const preview = createImportPreview(payload, [session])

    expect(preview.hasPossibleDuplicates).toBe(true)
    expect(preview.sessionsToImport).toHaveLength(0)
  })

  it('valida una copia JSON generada por LiftTrack', () => {
    const backup = createBackup([session], [exercise], 'local')
    const parsed = parseWorkoutBackup(JSON.stringify(backup), 'backup.json')

    expect(parsed.errors).toEqual([])
    expect(parsed.sessions[0]).toEqual(session)
    expect(parsed.exercises[0]).toEqual(exercise)
  })
})

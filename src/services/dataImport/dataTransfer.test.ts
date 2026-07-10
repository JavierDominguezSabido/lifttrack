import { describe, expect, it } from 'vitest'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../../types'
import { createBackup } from '../dataExport/backup'
import { sessionsToCsv } from '../dataExport/csv'
import { parseWorkoutCsv } from './csv'
import { parseWorkoutBackup } from './json'
import { createImportPreview } from './preview'
import { rebuildImportRelationships } from './relationships'

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

  it('acumula todas las filas de un mismo ejercicio CSV como series ordenadas', () => {
    const csv = [
      'session_id,fecha,dia,exercise_id,ejercicio,objetivo,descanso,peso_trabajo,serie,reps,peso,hecha,volumen,nota',
      'hist-2026-07-06-lunes,2026-07-06,Lunes,press-banca,Press banca,8x4,2:30,65,1,8,65,true,520,',
      'hist-2026-07-06-lunes,2026-07-06,Lunes,press-banca,Press banca,8x4,2:30,65,2,7,65,true,455,',
      'hist-2026-07-06-lunes,2026-07-06,Lunes,press-banca,Press banca,8x4,2:30,65,3,7,65,true,455,',
      'hist-2026-07-06-lunes,2026-07-06,Lunes,press-banca,Press banca,8x4,2:30,65,4,6,65,true,390,',
      'hist-2026-07-06-lunes,2026-07-06,Lunes,press-inclinado-mancuernas,Press inclinado mancuernas,12x3,2:00,17,1,12,17,true,204,',
      'hist-2026-07-06-lunes,2026-07-06,Lunes,press-inclinado-mancuernas,Press inclinado mancuernas,12x3,2:00,17,2,12,17,true,204,',
      'hist-2026-07-06-lunes,2026-07-06,Lunes,press-inclinado-mancuernas,Press inclinado mancuernas,12x3,2:00,17,3,12,17,true,204,'
    ].join('\n')

    const parsed = parseWorkoutCsv(csv, 'lunes.csv')

    expect(parsed.errors).toEqual([])
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.sessions[0].exerciseLogs).toHaveLength(2)
    expect(parsed.sessions[0].exerciseLogs[0].sets.map((set) => set.reps)).toEqual([8, 7, 7, 6])
    expect(parsed.sessions[0].exerciseLogs[0].sets.map((set) => set.setNumber)).toEqual([1, 2, 3, 4])
    expect(parsed.sessions[0].exerciseLogs[1].sets.map((set) => set.reps)).toEqual([12, 12, 12])
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
    const backup = createBackup([session], [exercise], [template], 'local')
    const parsed = parseWorkoutBackup(JSON.stringify(backup), 'backup.json')

    expect(parsed.errors).toEqual([])
    expect(parsed.sessions[0]).toEqual(session)
    expect(parsed.exercises[0]).toEqual(exercise)
    expect(parsed.templates?.[0]).toEqual(template)
  })

  it('reconstruye todas las relaciones de una rutina de 23 ejercicios y 7 días', () => {
    const exercises = Array.from({ length: 23 }, (_, index): Exercise => ({
      id: `old-exercise-${index + 1}`, name: `Ejercicio ${index + 1}`, active: true
    }))
    const expected = [6, 5, 6, 6, 0, 0, 0]
    let cursor = 0
    const templates = expected.map((count, day): WorkoutTemplate => ({
      id: `old-template-${day}`, name: `Día ${day + 1}`, dayOfWeek: day,
      exercises: Array.from({ length: count }, (_, order) => {
        const exerciseId = exercises[cursor++].id
        return { id: `${day}-${order}`, templateId: `old-template-${day}`, exerciseId, order: order + 1, targetSets: 3, targetReps: '8-12', restSeconds: 90, notes: 'Técnica' }
      })
    }))
    const existing: Exercise[] = [{ ...exercises[0], id: 'existing-uuid' }]
    const historical: WorkoutSession = {
      ...session, templateId: templates[0].id,
      exerciseLogs: [{ ...session.exerciseLogs[0], exerciseId: exercises[0].id }]
    }
    const payload = parseWorkoutBackup(JSON.stringify(createBackup([historical], exercises, templates, 'local')), 'regression.json')
    const rebuilt = rebuildImportRelationships(payload, existing, [])

    expect(rebuilt.errors).toEqual([])
    expect(rebuilt.templates?.map((item) => item.exercises.length)).toEqual(expected)
    const ids = new Set([...existing, ...rebuilt.exercises].map((item) => item.id))
    expect(rebuilt.templates?.flatMap((item) => item.exercises).every((item) => ids.has(item.exerciseId))).toBe(true)
    expect(rebuilt.templates?.[0].exercises[0].exerciseId).toBe('existing-uuid')
    expect(rebuilt.sessions[0].exerciseLogs[0].exerciseId).toBe('existing-uuid')
    expect(rebuilt.sessions[0].exerciseLogs.flatMap((log) => log.sets).every((set) => rebuilt.sessions[0].exerciseLogs.some((log) => log.id === set.exerciseLogId))).toBe(true)
  })

  it('bloquea referencias huérfanas antes de importar', () => {
    const broken = rebuildImportRelationships({
      source: 'json', filename: 'roto.json', exercises: [], sessions: [], errors: [],
      templates: [{ ...template, exercises: [{ ...template.exercises[0], exerciseId: 'missing' }] }]
    }, [], [])
    expect(broken.errors[0]).toContain('ejercicio inexistente')
  })
})

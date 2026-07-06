import { describe, expect, it } from 'vitest'
import { initialSessions, templates } from '../data/mockData'
import type { DraftExerciseLog } from '../types'
import {
  applyWorkingWeight,
  createDraftFromSession,
  createExerciseLogs,
  createWorkoutSession,
  normalizeRepsInput,
  setAllSetsCompleted,
  validateWorkoutDraft,
  normalizeWeight,
  updateWorkoutSession
} from './workoutDraft'
import { getLastExercisePerformanceFromSessions } from './workoutHistory'
import { getProgressionSuggestion } from './workout'

const mondayTemplate = templates.find((template) => template.id === 'lunes')!

describe('historial y borrador de entrenamiento', () => {
  it('recupera el peso de la sesión completada más reciente', () => {
    const performance = getLastExercisePerformanceFromSessions(
      initialSessions,
      'press-banca'
    )

    expect(performance?.weightKg).toBe(65)
    expect(performance?.reps).toEqual([8, 7, 7, 6])
  })

  it('precarga el último peso en todas las series del ejercicio', () => {
    const [benchPress] = createExerciseLogs(mondayTemplate, initialSessions)

    expect(benchPress.workingWeightKg).toBe(65)
    expect(benchPress.sets).toHaveLength(4)
    expect(benchPress.sets.every((set) => set.weightKg === 65)).toBe(true)
  })

  it('sugiere subir solo si se completaron todas las series objetivo', () => {
    const bench = mondayTemplate.exercises[0]
    const incline = mondayTemplate.exercises[1]
    const benchPerformance = getLastExercisePerformanceFromSessions(initialSessions, bench.exerciseId)!
    const inclinePerformance = getLastExercisePerformanceFromSessions(initialSessions, incline.exerciseId)!

    expect(getProgressionSuggestion(benchPerformance, bench)).toBe('repetir peso')
    expect(getProgressionSuggestion(inclinePerformance, incline)).toBe('subir peso')
  })

  it('prioriza una sesión local frente al registro inicial', () => {
    const localSession = createWorkoutSession({
      template: mondayTemplate,
      logs: [{
        id: 'local-log',
        sessionId: 'draft',
        exerciseId: 'press-banca',
        order: 1,
        workingWeightKg: 80,
        sets: [{
          id: 'local-set',
          exerciseLogId: 'local-log',
          setNumber: 1,
          reps: '6',
          weightKg: 80,
          completed: true
        }]
      }],
      startedAt: '2020-01-01T10:00:00.000Z',
      completedAt: new Date('2020-01-01T11:00:00.000Z'),
      createId: () => 'local-session'
    })
    const performance = getLastExercisePerformanceFromSessions(
      [...initialSessions, localSession],
      'press-banca'
    )

    expect(performance?.sessionId).toBe('local-session')
    expect(performance?.weightKg).toBe(80)
    expect(performance?.reps).toEqual([6])
  })
})

describe('peso de trabajo', () => {
  const log: DraftExerciseLog = {
    id: 'draft-log',
    sessionId: 'draft',
    exerciseId: 'press-banca',
    order: 1,
    workingWeightKg: 70,
    sets: [
      {
        id: 'draft-set-1',
        exerciseLogId: 'draft-log',
        setNumber: 1,
        reps: '8',
        weightKg: 70,
        completed: true
      },
      {
        id: 'draft-set-2',
        exerciseLogId: 'draft-log',
        setNumber: 2,
        reps: '7',
        weightKg: 70,
        completed: true
      }
    ]
  }

  it.each([
    [-2.5, 67.5],
    [-1.25, 68.75],
    [1.25, 71.25],
    [2.5, 72.5]
  ])('aplica el ajuste de %s kg a todas las series', (step, expected) => {
    const updated = applyWorkingWeight(log, log.workingWeightKg! + step)

    expect(updated.workingWeightKg).toBe(expected)
    expect(updated.sets.every((set) => set.weightKg === expected)).toBe(true)
  })

  it('redondea a dos decimales y nunca permite pesos negativos o no válidos', () => {
    expect(normalizeWeight(71.249999999)).toBe(71.25)
    expect(normalizeWeight(-2.5)).toBe(0)
    expect(normalizeWeight(Number.NaN)).toBe(0)
  })

  it('mantiene vacío el input y elimina ceros a la izquierda', () => {
    expect(normalizeRepsInput('')).toBe('')
    expect(normalizeRepsInput('07')).toBe('7')
    expect(normalizeRepsInput('0008')).toBe('8')
  })

  it('exige reps válidas solo cuando corresponde', () => {
    const emptyCompleted = {
      ...log,
      sets: [{ ...log.sets[0], reps: '', completed: true }]
    }
    const emptyPending = {
      ...log,
      sets: [{ ...log.sets[0], reps: '', completed: false }]
    }

    expect(validateWorkoutDraft([emptyCompleted])).toHaveLength(1)
    expect(validateWorkoutDraft([emptyPending])).toHaveLength(0)
  })

  it('marca y desmarca todas sin modificar reps, peso ni cantidad de series', () => {
    const marked = setAllSetsCompleted(log, true)
    const unmarked = setAllSetsCompleted(marked, false)

    expect(marked.sets.every((set) => set.completed)).toBe(true)
    expect(unmarked.sets.every((set) => !set.completed)).toBe(true)
    expect(marked.sets.map((set) => ({ ...set, completed: false }))).toEqual(
      log.sets.map((set) => ({ ...set, completed: false }))
    )
    expect(marked.sets).toHaveLength(log.sets.length)
    expect(marked.workingWeightKg).toBe(log.workingWeightKg)
  })

  it('guarda cada serie con sus repeticiones, peso heredado e IDs únicos', () => {
    let nextId = 0
    const session = createWorkoutSession({
      template: mondayTemplate,
      logs: [applyWorkingWeight(log, 72.5)],
      startedAt: '2026-07-06T16:00:00.000Z',
      completedAt: new Date('2026-07-06T17:00:00.000Z'),
      createId: () => `id-${++nextId}`
    })

    expect(session.durationMinutes).toBe(60)
    expect(session.dayOfWeek).toBe(1)
    expect(session.volumeKg).toBe(1087.5)
    expect(session.exerciseLogs[0].sessionId).toBe(session.id)
    expect(session.exerciseLogs[0].sets.map((set) => set.reps)).toEqual([8, 7])
    expect(session.exerciseLogs[0].sets.map((set) => set.weightKg)).toEqual([72.5, 72.5])
    expect(new Set(session.exerciseLogs[0].sets.map((set) => set.id)).size).toBe(2)
    expect(
      session.exerciseLogs[0].sets.every(
        (set) => set.exerciseLogId === session.exerciseLogs[0].id
      )
    ).toBe(true)
  })

  it('edita peso, reps y estado sin generar NaN', () => {
    const original = createWorkoutSession({
      template: mondayTemplate,
      logs: [log],
      startedAt: '2026-07-06T16:00:00.000Z',
      completedAt: new Date('2026-07-06T17:00:00.000Z'),
      createId: () => 'existing-id'
    })
    const [draft] = createDraftFromSession(original)
    const edited = applyWorkingWeight({
      ...draft,
      sets: draft.sets.map((set, index) => ({
        ...set,
        reps: index === 0 ? '10' : set.reps,
        completed: index !== 0
      }))
    }, 75)
    const updated = updateWorkoutSession(original, [edited])

    expect(updated.id).toBe(original.id)
    expect(updated.exerciseLogs[0].workingWeightKg).toBe(75)
    expect(updated.exerciseLogs[0].sets.map((set) => set.reps)).toEqual([10, 7])
    expect(updated.exerciseLogs[0].sets.map((set) => set.completed)).toEqual([false, true])
    expect(updated.exerciseLogs[0].sets.every((set) => Number.isFinite(set.reps))).toBe(true)
    expect(updated.volumeKg).toBe(525)
  })
})

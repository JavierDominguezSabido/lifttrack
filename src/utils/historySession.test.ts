import { describe, expect, it } from 'vitest'
import type { WorkoutSession, WorkoutTemplate } from '../types'
import { getSessionRoutineIdentity, updateSessionRoutineDay } from './historySession'

const tuesdayTemplate: WorkoutTemplate = {
  id: 'pull', name: 'Tirón', dayOfWeek: 2, exercises: []
}

function historicalSession(dayOfWeek: number): WorkoutSession {
  return {
    id: 'session', templateId: 'pull', name: 'Tirón', dayOfWeek,
    startedAt: '2026-07-28T22:00:00.000Z',
    completedAt: '2026-07-29T00:15:00.000Z',
    exerciseLogs: []
  }
}

describe('identidad de rutina de una sesión histórica', () => {
  it('mantiene Martes aunque la fecha registrada sea miércoles', () => {
    expect(getSessionRoutineIdentity(historicalSession(2), [tuesdayTemplate], 3)).toMatchObject({
      dayOfWeek: 2,
      dayIsExplicit: true,
      template: tuesdayTemplate
    })
  })

  it('usa la plantilla si dayOfWeek no es válido', () => {
    expect(getSessionRoutineIdentity(historicalSession(9), [tuesdayTemplate], 3).dayOfWeek).toBe(2)
  })

  it('usa la fecha registrada como fallback no confirmado', () => {
    const session = { ...historicalSession(9), templateId: undefined }
    expect(getSessionRoutineIdentity(session, [], 3)).toEqual({
      dayOfWeek: 3,
      dayIsExplicit: false,
      template: undefined
    })
  })

  it('corrige el día sin modificar ejercicios ni series', () => {
    const original = historicalSession(3)
    original.exerciseLogs = [{
      id: 'log', sessionId: original.id, exerciseId: 'dominadas', order: 1,
      sets: [{ id: 'set', exerciseLogId: 'log', setNumber: 1, reps: 8, weightKg: 0, completed: true }]
    }]
    const updated = updateSessionRoutineDay(original, 2)
    expect(updated.dayOfWeek).toBe(2)
    expect(updated.exerciseLogs).toBe(original.exerciseLogs)
    expect(updated.startedAt).toBe(original.startedAt)
    expect(updated.completedAt).toBe(original.completedAt)
  })
})

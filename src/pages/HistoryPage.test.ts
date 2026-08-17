import { describe, expect, it } from 'vitest'
import type { WorkoutSession } from '../types'
import { filterSessions, getHistorySummary, getProgressEntryWeight } from './HistoryPage'

function session(id: string, date: string, volumeKg: number): WorkoutSession {
  return {
    id,
    name: id,
    dayOfWeek: new Date(date).getDay(),
    startedAt: date,
    completedAt: date,
    volumeKg,
    exerciseLogs: []
  }
}

describe('resumen compacto del historial', () => {
  it('mantiene todas las sesiones y suma el volumen existente', () => {
    const sessions = [
      session('latest', '2026-08-17T18:00:00.000Z', 4000),
      session('previous', '2026-08-10T18:00:00.000Z', 3500)
    ]

    expect(getHistorySummary(sessions)).toMatchObject({
      sessionCount: 2,
      activeWeeks: 2,
      streakWeeks: 2,
      totalVolume: 7500,
      latestSession: sessions[0]
    })
  })

  it('corta la racha cuando hay una semana sin entrenamientos', () => {
    expect(getHistorySummary([
      session('latest', '2026-08-17T18:00:00.000Z', 1000),
      session('old', '2026-08-03T18:00:00.000Z', 1000)
    ]).streakWeeks).toBe(1)
  })

  it('mantiene el filtrado por día y búsqueda de ejercicio', () => {
    const saved = session('bench', '2026-08-17T18:00:00.000Z', 1000)
    saved.exerciseLogs = [{
      id: 'log-1', sessionId: saved.id, exerciseId: 'press-banca', order: 0,
      workingWeightKg: 80,
      sets: [{ id: 'set-1', exerciseLogId: 'log-1', setNumber: 1, reps: 8, weightKg: 80, completed: true }]
    }]

    expect(filterSessions({
      sessions: [saved],
      exercises: [{ id: 'press-banca', name: 'Press banca', active: true }],
      canonicalExerciseIds: new Map(),
      filterExerciseId: 'all',
      filterDay: String(new Date(saved.startedAt).getDay()),
      rangeFilter: 'all',
      search: 'banca'
    })).toEqual([saved])
  })

  it('entrega a la gráfica el peso de trabajo de la sesión', () => {
    const saved = session('chart', '2026-08-17T18:00:00.000Z', 640)
    const log = {
      id: 'log-chart', sessionId: saved.id, exerciseId: 'press-banca', order: 0,
      workingWeightKg: 80,
      sets: [{ id: 'set-chart', exerciseLogId: 'log-chart', setNumber: 1, reps: 8, weightKg: 75, completed: true }]
    }
    expect(getProgressEntryWeight({ session: saved, log })).toBe(80)
  })
})

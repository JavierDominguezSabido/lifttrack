import { describe, expect, it } from 'vitest'
import type { WorkoutSession } from '../types'
import {
  dayNames,
  getSessionDate,
  getSessionDateObject,
  getWeekKey,
  parseLocalDate,
  toLocalDateKey
} from './date'

process.env.TZ = 'Europe/Madrid'

function session(overrides: Partial<WorkoutSession>): WorkoutSession {
  return {
    id: 'session-1',
    templateId: 'template-1',
    name: 'Jueves',
    dayOfWeek: 4,
    startedAt: '2026-07-08T22:30:00.000Z',
    completedAt: '2026-07-09T00:10:00.000Z',
    exerciseLogs: [],
    ...overrides
  }
}

describe('local date helpers', () => {
  it('keeps plain CSV dates on the intended local day', () => {
    const wednesday = parseLocalDate('2026-07-08')
    const thursday = parseLocalDate('2026-07-09')

    expect(wednesday).not.toBeNull()
    expect(thursday).not.toBeNull()
    expect(toLocalDateKey(wednesday!)).toBe('2026-07-08')
    expect(dayNames[wednesday!.getDay()]).toBe('Miércoles')
    expect(toLocalDateKey(thursday!)).toBe('2026-07-09')
    expect(dayNames[thursday!.getDay()]).toBe('Jueves')
  })

  it('uses completedAt as the visible day for sessions crossing midnight', () => {
    const workout = session({
      startedAt: '2026-07-08T21:50:00.000Z',
      completedAt: '2026-07-09T00:05:00.000Z'
    })

    expect(getSessionDate(workout)).toBe('2026-07-09T00:05:00.000Z')
    expect(toLocalDateKey(getSessionDate(workout))).toBe('2026-07-09')
    expect(dayNames[getSessionDateObject(workout).getDay()]).toBe('Jueves')
  })

  it('groups weeks from Monday to Sunday using the session date', () => {
    expect(getWeekKey(parseLocalDate('2026-07-08')!)).toBe('2026-07-06')
    expect(getWeekKey(parseLocalDate('2026-07-09')!)).toBe('2026-07-06')
    expect(getWeekKey(parseLocalDate('2026-07-12')!)).toBe('2026-07-06')
    expect(getWeekKey(parseLocalDate('2026-07-13')!)).toBe('2026-07-13')
  })
})

import { describe, expect, it } from 'vitest'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../types'
import {
  findExerciseDuplicateGroups,
  normalizeExerciseName
} from './exerciseIdentity'

describe('exercise identity', () => {
  it('normalizes equivalent exercise names', () => {
    const variants = [
      'Fondos en paralelas pecho bajo',
      'Fondos paralelas pecho bajo',
      'fondos-paralelas-pecho-bajo',
      'fondos-en-paralelas-pecho-bajo'
    ]

    expect(new Set(variants.map(normalizeExerciseName)).size).toBe(1)
  })

  it('prefers routine exercises as canonical duplicates', () => {
    const exercises: Exercise[] = [
      { id: 'fondos-paralelas-pecho-bajo', name: 'Fondos en paralelas pecho bajo', active: true },
      { id: 'fondos-en-paralelas-pecho-bajo', name: 'Fondos paralelas pecho bajo', active: true }
    ]
    const templates: WorkoutTemplate[] = [{
      id: 'lunes',
      name: 'Lunes',
      dayOfWeek: 1,
      exercises: [{
        id: 'lunes-fondos',
        templateId: 'lunes',
        exerciseId: 'fondos-paralelas-pecho-bajo',
        order: 1,
        targetSets: 3,
        targetReps: '8'
      }]
    }]
    const sessions: WorkoutSession[] = [{
      id: 'session-1',
      name: 'Lunes',
      dayOfWeek: 1,
      startedAt: '2026-07-06T10:00:00.000Z',
      completedAt: '2026-07-06T11:00:00.000Z',
      exerciseLogs: [{
        id: 'log-1',
        sessionId: 'session-1',
        exerciseId: 'fondos-en-paralelas-pecho-bajo',
        order: 1,
        sets: [{
          id: 'set-1',
          exerciseLogId: 'log-1',
          setNumber: 1,
          reps: 8,
          weightKg: 10,
          completed: true
        }]
      }]
    }]

    expect(findExerciseDuplicateGroups(exercises, templates, sessions)).toMatchObject([{
      canonicalId: 'fondos-paralelas-pecho-bajo',
      duplicateIds: ['fondos-en-paralelas-pecho-bajo'],
      affectedLogCount: 1
    }])
  })
})

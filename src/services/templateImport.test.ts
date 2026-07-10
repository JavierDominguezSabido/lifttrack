import { describe, expect, it } from 'vitest'
import type { WorkoutTemplate } from '../types'
import { mergeWeeklyTemplates, normalizeWeeklyTemplates } from './templateImport'

const template = (id: string, dayOfWeek: number, count: number): WorkoutTemplate => ({
  id, name: id, dayOfWeek, exercises: Array.from({ length: count }, (_, index) => ({
    id: `${id}-${index}`, templateId: id, exerciseId: `exercise-${id}-${index}`,
    order: index + 1, targetSets: 3, targetReps: '8', restSeconds: 90
  }))
})

describe('normalización de la rutina semanal', () => {
  it('sustituye una plantilla vacía por la importada del mismo día', () => {
    expect(normalizeWeeklyTemplates([template('lunes', 1, 0), template('empuje', 1, 6)]).templates)
      .toEqual([template('empuje', 1, 6)])
  })
  it('normaliza una cuenta vacía y siete días vacíos', () => {
    expect(normalizeWeeklyTemplates([]).templates).toEqual([])
    expect(normalizeWeeklyTemplates(Array.from({ length: 7 }, (_, day) => template(`day-${day}`, day, 0))).templates).toHaveLength(7)
  })
  it('fusiona sin dejar dos plantillas para el mismo día', () => {
    const result = mergeWeeklyTemplates([template('actual', 1, 2)], [template('nueva', 1, 3)])
    expect(result.templates).toHaveLength(1)
    expect(result.templates[0].exercises).toHaveLength(5)
    expect(result.conflicts).toHaveLength(1)
  })
  it('detecta dos plantillas pobladas y conserva una sola de forma explícita', () => {
    const result = normalizeWeeklyTemplates([template('a', 1, 2), template('b', 1, 3)])
    expect(result.templates).toHaveLength(1)
    expect(result.templates[0].id).toBe('b')
    expect(result.conflicts).toHaveLength(1)
  })
})

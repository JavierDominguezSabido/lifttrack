import { describe, expect, it } from 'vitest'
import { resolvePendingGuidedIndex } from './guidedWorkout'

describe('posición del modo guiado', () => {
  it('avanza una serie completada desde Vista completa', () => {
    expect(resolvePendingGuidedIndex([true, true, false, false], 1)).toBe(2)
  })

  it('salta varias series completadas desde Vista completa', () => {
    expect(resolvePendingGuidedIndex([true, true, true, false], 1)).toBe(3)
  })

  it('pasa al siguiente ejercicio pendiente al completar el actual', () => {
    expect(resolvePendingGuidedIndex([true, true, true, true, false, false], 2)).toBe(4)
  })

  it('devuelve el estado final cuando todo está completado', () => {
    expect(resolvePendingGuidedIndex([true, true, true, true], 2)).toBe(-1)
  })

  it('mantiene una posición actual que todavía está pendiente', () => {
    expect(resolvePendingGuidedIndex([true, false, true], 1)).toBe(1)
  })

  it('permite revisar una serie completada tras navegar con Anterior', () => {
    expect(resolvePendingGuidedIndex([true, true, false], 1, true)).toBe(1)
  })

  it('corrige una posición restaurada que apunta a una serie completada', () => {
    const completed = [true, true, false, false]
    const weights = [80, 82.5, 85, 87.5]
    const reps = ['10', '9', '8', '8']

    expect(resolvePendingGuidedIndex(completed, 0)).toBe(2)
    expect(weights).toEqual([80, 82.5, 85, 87.5])
    expect(reps).toEqual(['10', '9', '8', '8'])
  })

  it('vuelve a una pendiente anterior si no quedan pendientes posteriores', () => {
    expect(resolvePendingGuidedIndex([false, true, true], 2)).toBe(0)
  })
})

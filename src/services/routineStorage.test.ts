import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoredTemplates, storeTemplates } from './routineStorage'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) }
  }
}

describe('routineStorage multiusuario', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))

  it('mantiene rutinas distintas para dos cuentas y modo local', () => {
    const routineA = getStoredTemplates('account-a')
    routineA[0].exercises.push({
      id: 'item-a', templateId: routineA[0].id, exerciseId: 'press-banca',
      order: 1, targetSets: 4, targetReps: '8', restSeconds: 120
    })
    storeTemplates('account-a', routineA)

    expect(getStoredTemplates('account-b').every((day) => day.exercises.length === 0)).toBe(true)
    expect(getStoredTemplates('local').every((day) => day.exercises.length === 0)).toBe(true)
    expect(getStoredTemplates('account-a')[0].exercises).toHaveLength(1)
  })
})

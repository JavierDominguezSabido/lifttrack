import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialSessions } from '../data/mockData'
import { readSessionCache, writeSessionCache } from './workoutSessionCache'

describe('caché local de historial', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('permite usar inmediatamente los últimos pesos conocidos', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      }
    })

    writeSessionCache('user-1', initialSessions, '2026-08-12T10:00:00.000Z')

    expect(readSessionCache('user-1')).toEqual({
      updatedAt: '2026-08-12T10:00:00.000Z',
      sessions: initialSessions
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  selectNewestDraft,
  shouldRefreshForLifecycleEvent,
  shouldShowInitialWorkoutLoader
} from './workoutLifecycle'

describe('reanudacion no bloqueante del entrenamiento', () => {
  it('mantiene visible el borrador durante hidden, TOKEN_REFRESHED, visible y focus', () => {
    const state = {
      viewMode: 'guided',
      guidedSetId: 'set-2',
      completedSets: ['set-1'],
      hasLocalDraft: true
    }

    expect(shouldRefreshForLifecycleEvent('visibilitychange', 'hidden')).toBe(false)
    // TOKEN_REFRESHED para el mismo usuario conserva la identidad en AuthProvider.
    expect(shouldRefreshForLifecycleEvent('visibilitychange', 'visible')).toBe(true)
    expect(shouldRefreshForLifecycleEvent('focus', 'visible')).toBe(true)
    expect(shouldShowInitialWorkoutLoader({
      initialLoading: false,
      sessionCount: 0,
      templateCount: 0,
      hasLocalDraft: state.hasLocalDraft
    })).toBe(false)
    expect(state).toMatchObject({ viewMode: 'guided', guidedSetId: 'set-2' })
  })

  it('no bloquea al regresar sin conexion', () => {
    expect(shouldShowInitialWorkoutLoader({
      initialLoading: false, sessionCount: 0, templateCount: 0, hasLocalDraft: true
    })).toBe(false)
  })

  it('muestra el borrador aunque Supabase no haya respondido', () => {
    expect(shouldShowInitialWorkoutLoader({
      initialLoading: true, sessionCount: 0, templateCount: 0, hasLocalDraft: true
    })).toBe(false)
  })

  it('permite el cargador en el primer arranque sin datos locales', () => {
    expect(shouldShowInitialWorkoutLoader({
      initialLoading: true, sessionCount: 0, templateCount: 0, hasLocalDraft: false
    })).toBe(true)
  })

  it('elige el borrador local cuando es mas reciente', () => {
    const local = { updatedAt: '2026-07-11T12:00:00.000Z', value: 'local' }
    const remote = { updatedAt: '2026-07-11T11:00:00.000Z', value: 'remote' }
    expect(selectNewestDraft(local, remote)).toEqual({ source: 'local', draft: local })
  })

  it('elige el borrador remoto cuando es mas reciente', () => {
    const local = { updatedAt: '2026-07-11T11:00:00.000Z', value: 'local' }
    const remote = { updatedAt: '2026-07-11T12:00:00.000Z', value: 'remote' }
    expect(selectNewestDraft(local, remote)).toEqual({ source: 'remote', draft: remote })
  })

  it('no reutiliza el borrador de otro usuario', () => {
    const localKeys = ['lifttrack.workoutDraft.user:ana.day-1']
    expect(localKeys.some((key) => key.startsWith('lifttrack.workoutDraft.user:luis.'))).toBe(false)
  })
})

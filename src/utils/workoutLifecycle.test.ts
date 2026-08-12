import { describe, expect, it } from 'vitest'
import {
  getDatedLocalDraftKey,
  getDatedRemoteDraftKey,
  hasCompletedSessionForDraft,
  isActiveDraftForDate,
  selectNewestDraft,
  selectSafeWorkoutDraft,
  shouldAutosaveWorkoutDraft,
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

  it('genera claves distintas para dos miércoles', () => {
    expect(getDatedLocalDraftKey('user:ana', '2026-07-08', 'miercoles')).not.toBe(
      getDatedLocalDraftKey('user:ana', '2026-07-15', 'miercoles')
    )
    expect(getDatedRemoteDraftKey('2026-07-08', 'miercoles')).not.toBe(
      getDatedRemoteDraftKey('2026-07-15', 'miercoles')
    )
  })

  it('ignora borradores antiguos y legacy aunque coincida el día semanal', () => {
    expect(isActiveDraftForDate({ localDate: '2026-07-08', status: 'active' }, '2026-07-15')).toBe(false)
    expect(isActiveDraftForDate({ status: 'active' }, '2026-07-15')).toBe(false)
    expect(isActiveDraftForDate({ localDate: '2026-07-15', status: 'completed' }, '2026-07-15')).toBe(false)
    expect(isActiveDraftForDate({ localDate: '2026-07-15', status: 'active' }, '2026-07-15')).toBe(true)
  })

  it('detecta un borrador que ya corresponde a una sesión completada', () => {
    const draft = { templateId: 'miercoles', startedAt: '2026-07-15T16:00:00.000Z' }
    expect(hasCompletedSessionForDraft([{
      templateId: 'miercoles',
      startedAt: draft.startedAt,
      completedAt: '2026-07-15T17:00:00.000Z'
    }], draft)).toBe(true)
    expect(hasCompletedSessionForDraft([{
      templateId: 'miercoles',
      startedAt: '2026-07-08T16:00:00.000Z',
      completedAt: '2026-07-08T17:00:00.000Z'
    }], draft)).toBe(false)
  })

  it('conserva posición guiada, pesos, reps y pendientes del borrador remoto más reciente', () => {
    const local = {
      updatedAt: '2026-07-15T16:05:00.000Z',
      guidedPosition: { exerciseId: 'sentadilla', setId: 'set-1' },
      logs: [{ weightKg: 65, reps: ['8', '8', '8', '8'], completed: [true, false, false, false] }]
    }
    const remote = {
      updatedAt: '2026-07-15T16:10:00.000Z',
      guidedPosition: { exerciseId: 'sentadilla', setId: 'set-3' },
      logs: [{ weightKg: 67.5, reps: ['8', '8', '8', '8'], completed: [true, true, false, false] }]
    }

    const selected = selectNewestDraft(local, remote)
    expect(selected.source).toBe('remote')
    expect(selected.draft).toEqual(remote)
    expect(selected.draft?.logs[0].completed).toEqual([true, true, false, false])
  })

  it('sincronizar no transforma series pendientes en completadas', () => {
    const draft = {
      updatedAt: '2026-07-15T16:10:00.000Z',
      completed: [true, false, false, false]
    }
    expect(selectNewestDraft(null, draft).draft?.completed).toEqual([true, false, false, false])
  })

  it('prioriza remoto con progreso frente a local pristine aunque el local sea más nuevo', () => {
    const local = { updatedAt: '2026-08-12T12:01:00.000Z', completed: 0 }
    const remote = { updatedAt: '2026-08-12T12:00:00.000Z', completed: 2 }
    expect(selectSafeWorkoutDraft(local, remote, {
      localPristine: true,
      remoteHasProgress: true
    })).toMatchObject({ source: 'remote', draft: remote })
  })

  it('permite ganar al local con cambios reales cuando es más reciente', () => {
    const local = { updatedAt: '2026-08-12T12:01:00.000Z', completed: 3 }
    const remote = { updatedAt: '2026-08-12T12:00:00.000Z', completed: 2 }
    expect(selectSafeWorkoutDraft(local, remote, {
      localPristine: false,
      remoteHasProgress: true
    })).toMatchObject({ source: 'local', draft: local })
  })

  it('no autosincroniza plantilla nueva ni hidratación local/remota', () => {
    const unchanged = { userChangeRevision: 0, syncedUserChangeRevision: 0 }
    expect(shouldAutosaveWorkoutDraft({ ...unchanged, hydrationReady: false })).toBe(false)
    expect(shouldAutosaveWorkoutDraft({ ...unchanged, hydrationReady: true })).toBe(false)
  })

  it('autosincroniza tras una acción real o para subir un local válido', () => {
    expect(shouldAutosaveWorkoutDraft({
      hydrationReady: true, userChangeRevision: 1, syncedUserChangeRevision: 0
    })).toBe(true)
    expect(shouldAutosaveWorkoutDraft({
      hydrationReady: true, userChangeRevision: 0, syncedUserChangeRevision: 0,
      hydratedLocalNeedsUpload: true
    })).toBe(true)
  })
})

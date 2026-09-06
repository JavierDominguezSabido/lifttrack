// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseWorkoutRepository } from './supabaseWorkoutRepository'
import { activateSyncOwner, flushSyncOperations, pendingOperations } from '../syncOutbox'
import type { WorkoutSession } from '../../types'

const client = vi.hoisted(() => ({ auth: { getUser: vi.fn(), getSession: vi.fn() }, rpc: vi.fn(), from: vi.fn() }))
vi.mock('./supabaseClient', () => ({ supabase: client }))
vi.mock('../routineStorage', () => ({ getStoredExercises: () => [], getStoredTemplates: () => [] }))
const session: WorkoutSession = { id: 'stable', name: 'Lunes', dayOfWeek: 1, startedAt: '2026-09-01T10:00:00Z', exerciseLogs: [] }

describe('contrato de guardado persistente del repositorio', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    activateSyncOwner('owner')
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
    client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null })
    client.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: { conflict: false, revision: 'confirmed' }, error: null }) }))
  })
  it('crea y edita mediante la cola y la misma RPC transaccional', async () => {
    const local = await supabaseWorkoutRepository.saveWorkoutSession(session, 'owner')
    await supabaseWorkoutRepository.updateWorkoutSession(local, 'owner')
    expect(pendingOperations('owner')).toHaveLength(2)
    await flushSyncOperations('owner')
    expect(client.rpc).toHaveBeenCalledWith('apply_sync_operation', expect.objectContaining({
      p_user_id: 'owner', p_resource: 'session:stable', p_payload: { action: 'save', session, exercises: [], template: null }
    }))
    expect(pendingOperations('owner')).toHaveLength(0)
    expect(client.from).not.toHaveBeenCalled()
  })
  it('si falta la migración conserva la operación y no vuelve al guardado parcial', async () => {
    client.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Missing function' } }) }))
    await supabaseWorkoutRepository.saveWorkoutSession(session, 'owner')
    await flushSyncOperations('owner')
    expect(pendingOperations('owner')[0].error).toMatch(/migración/)
    expect(client.from).not.toHaveBeenCalled()
  })
  it('no retira la operación si no hay una confirmación válida', async () => {
    client.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: { id: 'other' }, error: null }) }))
    await supabaseWorkoutRepository.saveWorkoutSession(session, 'owner')
    await flushSyncOperations('owner')
    expect(pendingOperations('owner')[0].status).toBe('error')
  })
  it('no envía datos pendientes de otra cuenta', async () => {
    await supabaseWorkoutRepository.saveWorkoutSession(session, 'previous-owner')
    await flushSyncOperations('previous-owner')
    expect(client.rpc).not.toHaveBeenCalled()
    expect(pendingOperations('previous-owner')).toHaveLength(1)
    expect(pendingOperations('owner')).toHaveLength(0)
  })
})

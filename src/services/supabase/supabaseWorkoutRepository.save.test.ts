import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseWorkoutRepository } from './supabaseWorkoutRepository'
import type { WorkoutSession } from '../../types'

const client = vi.hoisted(() => ({ auth: { getUser: vi.fn() }, rpc: vi.fn(), from: vi.fn() }))
vi.mock('./supabaseClient', () => ({ supabase: client }))
vi.mock('../routineStorage', () => ({ getStoredExercises: () => [], getStoredTemplates: () => [] }))
const session: WorkoutSession = {
  id: 'stable', name: 'Lunes', dayOfWeek: 1, startedAt: '2026-09-01T10:00:00Z', exerciseLogs: []
}

describe('contrato de guardado atómico del repositorio', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
    client.rpc.mockResolvedValue({ data: { ...session, volumeKg: 0 }, error: null })
  })
  it('crea y edita exclusivamente mediante la misma RPC', async () => {
    await supabaseWorkoutRepository.saveWorkoutSession(session, 'owner')
    await supabaseWorkoutRepository.updateWorkoutSession(session, 'owner')
    expect(client.rpc).toHaveBeenCalledTimes(2)
    expect(client.rpc).toHaveBeenCalledWith('save_workout_session', {
      p_user_id: 'owner', p_session: session, p_exercises: [], p_template: null
    })
    expect(client.from).not.toHaveBeenCalled()
  })
  it('si falta la migración no vuelve al guardado parcial', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Missing function' } })
    await expect(supabaseWorkoutRepository.saveWorkoutSession(session)).rejects.toThrow(/servidor necesita actualizarse/)
    expect(client.from).not.toHaveBeenCalled()
  })
  it('rechaza una respuesta sin confirmación de la sesión esperada', async () => {
    client.rpc.mockResolvedValue({ data: { id: 'other' }, error: null })
    await expect(supabaseWorkoutRepository.saveWorkoutSession(session)).rejects.toThrow(/sin crear otra sesión/)
  })
  it('no envía datos de una cuenta si la autenticación ha cambiado', async () => {
    await expect(supabaseWorkoutRepository.saveWorkoutSession(session, 'previous-owner')).rejects.toThrow(/cuenta ha cambiado/)
    expect(client.rpc).not.toHaveBeenCalled()
  })
})

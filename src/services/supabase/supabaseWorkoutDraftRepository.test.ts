import { describe, expect, it } from 'vitest'
import {
  createWorkoutDraftUpsert,
  WORKOUT_DRAFT_CONFLICT_COLUMNS
} from './supabaseWorkoutDraftRepository'

describe('sincronización remota de borradores', () => {
  it('prepara el upsert con user_id, draft_key y payload completo', () => {
    const payload = {
      status: 'active',
      localDate: '2026-08-12',
      templateId: 'miercoles',
      logs: [{ completed: true, weightKg: 67.5, reps: '8' }]
    }
    const row = createWorkoutDraftUpsert(
      'user-1', 3, '2026-08-12.miercoles', payload
    )

    expect(row).toMatchObject({
      user_id: 'user-1',
      day_of_week: 3,
      draft_key: '2026-08-12.miercoles',
      payload
    })
    expect(new Date(row.updated_at!).getTime()).not.toBeNaN()
    expect(WORKOUT_DRAFT_CONFLICT_COLUMNS).toBe('user_id,draft_key')
  })

  it('impide preparar escrituras sin usuario autenticado', () => {
    expect(() => createWorkoutDraftUpsert('', 3, '2026-08-12.miercoles', {})).toThrow(
      'sin usuario autenticado'
    )
  })
})

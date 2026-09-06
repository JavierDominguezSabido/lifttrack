import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../../types/database'
import { supabase } from './supabaseClient'
import { enqueueSyncOperation, pendingOperations, readSyncRevision, rememberSyncRevision } from '../syncOutbox'

type DbClient = SupabaseClient<Database>
type WorkoutDraftRow = Database['public']['Tables']['workout_drafts']['Row']
export const WORKOUT_DRAFT_CONFLICT_COLUMNS = 'user_id,draft_key'

export interface RemoteWorkoutDraft<TPayload> {
  dayOfWeek: number
  draftKey: string
  payload: TPayload
  updatedAt: string
  pending?: boolean
}

function requireClient(): DbClient {
  if (!supabase) {
    throw new Error('Supabase no esta configurado. El borrador se mantiene local.')
  }
  return supabase
}

async function requireUserId(client: DbClient, expectedUserId: string) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Se necesita una sesion autenticada para sincronizar borradores.')
  if (data.user.id !== expectedUserId) throw new Error('La cuenta ha cambiado. Vuelve a abrir el entrenamiento.')
  return data.user.id
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function mapRow<TPayload>(row: WorkoutDraftRow): RemoteWorkoutDraft<TPayload> {
  return {
    dayOfWeek: row.day_of_week,
    draftKey: row.draft_key,
    payload: row.payload as TPayload,
    updatedAt: row.updated_at
  }
}

export function createWorkoutDraftUpsert(
  userId: string,
  dayOfWeek: number,
  draftKey: string,
  payload: object
): Database['public']['Tables']['workout_drafts']['Insert'] {
  if (!userId) throw new Error('No se puede sincronizar un borrador sin usuario autenticado.')
  return {
    user_id: userId,
    day_of_week: dayOfWeek,
    draft_key: draftKey,
    payload: payload as unknown as Json,
    updated_at: new Date().toISOString()
  }
}

export async function getRemoteWorkoutDraft<TPayload>(
  dayOfWeek: number,
  draftKey: string,
  expectedUserId: string
): Promise<RemoteWorkoutDraft<TPayload> | null> {
  const client = requireClient()
  const userId = await requireUserId(client, expectedUserId)
  const before = await readSyncRevision(userId, `draft:${draftKey}`)
  const { data, error } = await client
    .from('workout_drafts')
    .select('*')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek)
    .eq('draft_key', draftKey)
    .maybeSingle()
  throwIfError(error)
  const after = await readSyncRevision(userId, `draft:${draftKey}`)
  if (before !== after) throw new Error('El borrador cambió durante la lectura. Reintenta.')
  rememberSyncRevision(userId, `draft:${draftKey}`, after)
  const pending = pendingOperations(userId, `draft:${draftKey}`).slice(-1)[0]
  if (pending?.payload.action === 'delete') return null
  if (pending?.payload.draft) return {
    dayOfWeek, draftKey, payload: pending.payload.draft as TPayload,
    updatedAt: (pending.payload.draft as { updatedAt?: string }).updatedAt ?? new Date().toISOString(), pending: true
  }
  return data ? mapRow<TPayload>(data) : null
}

export async function upsertRemoteWorkoutDraft<TPayload extends object>(
  dayOfWeek: number, draftKey: string, payload: TPayload, expectedUserId: string
): Promise<RemoteWorkoutDraft<TPayload>> {
  enqueueSyncOperation(expectedUserId, `draft:${draftKey}`, { action: 'save', dayOfWeek, draft: payload })
  return { dayOfWeek, draftKey, payload, updatedAt: (payload as { updatedAt?: string }).updatedAt ?? new Date().toISOString(), pending: true }
}

export async function deleteRemoteWorkoutDraft(dayOfWeek: number, draftKey: string, expectedUserId: string) {
  enqueueSyncOperation(expectedUserId, `draft:${draftKey}`, { action: 'delete', dayOfWeek })
}
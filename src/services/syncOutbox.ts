import { supabase } from './supabase/supabaseClient'
import type { Json } from '../types/database'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../types'

export interface SyncPayload {
  action?: 'save' | 'delete'
  session?: WorkoutSession
  exercises?: Exercise[]
  templates?: WorkoutTemplate[]
  template?: WorkoutTemplate | null
  dayOfWeek?: number
  draft?: object
}
export interface SyncOperation {
  id: string
  owner: string
  resource: string
  sequence: number
  expected: string
  after?: string
  payload: SyncPayload
  status: 'pending' | 'error' | 'conflict' | 'done'
  error?: string
  revision?: string
}
const prefix = 'lifttrack.outbox.v1.'
const workers = new Map<string, Promise<void>>()
let activeOwner: string | null = null
let accountGeneration = 0

const key = (owner: string, id: string) => `${prefix}${encodeURIComponent(owner)}.${id}`
const versionKey = (owner: string, resource: string) => `lifttrack.syncBase.v1.${JSON.stringify([owner, resource])}`
export function getSyncBase(owner: string, resource: string) { return localStorage.getItem(versionKey(owner, resource)) }
export function notifySync(owner: string) {
  window.dispatchEvent(new CustomEvent('lifttrack-sync', { detail: { owner } }))
}
export function getSyncOperations(owner: string): SyncOperation[] {
  const operations: SyncOperation[] = []
  const starts = key(owner, '')
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i)
    if (!name?.startsWith(starts)) continue
    const operation = JSON.parse(localStorage.getItem(name)!) as SyncOperation
    if (operation.owner !== owner || !operation.id || !operation.resource || !operation.status) {
      throw new Error('No se puede leer la cola local. Conserva los datos del navegador para recuperarla.')
    }
    operations.push(operation)
  }
  return operations.sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
}
export function pendingOperations(owner: string, resource?: string) {
  return getSyncOperations(owner).filter(op => op.status !== 'done' && (!resource || op.resource === resource))
}
function write(operation: SyncOperation) {
  // Un registro por operación: otra pestaña nunca sustituye la cola completa.
  localStorage.setItem(key(operation.owner, operation.id), JSON.stringify(operation))
  notifySync(operation.owner)
}
export function rememberSyncRevision(owner: string, resource: string, revision: string) {
  if (!pendingOperations(owner, resource).length) localStorage.setItem(versionKey(owner, resource), revision)
}
export function enqueueSyncOperation(owner: string, resource: string, payload: SyncPayload, expected?: string) {
  const all = getSyncOperations(owner)
  const previous = all.filter(op => op.resource === resource && op.status !== 'done').slice(-1)[0]
  if (expected === undefined && previous && JSON.stringify(previous.payload) === JSON.stringify(payload)) return previous
  const operation: SyncOperation = {
    id: crypto.randomUUID(), owner, resource,
    sequence: (all.slice(-1)[0]?.sequence ?? 0) + 1,
    expected: expected ?? localStorage.getItem(versionKey(owner, resource)) ?? (resource === 'routine' ? 'unread' : 'empty'),
    after: expected?.startsWith('operation:') ? expected.slice(10) : expected === undefined ? previous?.id : undefined,
    payload, status: 'pending'
  }
  write(operation) // Si falla, no se envía ni se comunica un guardado exitoso.
  return operation
}
export async function readSyncRevision(owner: string, resource: string) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.rpc('sync_revision', { p_user_id: owner, p_resource: resource })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string') throw new Error('La versión remota no es válida.')
  return data
}
export async function readSessionVersions(owner: string): Promise<Record<string, string>> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.rpc('sync_session_versions', { p_user_id: owner })
  if (error) throw new Error(error.message)
  return data as Record<string, string>
}
export function activateSyncOwner(owner: string | null) {
  activeOwner = owner
  accountGeneration += 1
}
export function isSendingSync(owner: string) { return activeOwner === owner && workers.has(owner) }

export function flushSyncOperations(owner: string): Promise<void> {
  if (workers.has(owner)) return workers.get(owner)!
  if (activeOwner !== owner || !navigator.onLine || !pendingOperations(owner).length || pendingOperations(owner)[0].status === 'conflict') return Promise.resolve()
  const generation = accountGeneration
  const current = () => activeOwner === owner && generation === accountGeneration
  const run = async () => {
    if (!supabase || !current() || !navigator.onLine) return
    while (current() && navigator.onLine) {
      const operation = pendingOperations(owner)[0]
      if (!operation || operation.status === 'conflict') return
      try {
        const { data: auth, error: authError } = await supabase.auth.getSession()
        if (authError || auth.session?.user.id !== owner || !current()) return
        const previous = operation.after ? getSyncOperations(owner).find(op => op.id === operation.after) : undefined
        if (operation.after && (!previous || previous.status !== 'done' || !previous.revision)) {
          write({ ...operation, status: 'conflict', error: 'Hay una operación anterior sin resolver. La copia local se conserva.' })
          return
        }
        const expected = previous?.revision ?? operation.expected
        const { data, error } = await supabase.rpc('apply_sync_operation', {
          p_user_id: owner, p_operation_id: operation.id, p_resource: operation.resource,
          p_expected: expected, p_payload: operation.payload as unknown as Json
        }).abortSignal(AbortSignal.timeout(15000))
        if (getSyncOperations(owner).find(op => op.id === operation.id)?.status === 'done') continue
        if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883'
          ? 'Falta aplicar la migración de sincronización en Supabase. Las operaciones siguen guardadas localmente.' : error.message)
        const result = data as { conflict: boolean; revision: string; saved?: { updatedAt?: string } }
        if (!result || typeof result.revision !== 'string' || typeof result.conflict !== 'boolean') throw new Error('No se recibió confirmación válida.')
        if (result.conflict) {
          write({ ...operation, status: 'conflict', error: 'La nube ha cambiado desde tu última lectura. Elige qué versión conservar.' })
          return
        }
        // El recibo se conserva, incluso si cambió la cuenta durante la petición.
        // Nunca se sustituye el contenido de una operación más nueva.
        write({ ...operation, status: 'done', payload: {}, error: undefined, revision: result.revision })
        rememberSyncRevision(owner, operation.resource, result.revision)
        window.dispatchEvent(new CustomEvent('lifttrack-sync-confirmed', { detail: { owner, resource: operation.resource, payload: operation.payload, saved: result.saved } }))
      } catch (error) {
        if (getSyncOperations(owner).find(op => op.id === operation.id)?.status === 'done') return
        write({ ...operation, status: 'error', error: error instanceof Error ? error.message : 'No se pudo sincronizar.' })
        return
      }
    }
  }
  // Web Locks evita dos emisores de esta cuenta en distintas pestañas.
  const task = Promise.resolve().then(() => navigator.locks
    ? navigator.locks.request(`lifttrack-sync-${owner}`, run) : run())
    .finally(() => { workers.delete(owner); notifySync(owner) })
  workers.set(owner, task)
  notifySync(owner)
  return task
}

export async function resolveSyncConflict(owner: string, latestId: string, keepLocal: boolean) {
  if (activeOwner !== owner) throw new Error('La cuenta ha cambiado.')
  const generation = accountGeneration
  const latest = pendingOperations(owner).find(op => op.id === latestId)
  if (!latest) return
  const revision = await readSyncRevision(owner, latest.resource)
  if (activeOwner !== owner || generation !== accountGeneration || pendingOperations(owner, latest.resource).slice(-1)[0]?.id !== latestId) {
    throw new Error('Hay cambios locales nuevos. Revisa el conflicto de nuevo.')
  }
  // Primero persistir la decisión local; solo después retirar las operaciones anteriores.
  if (keepLocal) enqueueSyncOperation(owner, latest.resource, latest.payload, revision)
  for (const op of pendingOperations(owner, latest.resource).filter(op => op.sequence <= latest.sequence)) {
    write({ ...op, status: 'done', payload: {}, error: undefined, revision })
  }
  rememberSyncRevision(owner, latest.resource, revision)
  if (!keepLocal && latest.resource.startsWith('draft:')) {
    localStorage.removeItem(`lifttrack.workoutDraft.user:${owner}.${latest.resource.slice(6)}`)
  }
  window.dispatchEvent(new CustomEvent('lifttrack-sync-resolved', { detail: { owner, resource: latest.resource, keepLocal } }))
  await flushSyncOperations(owner)
}

export function overlayPendingSessions(owner: string, sessions: WorkoutSession[]) {
  let result = sessions
  for (const op of pendingOperations(owner)) {
    if (!op.resource.startsWith('session:')) continue
    const id = op.resource.slice(8)
    result = result.filter(session => session.id !== id)
    if (op.payload.action !== 'delete' && op.payload.session) result = [{ ...op.payload.session, syncRevision: `operation:${op.id}` }, ...result]
  }
  return result
}

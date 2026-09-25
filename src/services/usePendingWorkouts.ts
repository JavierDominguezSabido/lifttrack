import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useWorkouts } from '../context/WorkoutContext'
import { getWorkoutSessionId } from '../utils/workoutDraft'
import { pendingOperations } from './syncOutbox'
import { deleteRemoteWorkoutDraft, getRemoteWorkoutDraft, listRemoteWorkoutDrafts } from './supabase/supabaseWorkoutDraftRepository'
import { isStoredWorkoutDraft, readWorkoutDrafts, removeWorkoutDraft, workoutDraftKey, workoutDraftLocalKey, type StoredWorkoutDraft } from './workoutDraftStorage'

/** Local first: remote discovery may enrich the list, but never blocks Hoy. */
export function usePendingWorkouts(enabled = true) {
  const { user } = useAuth()
  const { ownerId, sessions, historyReader } = useWorkouts()
  const owner = user?.id ?? 'local'
  const userKey = user ? `user:${owner}` : 'local'
  const [remote, setRemote] = useState<{ owner: string; drafts: StoredWorkoutDraft[]; checked: boolean }>({ owner, drafts: [], checked: false })
  const [, rerender] = useState(0)

  useEffect(() => {
    let active = true
    let revision = 0
    const removedKeys = new Set<string>()
    const refresh = async () => {
      if (!enabled || !user || !navigator.onLine) return
      const request = ++revision
      try {
        const rows = await listRemoteWorkoutDrafts<StoredWorkoutDraft>(owner)
        const found: StoredWorkoutDraft[] = []
        for (const row of rows) {
          if (!active || request !== revision) return
          if (!isStoredWorkoutDraft(row.payload, userKey) || row.draftKey !== workoutDraftKey(row.payload) || row.dayOfWeek !== row.payload.dayOfWeek) continue
          const current = await getRemoteWorkoutDraft<StoredWorkoutDraft>(row.dayOfWeek, row.draftKey, owner)
          if (!active || request !== revision || !current || !isStoredWorkoutDraft(current.payload, userKey)) continue
          const draft = current.payload
          if (row.draftKey !== workoutDraftKey(draft)) continue
          if (removedKeys.has(row.draftKey) || pendingOperations(owner, `draft:${row.draftKey}`).at(-1)?.payload.action === 'delete') continue
          const id = getWorkoutSessionId(draft.templateId, draft.startedAt)
          // Una lectura histórica fallida no debe ocultar un entrenamiento recuperable.
          const saved = historyReader ? await historyReader.session(id).catch(() => null) : null
          if (!active || request !== revision) return
          if (saved?.id === id && saved.completedAt && saved.startedAt === draft.startedAt && saved.templateId === draft.templateId &&
            !saved.syncRevision?.startsWith('operation:') && !pendingOperations(owner, `session:${id}`).length) {
            if (pendingOperations(owner, `draft:${row.draftKey}`).at(-1)?.payload.action !== 'delete') {
              await deleteRemoteWorkoutDraft(row.dayOfWeek, row.draftKey, owner)
            }
            removeWorkoutDraft(draft)
            continue
          }
          if (removedKeys.has(row.draftKey) || pendingOperations(owner, `draft:${row.draftKey}`).at(-1)?.payload.action === 'delete') continue
          found.push(draft)
          const key = workoutDraftLocalKey(userKey, draft)
          if (!removedKeys.has(row.draftKey) && !localStorage.getItem(key) && !pendingOperations(owner, `draft:${row.draftKey}`).length) {
            try { localStorage.setItem(key, JSON.stringify({ ...draft, confirmed: true })) } catch { /* El remoto sigue disponible en memoria. */ }
          }
        }
        if (active && request === revision) setRemote({ owner, drafts: found.filter(draft => !removedKeys.has(workoutDraftKey(draft))), checked: true })
      } catch {
        if (active && request === revision) setRemote(previous => ({ owner, drafts: previous.owner === owner ? previous.drafts : [], checked: true }))
      }
    }
    const changed = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.owner && event.detail.owner !== owner) return
      if (event instanceof CustomEvent && event.detail?.resource?.startsWith('draft:') && event.detail?.payload?.action === 'delete') {
        const key = event.detail.resource.slice(6)
        removedKeys.add(key)
        setRemote(previous => previous.owner === owner
          ? { ...previous, drafts: previous.drafts.filter(draft => workoutDraftKey(draft) !== key) }
          : previous)
      }
      rerender(value => value + 1)
    }
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    window.addEventListener('lifttrack-drafts', changed)
    window.addEventListener('lifttrack-sync', changed)
    window.addEventListener('lifttrack-sync-confirmed', changed)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false; revision++
      window.removeEventListener('lifttrack-drafts', changed)
      window.removeEventListener('lifttrack-sync', changed)
      window.removeEventListener('lifttrack-sync-confirmed', changed)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [enabled, historyReader, owner, user, userKey])

  const byKey = new Map<string, StoredWorkoutDraft>()
  if (remote.owner === owner) for (const draft of remote.drafts) byKey.set(workoutDraftKey(draft), draft)
  for (const draft of readWorkoutDrafts(userKey)) byKey.set(workoutDraftKey(draft), draft)
  if (user) for (const operation of pendingOperations(owner)) {
    if (!operation.resource.startsWith('draft:')) continue
    const key = operation.resource.slice(6)
    if (operation.payload.action === 'delete') byKey.delete(key)
    else if (isStoredWorkoutDraft(operation.payload.draft, userKey)) byKey.set(key, operation.payload.draft)
  }
  const completed = new Set(sessions.filter(session => session.completedAt).map(session => session.id))
  const drafts = [...byKey.values()].filter(draft => !completed.has(getWorkoutSessionId(draft.templateId, draft.startedAt)))
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.startedAt.localeCompare(b.startedAt))
  return { drafts: ownerId === owner ? drafts : [], loading: Boolean(user && navigator.onLine && (remote.owner !== owner || !remote.checked)) }
}

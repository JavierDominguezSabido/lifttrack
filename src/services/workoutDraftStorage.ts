import type { DraftExerciseLog, WorkoutTemplate } from '../types'
import { getWorkoutSessionId } from '../utils/workoutDraft'
import { parseLocalDate, toLocalDateKey } from '../utils/date'

export const WORKOUT_DRAFT_VERSION = 3
export const WORKOUT_DRAFT_PREFIX = 'lifttrack.workoutDraft'
type WorkoutViewMode = 'full' | 'guided'
interface GuidedPosition { exerciseId?: string; logId?: string; setId: string }

export interface StoredWorkoutDraft {
  confirmed?: true
  version: 3
  userKey: string
  templateId: string
  dayOfWeek: number
  localDate: string
  status: 'active'
  started: true
  startedAt: string
  updatedAt: string
  template: WorkoutTemplate
  logs: DraftExerciseLog[]
  viewMode: WorkoutViewMode
  guidedPosition?: GuidedPosition
}

export function workoutDraftKey(draft: Pick<StoredWorkoutDraft, 'localDate' | 'templateId' | 'startedAt'>) {
  return `${draft.localDate}.${encodeURIComponent(draft.templateId)}.${Date.parse(draft.startedAt)}`
}

export function workoutDraftLocalKey(userKey: string, draft: Pick<StoredWorkoutDraft, 'localDate' | 'templateId' | 'startedAt'>) {
  return `${WORKOUT_DRAFT_PREFIX}.${userKey}.${workoutDraftKey(draft)}`
}

export function workoutDraftUrl(draft: StoredWorkoutDraft) {
  return `/entrenamiento/${encodeURIComponent(draft.templateId)}?draft=${encodeURIComponent(workoutDraftKey(draft))}`
}

export function countCompletedDraftSets(draft: Pick<StoredWorkoutDraft, 'logs'>) {
  return draft.logs.reduce((total, log) => total + log.sets.filter(set => set.completed).length, 0)
}

export function isStoredWorkoutDraft(value: unknown, userKey: string): value is StoredWorkoutDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<StoredWorkoutDraft>
  const template = draft.template
  const validLogs = Array.isArray(draft.logs) && draft.logs.every(log =>
    log && typeof log.id === 'string' && typeof log.exerciseId === 'string' && Number.isInteger(log.order) &&
    (log.workingWeightKg === undefined || typeof log.workingWeightKg === 'number' && Number.isFinite(log.workingWeightKg)) &&
    Array.isArray(log.sets) &&
    log.sets.every(set => set && typeof set.id === 'string' && typeof set.reps === 'string' &&
      typeof set.completed === 'boolean' && Number.isInteger(set.setNumber) &&
      typeof set.weightKg === 'number' && Number.isFinite(set.weightKg) &&
      (set.weightOverrideKg === undefined || typeof set.weightOverrideKg === 'number' && Number.isFinite(set.weightOverrideKg))))
  return draft.version === WORKOUT_DRAFT_VERSION && draft.userKey === userKey && draft.status === 'active' && draft.started === true &&
    typeof draft.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(draft.localDate) &&
    parseLocalDate(draft.localDate) !== null && toLocalDateKey(parseLocalDate(draft.localDate)!) === draft.localDate &&
    typeof draft.templateId === 'string' && draft.templateId.length > 0 &&
    Number.isInteger(draft.dayOfWeek) && draft.dayOfWeek! >= 0 && draft.dayOfWeek! <= 6 &&
    typeof draft.startedAt === 'string' && Number.isFinite(Date.parse(draft.startedAt)) &&
    typeof draft.updatedAt === 'string' && Number.isFinite(Date.parse(draft.updatedAt)) &&
    (draft.viewMode === 'full' || draft.viewMode === 'guided') &&
    template?.id === draft.templateId && typeof template.name === 'string' &&
    template.dayOfWeek === draft.dayOfWeek && Array.isArray(template.exercises) &&
    template.exercises.every(item => item && typeof item.exerciseId === 'string' &&
      typeof item.id === 'string' && Number.isInteger(item.order) && Number.isInteger(item.targetSets) &&
      typeof item.targetReps === 'string') &&
    validLogs &&
    getWorkoutSessionId(draft.templateId, draft.startedAt).length > 0
}

export function readWorkoutDrafts(userKey: string): StoredWorkoutDraft[] {
  const drafts: StoredWorkoutDraft[] = []
  try {
    const prefix = `${WORKOUT_DRAFT_PREFIX}.${userKey}.`
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(prefix)) continue
      try {
        const draft: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
        if (isStoredWorkoutDraft(draft, userKey) && key === workoutDraftLocalKey(userKey, draft)) drafts.push(draft)
      } catch { /* Un registro legacy o corrupto no afecta a los demás. */ }
    }
  } catch { /* La aplicación sigue disponible si falla el almacenamiento. */ }
  return drafts.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function readWorkoutDraft(userKey: string, draftKey: string): StoredWorkoutDraft | null {
  return readWorkoutDrafts(userKey).find(draft => workoutDraftKey(draft) === draftKey) ?? null
}

export function writeWorkoutDraft(draft: StoredWorkoutDraft): boolean {
  try {
    localStorage.setItem(workoutDraftLocalKey(draft.userKey, draft), JSON.stringify(draft))
    window.dispatchEvent(new CustomEvent('lifttrack-drafts', { detail: { owner: draft.userKey.replace(/^user:/, '') } }))
    return true
  } catch { return false }
}

export function removeWorkoutDraft(draft: StoredWorkoutDraft) {
  try {
    const key = workoutDraftLocalKey(draft.userKey, draft)
    const current = readWorkoutDraft(draft.userKey, workoutDraftKey(draft))
    if (current?.startedAt === draft.startedAt) localStorage.removeItem(key)
    window.dispatchEvent(new CustomEvent('lifttrack-drafts', { detail: {
      owner: draft.userKey.replace(/^user:/, ''), resource: `draft:${workoutDraftKey(draft)}`, payload: { action: 'delete' }
    } }))
  } catch { /* La intención remota queda en outbox; la copia local se conserva. */ }
}

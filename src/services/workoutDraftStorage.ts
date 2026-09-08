import type { DraftExerciseLog } from '../types'
import { isActiveDraftForDate } from '../utils/workoutLifecycle'
export const WORKOUT_DRAFT_VERSION = 2
export const WORKOUT_DRAFT_PREFIX = 'lifttrack.workoutDraft'
type WorkoutViewMode = 'full' | 'guided'
interface GuidedPosition { exerciseId?: string; logId?: string; setId: string }
export interface StoredWorkoutDraft {
  confirmed?: true
  version: number
  userKey: string
  templateId: string
  dayOfWeek: number
  localDate: string
  status: 'active' | 'completed'
  startedAt: string
  logs: DraftExerciseLog[]
  updatedAt: string
  viewMode?: WorkoutViewMode
  guidedPosition?: GuidedPosition
}

export function readWorkoutDrafts(userKey: string, localDate: string) {
  const drafts: StoredWorkoutDraft[] = []
  try {
    const keyPrefix = `${WORKOUT_DRAFT_PREFIX}.${userKey}.`
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(keyPrefix)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<StoredWorkoutDraft>
      if (
        parsed.version === WORKOUT_DRAFT_VERSION &&
        parsed.userKey === userKey &&
      isActiveDraftForDate(parsed, localDate) &&
      typeof parsed.templateId === 'string' &&
      typeof parsed.dayOfWeek === 'number' &&
      typeof parsed.startedAt === 'string' &&
      typeof parsed.updatedAt === 'string' &&
      Array.isArray(parsed.logs)
      ) {
        drafts.push(parsed as StoredWorkoutDraft)
      }
    }
  } catch (error) {
    console.error('[workout] No se pudieron leer los borradores locales:', error)
  }
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}


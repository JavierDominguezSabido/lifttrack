import { HistoryReader } from '../historyReader'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import type { WorkoutSession } from '../../types'
import type { WorkoutRepository } from '../workoutRepository'
import { getStoredExercises, getStoredTemplates } from '../routineStorage'
import { supabase } from './supabaseClient'
import { enqueueSyncOperation } from '../syncOutbox'

type DbClient = SupabaseClient<Database>
function requireClient(): DbClient {
  if (!supabase) {
    throw new Error('Supabase no está configurado. LiftTrack continúa en modo local.')
  }
  return supabase
}

async function requireUserId(client: DbClient) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Se necesita una sesión autenticada para usar Supabase.')
  return data.user.id
}

function validateSessionSets(session: WorkoutSession, context: string) {
  if (!import.meta.env.DEV) return

  for (const log of session.exerciseLogs) {
    const setNumbers = log.sets.map((set) => set.setNumber)
    const uniqueSetNumbers = new Set(setNumbers)
    if (uniqueSetNumbers.size !== setNumbers.length) {
      console.error(
        `[workout:${context}] ${session.id} / ${log.exerciseId} contiene números de serie duplicados: ${setNumbers.join(', ')}.`
      )
    }
    console.info(
      `[workout:${context}] ${session.id} / ${log.exerciseId} / ${log.sets.length} series / ${log.sets.map((set) => set.reps).join('-')} / ${log.workingWeightKg ?? log.sets[0]?.weightKg ?? 0} kg`
    )
  }
}

async function persistSession(session: WorkoutSession, expectedUserId?: string) {
  const userId = expectedUserId ?? await requireUserId(requireClient())
  validateSessionSets(session, 'save:start')
  const domainTemplate = getStoredTemplates(userId).find((item) => item.id === session.templateId)
  const exerciseIds = new Set(session.exerciseLogs.map((log) => log.exerciseId))
  const exercises = getStoredExercises(userId).filter((exercise) => exerciseIds.has(exercise.id))
  const operation = enqueueSyncOperation(userId, `session:${session.id}`, { action: 'save', session, exercises, template: domainTemplate ?? null }, session.syncRevision ?? 'empty')
  return { ...session, syncRevision: `operation:${operation.id}` }
}

export const supabaseWorkoutRepository: WorkoutRepository = {
  async getWorkoutSessions(expectedUserId) {
    const client = requireClient()
    const userId = await requireUserId(client)
    if (expectedUserId && userId !== expectedUserId) throw new Error('La cuenta ha cambiado.')
    // Full traversal is reserved for explicit export/import/maintenance actions.
    const reader = new HistoryReader(userId)
    const pager = reader.pager({ exerciseIds:null,searchIds:null,day:null,from:null,to:null,templateDays:{},includeInitial:true },100)
    while (pager.hasMore) await pager.more(100)
    if (await requireUserId(client) !== userId) throw new Error('La cuenta ha cambiado.')
    return pager.items
  },

  saveWorkoutSession: persistSession,
  updateWorkoutSession: persistSession,

  async deleteWorkoutSession(sessionId, expectedUserId, expectedRevision) {
    const userId = expectedUserId ?? await requireUserId(requireClient())
    enqueueSyncOperation(userId, `session:${sessionId}`, { action: 'delete' }, expectedRevision ?? 'unread')
  },

  async clearWorkoutSessions() {
    const userId = await requireUserId(requireClient())
    for (const session of await this.getWorkoutSessions(userId)) await this.deleteWorkoutSession(session.id, userId, session.syncRevision)
  },

  async mergeExerciseIds(canonicalId, duplicateIds, expectedUserId) {
    const userId = await requireUserId(requireClient())
    if (expectedUserId && userId !== expectedUserId) throw new Error('La cuenta ha cambiado.')
    const duplicates = new Set(duplicateIds.filter(id => id !== canonicalId))
    let count = 0
    for (const session of await this.getWorkoutSessions(userId)) {
      if (!session.exerciseLogs.some(log => duplicates.has(log.exerciseId))) continue
      const exerciseLogs = session.exerciseLogs.map(log => {
        if (!duplicates.has(log.exerciseId)) return log
        count += 1
        return { ...log, exerciseId: canonicalId }
      })
      await persistSession({ ...session, exerciseLogs }, userId)
    }
    return count
  },
  async getLastPerformanceByExercise(exerciseId) {
    const userId = await requireUserId(requireClient())
    return new HistoryReader(userId).performance(exerciseId, [exerciseId])
  }
}

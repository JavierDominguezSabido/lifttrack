import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import type { WorkoutSession } from '../../types'
import { getLastExercisePerformanceFromSessions } from '../../utils/workoutHistory'
import type { WorkoutRepository } from '../workoutRepository'
import { getStoredExercises, getStoredTemplates } from '../routineStorage'
import { supabase } from './supabaseClient'
import { enqueueSyncOperation, overlayPendingSessions, readSessionVersions, rememberSyncRevision } from '../syncOutbox'

type DbClient = SupabaseClient<Database>
type ExerciseLogRow = Database['public']['Tables']['exercise_logs']['Row']
type SetLogRow = Database['public']['Tables']['set_logs']['Row']

const SUPABASE_PAGE_SIZE = 1000
const IN_FILTER_CHUNK_SIZE = 150

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

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
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

function chunkIds(ids: string[], size = IN_FILTER_CHUNK_SIZE) {
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size))
  }
  return chunks
}

async function fetchExerciseLogsForSessions(
  client: DbClient,
  userId: string,
  sessionIds: string[]
) {
  const rows: ExerciseLogRow[] = []

  for (const chunk of chunkIds(sessionIds)) {
    let from = 0
    while (true) {
      const { data, error } = await client
        .from('exercise_logs')
        .select('*')
        .eq('user_id', userId)
        .in('session_id', chunk)
        .order('session_id', { ascending: true })
        .order('position', { ascending: true })
        .range(from, from + SUPABASE_PAGE_SIZE - 1)
      throwIfError(error)

      rows.push(...(data ?? []))
      if (!data || data.length < SUPABASE_PAGE_SIZE) break
      from += SUPABASE_PAGE_SIZE
    }
  }

  return rows
}

async function fetchSetLogsForExerciseLogs(
  client: DbClient,
  userId: string,
  exerciseLogIds: string[]
) {
  const rows: SetLogRow[] = []

  for (const chunk of chunkIds(exerciseLogIds)) {
    let from = 0
    while (true) {
      const { data, error } = await client
        .from('set_logs')
        .select('*')
        .eq('user_id', userId)
        .in('exercise_log_id', chunk)
        .order('exercise_log_id', { ascending: true })
        .order('set_number', { ascending: true })
        .range(from, from + SUPABASE_PAGE_SIZE - 1)
      throwIfError(error)

      rows.push(...(data ?? []))
      if (!data || data.length < SUPABASE_PAGE_SIZE) break
      from += SUPABASE_PAGE_SIZE
    }
  }

  return rows
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
    const before = await readSessionVersions(userId)
    const { data: sessions, error: sessionsError } = await client
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
    throwIfError(sessionsError)
    if (!sessions?.length) {
      if (JSON.stringify(before) !== JSON.stringify(await readSessionVersions(userId))) throw new Error('El historial cambió durante la lectura. Reintenta.')
      return overlayPendingSessions(userId, [])
    }

    const logs = await fetchExerciseLogsForSessions(
      client,
      userId,
      sessions.map((session) => session.id)
    )
    const sets = logs.length
      ? await fetchSetLogsForExerciseLogs(client, userId, logs.map((log) => log.id))
      : []

    const { data: dbExercises, error: exercisesError } = await client
      .from('exercises')
      .select('id, stable_key')
      .eq('user_id', userId)
    throwIfError(exercisesError)

    const { data: dbTemplates, error: templatesError } = await client
      .from('workout_templates')
      .select('id, stable_key')
      .eq('user_id', userId)
    throwIfError(templatesError)

    const exerciseKeys = new Map(dbExercises?.map((item) => [item.id, item.stable_key]))
    const templateKeys = new Map(dbTemplates?.map((item) => [item.id, item.stable_key]))
    const after = await readSessionVersions(userId)
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('El historial cambió durante la lectura. Reintenta la sincronización.')
    for (const [resource, revision] of Object.entries(after)) rememberSyncRevision(userId, resource, revision)

    return overlayPendingSessions(userId, sessions.map((session): WorkoutSession => ({
      syncRevision: after[`session:${session.client_id}`],
      id: session.client_id,
      templateId: session.template_id
        ? templateKeys.get(session.template_id)
        : undefined,
      name: session.name,
      dayOfWeek: session.day_of_week,
      startedAt: session.started_at,
      completedAt: session.completed_at ?? undefined,
      durationMinutes: session.duration_minutes ?? undefined,
      volumeKg: session.volume_kg ?? undefined,
      notes: session.notes ?? undefined,
      exerciseLogs: logs
        .filter((log) => log.session_id === session.id)
        .sort((a, b) => a.position - b.position)
        .map((log) => ({
          id: log.client_id,
          sessionId: session.client_id,
          exerciseId: exerciseKeys.get(log.exercise_id) ?? log.exercise_id,
          order: log.position,
          workingWeightKg: log.working_weight_kg ?? undefined,
          notes: log.notes ?? undefined,
          sets: sets
            .filter((set) => set.exercise_log_id === log.id)
            .sort((a, b) => a.set_number - b.set_number)
            .map((set) => ({
              id: set.client_id,
              exerciseLogId: log.client_id,
              setNumber: set.set_number,
              reps: set.reps ?? 0,
              weightKg: set.weight_kg,
              weightOverrideKg: set.weight_override_kg ?? undefined,
              completed: set.completed,
              isWarmup: set.is_warmup
            }))
        }))
    })))
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
    const sessions = await this.getWorkoutSessions()
    return getLastExercisePerformanceFromSessions(sessions, exerciseId)
  }
}

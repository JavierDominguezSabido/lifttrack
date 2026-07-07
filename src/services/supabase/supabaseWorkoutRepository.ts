import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import type { WorkoutSession } from '../../types'
import { getLastExercisePerformanceFromSessions } from '../../utils/workoutHistory'
import type { WorkoutRepository } from '../workoutRepository'
import { getStoredExercises, getStoredTemplates } from '../routineStorage'
import { supabase } from './supabaseClient'

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

async function persistSession(session: WorkoutSession) {
  const client = requireClient()
  const userId = await requireUserId(client)
  validateSessionSets(session, 'save:start')
  const domainTemplate = getStoredTemplates().find((item) => item.id === session.templateId)
  let templateId: string | null = null

  const { error: profileError } = await client
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id' })
  throwIfError(profileError)

  if (session.templateId) {
    const { data, error } = await client
      .from('workout_templates')
      .upsert({
        user_id: userId,
        stable_key: session.templateId,
        name: domainTemplate?.name ?? session.name,
        day_of_week: domainTemplate?.dayOfWeek ?? session.dayOfWeek,
        notes: domainTemplate?.notes ?? null
      }, { onConflict: 'user_id,stable_key' })
      .select('id')
      .single()
    throwIfError(error)
    templateId = data?.id ?? null
  }

  const exerciseIds = new Map<string, string>()
  for (const log of session.exerciseLogs) {
    const exercise = getStoredExercises().find((item) => item.id === log.exerciseId)
    const { data, error } = await client
      .from('exercises')
      .upsert({
        user_id: userId,
        stable_key: log.exerciseId,
        name: exercise?.name ?? log.exerciseId,
        muscle_group: exercise?.muscleGroup ?? 'Sin grupo',
        equipment: exercise?.equipment ?? null,
        notes: exercise?.notes ?? null
      }, { onConflict: 'user_id,stable_key' })
      .select('id')
      .single()
    throwIfError(error)
    if (!data) throw new Error(`No se pudo preparar el ejercicio ${log.exerciseId}.`)
    exerciseIds.set(log.exerciseId, data.id)
  }

  const { data: storedSession, error: sessionError } = await client
    .from('workout_sessions')
    .upsert({
      user_id: userId,
      client_id: session.id,
      template_id: templateId,
      name: session.name,
      day_of_week: session.dayOfWeek,
      started_at: session.startedAt,
      completed_at: session.completedAt ?? null,
      duration_minutes: session.durationMinutes ?? null,
      volume_kg: session.volumeKg ?? null,
      notes: session.notes ?? null
    }, { onConflict: 'user_id,client_id' })
    .select('id')
    .single()
  throwIfError(sessionError)
  if (!storedSession) throw new Error('No se pudo guardar la sesión.')

  const { error: deleteLogsError } = await client
    .from('exercise_logs')
    .delete()
    .eq('session_id', storedSession.id)
    .eq('user_id', userId)
  throwIfError(deleteLogsError)

  for (const log of session.exerciseLogs) {
    const exerciseId = exerciseIds.get(log.exerciseId)
    if (!exerciseId) continue

    const { data: storedLog, error: logError } = await client
      .from('exercise_logs')
      .insert({
        user_id: userId,
        client_id: log.id,
        session_id: storedSession.id,
        exercise_id: exerciseId,
        position: log.order,
        working_weight_kg: log.workingWeightKg ?? null,
        notes: log.notes ?? null
      })
      .select('id')
      .single()
    throwIfError(logError)
    if (!storedLog) throw new Error(`No se pudo guardar ${log.exerciseId}.`)

    if (log.sets.length > 0) {
      const { data: insertedSets, error: setsError } = await client
        .from('set_logs')
        .insert(log.sets.map((set) => ({
          user_id: userId,
          client_id: set.id,
          exercise_log_id: storedLog.id,
          set_number: set.setNumber,
          reps: set.reps > 0 ? set.reps : null,
          weight_kg: set.weightKg,
          weight_override_kg: set.weightOverrideKg ?? null,
          completed: set.completed,
          is_warmup: set.isWarmup ?? false
        })))
        .select('set_number')
      throwIfError(setsError)
      if ((insertedSets?.length ?? 0) !== log.sets.length) {
        console.error(
          `[workout:save] ${session.id} / ${log.exerciseId}: se intentaron guardar ${log.sets.length} series y Supabase confirmó ${insertedSets?.length ?? 0}.`
        )
      }
    }
  }

  return session
}

export const supabaseWorkoutRepository: WorkoutRepository = {
  async getWorkoutSessions() {
    const client = requireClient()
    const userId = await requireUserId(client)
    const { data: sessions, error: sessionsError } = await client
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
    throwIfError(sessionsError)
    if (!sessions?.length) return []

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

    return sessions.map((session): WorkoutSession => ({
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
    }))
  },

  saveWorkoutSession: persistSession,
  updateWorkoutSession: persistSession,

  async deleteWorkoutSession(sessionId) {
    const client = requireClient()
    const userId = await requireUserId(client)
    const { error } = await client
      .from('workout_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('client_id', sessionId)
    throwIfError(error)
  },

  async clearWorkoutSessions() {
    const client = requireClient()
    const userId = await requireUserId(client)
    const { error } = await client
      .from('workout_sessions')
      .delete()
      .eq('user_id', userId)
    throwIfError(error)
  },

  async mergeExerciseIds(canonicalId, duplicateIds) {
    const client = requireClient()
    const userId = await requireUserId(client)
    const storedExercises = getStoredExercises()
    const canonicalExercise = storedExercises.find((item) => item.id === canonicalId)

    const { data: canonicalRow, error: canonicalError } = await client
      .from('exercises')
      .upsert({
        user_id: userId,
        stable_key: canonicalId,
        name: canonicalExercise?.name ?? canonicalId,
        muscle_group: canonicalExercise?.muscleGroup ?? 'Sin grupo',
        equipment: canonicalExercise?.equipment ?? null,
        notes: canonicalExercise?.notes ?? null
      }, { onConflict: 'user_id,stable_key' })
      .select('id')
      .single()
    throwIfError(canonicalError)
    if (!canonicalRow) throw new Error(`No se pudo preparar el ejercicio ${canonicalId}.`)

    const { data: duplicateRows, error: duplicateError } = await client
      .from('exercises')
      .select('id')
      .eq('user_id', userId)
      .in('stable_key', duplicateIds)
    throwIfError(duplicateError)

    const duplicateDbIds = (duplicateRows ?? [])
      .map((row) => row.id)
      .filter((id) => id !== canonicalRow.id)

    if (duplicateDbIds.length === 0) return 0

    const { count, error } = await client
      .from('exercise_logs')
      .update({ exercise_id: canonicalRow.id }, { count: 'exact' })
      .eq('user_id', userId)
      .in('exercise_id', duplicateDbIds)
    throwIfError(error)
    return count ?? 0
  },

  async getLastPerformanceByExercise(exerciseId) {
    const sessions = await this.getWorkoutSessions()
    return getLastExercisePerformanceFromSessions(sessions, exerciseId)
  }
}

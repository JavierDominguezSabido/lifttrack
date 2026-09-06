import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import type { Exercise, WorkoutTemplate } from '../../types'
import { supabase } from './supabaseClient'
import { assertUniqueTemplateExercises, normalizeWeeklyTemplates } from '../templateImport'
import { enqueueSyncOperation, getSyncBase, pendingOperations, readSyncRevision, rememberSyncRevision } from '../syncOutbox'

type DbClient = SupabaseClient<Database>

function client(): DbClient {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function loadRemoteRoutine(userId: string) {
  const db = client()
  const before = await readSyncRevision(userId, 'routine')
  const [exerciseResult, templateResult, itemResult, sessionResult] = await Promise.all([
    db.from('exercises').select('*').eq('user_id', userId),
    db.from('workout_templates').select('*').eq('user_id', userId).eq('active', true),
    db.from('template_exercises').select('*').eq('user_id', userId).order('position'),
    db.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  ])
  check(exerciseResult.error); check(templateResult.error); check(itemResult.error); check(sessionResult.error)
  const after = await readSyncRevision(userId, 'routine')
  if (before !== after) throw new Error('La rutina cambió durante la lectura. Reintenta la sincronización.')
  rememberSyncRevision(userId, 'routine', after)

  const exerciseKeys = new Map((exerciseResult.data ?? []).map((row) => [row.id, row.stable_key]))
  const exercises: Exercise[] = (exerciseResult.data ?? []).map((row) => ({
    syncRevision: after,
    id: row.stable_key,
    name: row.name,
    muscleGroup: row.muscle_group as Exercise['muscleGroup'],
    equipment: row.equipment ?? undefined,
    notes: row.notes ?? undefined,
    active: row.active
  }))
  const loadedTemplates: WorkoutTemplate[] = (templateResult.data ?? []).map((row) => ({
    syncRevision: after,
    id: row.stable_key,
    name: row.name,
    dayOfWeek: row.day_of_week,
    notes: row.notes ?? undefined,
    exercises: (itemResult.data ?? []).filter((item) => item.template_id === row.id).map((item) => ({
      id: item.id,
      templateId: row.stable_key,
      exerciseId: exerciseKeys.get(item.exercise_id) ?? item.exercise_id,
      order: item.position,
      targetSets: item.target_sets,
      targetReps: item.target_reps,
      restSeconds: item.rest_seconds ?? undefined,
      notes: item.notes ?? undefined
    }))
  }))
  const normalized = normalizeWeeklyTemplates(loadedTemplates)
  if (normalized.conflicts.length) console.error('[routine] Conflictos semanales:', normalized.conflicts)
  const templates = normalized.templates
  const pending = pendingOperations(userId, 'routine').slice(-1)[0]
  return {
    exercises: pending?.payload.exercises ?? exercises,
    templates: pending?.payload.templates ?? templates,
    hasRemoteData: exercises.length > 0 || templates.length > 0,
    hasCompleteRoutine: (itemResult.data?.length ?? 0) > 0,
    hasSessions: (sessionResult.count ?? 0) > 0
  }
}

export function queueRemoteRoutine(userId: string, exercises: Exercise[], templates: WorkoutTemplate[]) {
  assertUniqueTemplateExercises(templates)
  const normalized = normalizeWeeklyTemplates(templates)
  if (normalized.conflicts.length) throw new Error(normalized.conflicts.join(' '))
  // Una edición abierta conserva su versión aunque otra lectura refresque la caché.
  const base = getSyncBase(userId, 'routine')
  const stale = [...exercises, ...templates].map(item => item.syncRevision).find(revision => revision && revision !== base)
  return enqueueSyncOperation(userId, 'routine', { exercises, templates: normalized.templates }, stale)
}

export async function saveRemoteRoutine(userId: string, exercises: Exercise[], templates: WorkoutTemplate[]) {
  queueRemoteRoutine(userId, exercises, templates)
}

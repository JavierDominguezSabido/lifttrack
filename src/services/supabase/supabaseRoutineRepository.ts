import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import type { Exercise, WorkoutTemplate } from '../../types'
import { supabase } from './supabaseClient'
import { normalizeWeeklyTemplates } from '../templateImport'

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
  const [exerciseResult, templateResult, itemResult, sessionResult] = await Promise.all([
    db.from('exercises').select('*').eq('user_id', userId),
    db.from('workout_templates').select('*').eq('user_id', userId).eq('active', true),
    db.from('template_exercises').select('*').eq('user_id', userId).order('position'),
    db.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  ])
  check(exerciseResult.error); check(templateResult.error); check(itemResult.error); check(sessionResult.error)

  const exerciseKeys = new Map((exerciseResult.data ?? []).map((row) => [row.id, row.stable_key]))
  const exercises: Exercise[] = (exerciseResult.data ?? []).map((row) => ({
    id: row.stable_key,
    name: row.name,
    muscleGroup: row.muscle_group as Exercise['muscleGroup'],
    equipment: row.equipment ?? undefined,
    notes: row.notes ?? undefined,
    active: row.active
  }))
  const loadedTemplates: WorkoutTemplate[] = (templateResult.data ?? []).map((row) => ({
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
  if (templates.length !== loadedTemplates.length) await saveRemoteRoutine(userId, exercises, templates)
  return {
    exercises,
    templates,
    hasRemoteData: exercises.length > 0 || templates.length > 0,
    hasCompleteRoutine: (itemResult.data?.length ?? 0) > 0,
    hasSessions: (sessionResult.count ?? 0) > 0
  }
}

export async function saveRemoteRoutine(userId: string, exercises: Exercise[], templates: WorkoutTemplate[]) {
  const db = client()
  const normalized = normalizeWeeklyTemplates(templates)
  if (normalized.conflicts.length) throw new Error(normalized.conflicts.join(' '))
  templates = normalized.templates
  check((await db.from('profiles').upsert({ id: userId }, { onConflict: 'id' })).error)
  const exerciseDbIds = new Map<string, string>()
  for (const exercise of exercises) {
    const { data, error } = await db.from('exercises').upsert({
      user_id: userId, stable_key: exercise.id, name: exercise.name,
      muscle_group: exercise.muscleGroup ?? 'Sin grupo', equipment: exercise.equipment ?? null,
      notes: exercise.notes ?? null, active: exercise.active
    }, { onConflict: 'user_id,stable_key' }).select('id').single()
    check(error); if (data) exerciseDbIds.set(exercise.id, data.id)
  }
  const templateDbIds = new Map<string, string>()
  for (const template of templates) {
    const { data, error } = await db.from('workout_templates').upsert({
      user_id: userId, stable_key: template.id, name: template.name,
      day_of_week: template.dayOfWeek, notes: template.notes ?? null, active: true
    }, { onConflict: 'user_id,stable_key' }).select('id').single()
    check(error); if (data) templateDbIds.set(template.id, data.id)
  }
  const ids = [...templateDbIds.values()]
  const { data: activeTemplates, error: obsoleteError } = await db.from('workout_templates')
    .select('id, stable_key').eq('user_id', userId).eq('active', true)
  check(obsoleteError)
  const retainedKeys = new Set(templates.map((template) => template.id))
  const obsoleteIds = (activeTemplates ?? []).filter((row) => !retainedKeys.has(row.stable_key)).map((row) => row.id)
  if (obsoleteIds.length) {
    check((await db.from('template_exercises').delete().eq('user_id', userId).in('template_id', obsoleteIds)).error)
    check((await db.from('workout_templates').update({ active: false }).eq('user_id', userId).in('id', obsoleteIds)).error)
  }
  if (ids.length) check((await db.from('template_exercises').delete().eq('user_id', userId).in('template_id', ids)).error)
  const rows = templates.flatMap((template) => template.exercises.map((item) => {
    const templateId = templateDbIds.get(template.id); const exerciseId = exerciseDbIds.get(item.exerciseId)
    return templateId && exerciseId ? {
      user_id: userId, template_id: templateId, exercise_id: exerciseId, position: item.order,
      target_sets: item.targetSets, target_reps: item.targetReps,
      rest_seconds: item.restSeconds ?? null, notes: item.notes ?? null
    } : null
  })).filter((row): row is NonNullable<typeof row> => Boolean(row))
  if (rows.length) check((await db.from('template_exercises').insert(rows)).error)
}

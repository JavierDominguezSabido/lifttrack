import type { Exercise, WorkoutTemplate } from '../../types'
import { normalizeExerciseName } from '../../utils/exerciseIdentity'
import type { ImportPayload } from './types'

export function rebuildImportRelationships(
  payload: ImportPayload,
  existingExercises: Exercise[],
  existingTemplates: WorkoutTemplate[]
): ImportPayload {
  const errors = [...payload.errors]
  const existingByName = new Map<string, string>()
  for (const exercise of existingExercises) {
    const name = normalizeExerciseName(exercise.name)
    if (name && !existingByName.has(name)) existingByName.set(name, exercise.id)
  }

  const exerciseIdMap = new Map<string, string>()
  for (const exercise of payload.exercises) {
    exerciseIdMap.set(exercise.id, existingByName.get(normalizeExerciseName(exercise.name)) ?? exercise.id)
  }
  const validExerciseIds = new Set([...existingExercises.map(({ id }) => id), ...exerciseIdMap.values()])

  const existingTemplateIds = new Set(existingTemplates.map(({ id }) => id))
  const templateIdMap = new Map(payload.templates?.map(({ id }) => [id, id]) ?? [])
  const validTemplateIds = new Set([...existingTemplateIds, ...templateIdMap.values()])
  const templates = payload.templates?.map((template) => {
    const templateId = templateIdMap.get(template.id) ?? template.id
    return {
      ...template,
      id: templateId,
      exercises: template.exercises.map((item) => ({
        ...item,
        templateId,
        exerciseId: exerciseIdMap.get(item.exerciseId) ?? item.exerciseId
      }))
    }
  })

  for (const template of templates ?? []) {
    for (const item of template.exercises) {
      if (!validExerciseIds.has(item.exerciseId)) errors.push(`La rutina "${template.name}" referencia el ejercicio inexistente "${item.exerciseId}".`)
      if (item.templateId !== template.id) errors.push(`El elemento "${item.id}" no pertenece a la rutina "${template.id}".`)
    }
  }

  const sessions = payload.sessions.map((session) => ({
    ...session,
    templateId: session.templateId ? (templateIdMap.get(session.templateId) ?? session.templateId) : undefined,
    exerciseLogs: session.exerciseLogs.map((log) => ({
      ...log,
      exerciseId: exerciseIdMap.get(log.exerciseId) ?? log.exerciseId,
      sets: log.sets.map((set) => ({ ...set, exerciseLogId: log.id }))
    }))
  }))
  for (const session of sessions) {
    if (session.templateId && !validTemplateIds.has(session.templateId)) errors.push(`La sesión "${session.name}" referencia la rutina inexistente "${session.templateId}".`)
    for (const log of session.exerciseLogs) {
      if (!validExerciseIds.has(log.exerciseId)) errors.push(`La sesión "${session.name}" referencia el ejercicio inexistente "${log.exerciseId}".`)
      for (const set of log.sets) if (set.exerciseLogId !== log.id) errors.push(`La serie "${set.id}" no referencia correctamente su registro de ejercicio.`)
    }
  }

  const mappedIds = new Set(exerciseIdMap.values())
  const exercises = payload.exercises
    .filter((exercise) => exerciseIdMap.get(exercise.id) === exercise.id)
  for (const id of mappedIds) {
    const existing = existingExercises.find((exercise) => exercise.id === id)
    if (existing && !exercises.some((exercise) => exercise.id === id)) exercises.push(existing)
  }
  return { ...payload, exercises, templates, sessions, errors: [...new Set(errors)] }
}

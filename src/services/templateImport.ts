import type { WorkoutTemplate } from '../types'

export interface TemplateNormalization {
  templates: WorkoutTemplate[]
  conflicts: string[]
}

export function normalizeWeeklyTemplates(templates: WorkoutTemplate[]): TemplateNormalization {
  const byDay = new Map<number, WorkoutTemplate>()
  const conflicts: string[] = []
  for (const template of [...templates].sort((a, b) => a.dayOfWeek - b.dayOfWeek)) {
    const current = byDay.get(template.dayOfWeek)
    if (!current) { byDay.set(template.dayOfWeek, template); continue }
    if (current.exercises.length === 0 && template.exercises.length > 0) {
      byDay.set(template.dayOfWeek, template)
    } else if (current.exercises.length > 0 && template.exercises.length > 0) {
      conflicts.push(`El día ${template.dayOfWeek} contiene "${current.name}" y "${template.name}" con ejercicios.`)
      if (template.exercises.length > current.exercises.length) byDay.set(template.dayOfWeek, template)
    }
  }
  return { templates: [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek), conflicts }
}

export function mergeWeeklyTemplates(existing: WorkoutTemplate[], imported: WorkoutTemplate[]): TemplateNormalization {
  const normalizedExisting = normalizeWeeklyTemplates(existing)
  const byDay = new Map(normalizedExisting.templates.map((template) => [template.dayOfWeek, template]))
  const conflicts = [...normalizedExisting.conflicts]
  for (const incoming of normalizeWeeklyTemplates(imported).templates) {
    const current = byDay.get(incoming.dayOfWeek)
    if (!current || current.exercises.length === 0) { byDay.set(incoming.dayOfWeek, incoming); continue }
    if (incoming.exercises.length === 0) continue
    const exerciseIds = new Set(current.exercises.map((item) => item.exerciseId))
    const additions = incoming.exercises.filter((item) => !exerciseIds.has(item.exerciseId))
    conflicts.push(`Se fusionó "${incoming.name}" con "${current.name}" en el día ${incoming.dayOfWeek}.`)
    byDay.set(incoming.dayOfWeek, {
      ...current,
      exercises: [...current.exercises, ...additions].map((item, index) => ({
        ...item, templateId: current.id, order: index + 1
      }))
    })
  }
  return { templates: [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek), conflicts }
}

import type { WorkoutSession, WorkoutTemplate } from '../types'

export interface SessionRoutineIdentity {
  dayOfWeek: number
  dayIsExplicit: boolean
  template?: WorkoutTemplate
}

export function isValidDayOfWeek(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6
}

export function getSessionRoutineIdentity(
  session: WorkoutSession,
  templates: WorkoutTemplate[],
  registeredDayOfWeek: number
): SessionRoutineIdentity {
  const template = session.templateId
    ? templates.find((item) => item.id === session.templateId)
    : undefined

  if (isValidDayOfWeek(session.dayOfWeek)) {
    return { dayOfWeek: session.dayOfWeek, dayIsExplicit: true, template }
  }
  if (template && isValidDayOfWeek(template.dayOfWeek)) {
    return { dayOfWeek: template.dayOfWeek, dayIsExplicit: true, template }
  }
  return { dayOfWeek: registeredDayOfWeek, dayIsExplicit: false, template }
}

export function updateSessionRoutineDay(session: WorkoutSession, dayOfWeek: number) {
  if (!isValidDayOfWeek(dayOfWeek)) throw new Error('El día de rutina no es válido.')
  return { ...session, dayOfWeek }
}

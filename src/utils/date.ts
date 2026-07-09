import type { WorkoutSession } from '../types'

export const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const shortDayNames = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

export function toLocalDateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLocalDayOfWeek(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.getDay()
}

export function getLocalDayName(value: Date | string) {
  return dayNames[getLocalDayOfWeek(value)]
}

export function getSessionDate(session: WorkoutSession) {
  return session.completedAt ?? session.startedAt
}

export function getSessionDateObject(session: WorkoutSession) {
  return new Date(getSessionDate(session))
}

export function getWeekStart(date = new Date()) {
  const start = new Date(date)
  const dayFromMonday = (start.getDay() + 6) % 7
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - dayFromMonday)
  return start
}

export function getNextWeekStart(date = new Date()) {
  const next = getWeekStart(date)
  next.setDate(next.getDate() + 7)
  return next
}

export function getWeekKey(date: Date | string) {
  return toLocalDateKey(getWeekStart(typeof date === 'string' ? new Date(date) : date))
}

export function parseLocalDate(value: string) {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number)
    return new Date(year, month - 1, day, 12)
  }
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('es-ES', options ?? {
    day: 'numeric',
    month: 'short'
  }).format(typeof value === 'string' ? new Date(value) : value)
}

// Límites de integer y numeric del esquema de Supabase.
export const integer = (value: unknown, min = 0): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= 2147483647
export const amount = (value: unknown, max = 999999.99): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
export const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
export const string = (value: unknown): value is string => typeof value === 'string'
export const boolean = (value: unknown): value is boolean => typeof value === 'boolean'
export const day = (value: unknown) => integer(value) && value <= 6
export const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value)
export const unique = (values: unknown[]) => new Set(values).size === values.length

/** ISO explícito; Date por sí solo normaliza fechas como el 30 de febrero. */
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(value)
  if (!match) return false
  const [, year, month, date] = match
  const calendar = new Date(`${year}-${month}-${date}T00:00:00Z`)
  return Number(year) >= 1 && calendar.getUTCFullYear() === Number(year) &&
    calendar.getUTCMonth() + 1 === Number(month) && calendar.getUTCDate() === Number(date) &&
    Number.isFinite(Date.parse(value))
}

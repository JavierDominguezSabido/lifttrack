import type { Exercise, ExerciseLog, SetLog, WorkoutSession } from '../../types'
import { dayNames } from '../../utils/workout'
import { parseLocalDate, toLocalDateKey } from '../../utils/date'
import type { ImportPayload } from './types'

const REQUIRED_COLUMNS = [
  'fecha',
  'dia',
  'exercise_id',
  'ejercicio',
  'serie',
  'reps',
  'peso',
  'hecha'
]

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  row.push(field.replace(/\r$/, ''))
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function parseNumber(value: string) {
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'sí', 'si'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  return null
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function parseDay(value: string) {
  const numeric = Number(value)
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) return numeric
  const normalized = normalizeText(value)
  return dayNames.findIndex((day) => normalizeText(day) === normalized)
}

function safeDate(value: string) {
  const date = parseLocalDate(value)
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

interface SessionBuilder {
  session: WorkoutSession
  logs: Map<string, ExerciseLog>
}

function parseTargetSetCount(value: string) {
  const match = value.trim().toLowerCase().match(/^\s*[^x×]+\s*[x×]\s*(\d+)\s*$/)
  return match ? Number(match[1]) : null
}

function logCsvDiagnostics(sessions: WorkoutSession[], exerciseMap: Map<string, Exercise>) {
  if (!import.meta.env.DEV) return

  for (const session of sessions) {
    for (const log of session.exerciseLogs) {
      const exerciseName = exerciseMap.get(log.exerciseId)?.name ?? log.exerciseId
      const reps = log.sets.map((set) => set.reps).join('-')
      const weights = [...new Set(log.sets.map((set) => set.weightKg))]
      const weightLabel = weights.length === 1 ? `${weights[0]}` : weights.join('/')
      console.info(
        `[import:csv] ${session.id} / ${exerciseName} / ${log.sets.length} series / ${reps} / ${weightLabel} kg`
      )
    }
  }
}

export function parseWorkoutCsv(text: string, filename: string): ImportPayload {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''))
  if (rows.length === 0) {
    return { source: 'csv', filename, sessions: [], exercises: [], errors: ['El CSV está vacío.'] }
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase())
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column))
  if (missing.length > 0) {
    return {
      source: 'csv',
      filename,
      sessions: [],
      exercises: [],
      errors: [`Faltan columnas obligatorias: ${missing.join(', ')}.`]
    }
  }

  const column = (name: string) => headers.indexOf(name)
  const value = (row: string[], name: string) => {
    const index = column(name)
    return index >= 0 ? row[index] ?? '' : ''
  }
  const errors: string[] = []
  const builders = new Map<string, SessionBuilder>()
  const exerciseMap = new Map<string, Exercise>()

  rows.slice(1).forEach((row, rowIndex) => {
    const line = rowIndex + 2
    const date = safeDate(value(row, 'fecha'))
    const dayOfWeek = parseDay(value(row, 'dia'))
    const exerciseId = value(row, 'exercise_id').trim()
    const exerciseName = value(row, 'ejercicio').trim()
    const setNumber = parseNumber(value(row, 'serie'))
    const reps = parseNumber(value(row, 'reps'))
    const weight = parseNumber(value(row, 'peso'))
    const completed = parseBoolean(value(row, 'hecha'))
    const targetSetCount = parseTargetSetCount(value(row, 'objetivo'))

    if (!date) errors.push(`Fila ${line}: fecha no válida.`)
    if (dayOfWeek < 0) errors.push(`Fila ${line}: día no válido.`)
    if (!exerciseId) errors.push(`Fila ${line}: exercise_id es obligatorio.`)
    if (!exerciseName) errors.push(`Fila ${line}: ejercicio es obligatorio.`)
    if (!setNumber || !Number.isInteger(setNumber) || setNumber < 1) {
      errors.push(`Fila ${line}: serie debe ser un entero mayor que 0.`)
    }
    if (reps === null || reps < 0 || !Number.isInteger(reps)) {
      errors.push(`Fila ${line}: reps debe ser un entero igual o mayor que 0.`)
    }
    if (completed === true && reps === 0) {
      errors.push(`Fila ${line}: una serie hecha debe tener al menos una repetición.`)
    }
    if (weight === null || weight < 0) errors.push(`Fila ${line}: peso no válido.`)
    if (completed === null) errors.push(`Fila ${line}: hecha debe ser true o false.`)
    if (
      !date ||
      dayOfWeek < 0 ||
      !exerciseId ||
      !exerciseName ||
      !setNumber ||
      reps === null ||
      weight === null ||
      completed === null
    ) return

    const explicitSessionId = value(row, 'session_id').trim()
    const dateKey = toLocalDateKey(date)
    const sessionKey = explicitSessionId || `import-${stableHash(`${dateKey}:${dayOfWeek}`)}`
    let builder = builders.get(sessionKey)
    if (!builder) {
      builder = {
        session: {
          id: sessionKey,
          name: dayNames[dayOfWeek] ?? `Día ${dayOfWeek}`,
          dayOfWeek,
          startedAt: date.toISOString(),
          completedAt: date.toISOString(),
          exerciseLogs: []
        },
        logs: new Map()
      }
      builders.set(sessionKey, builder)
    }

    let log = builder.logs.get(exerciseId)
    if (!log) {
      const workingWeight = parseNumber(value(row, 'peso_trabajo'))
      log = {
        id: `${sessionKey}-${exerciseId}`,
        sessionId: sessionKey,
        exerciseId,
        order: builder.logs.size + 1,
        workingWeightKg: workingWeight ?? weight,
        notes: value(row, 'nota').trim() || undefined,
        sets: []
      }
      builder.logs.set(exerciseId, log)
    }

    const set: SetLog = {
      id: `${log.id}-set-${setNumber}`,
      exerciseLogId: log.id,
      setNumber,
      reps,
      weightKg: weight,
      completed
    }
    if (log.sets.some((item) => item.setNumber === setNumber)) {
      errors.push(`Fila ${line}: serie ${setNumber} duplicada para ${exerciseName}.`)
    } else {
      log.sets.push(set)
    }

    if (!exerciseMap.has(exerciseId)) {
      exerciseMap.set(exerciseId, {
        id: exerciseId,
        name: exerciseName,
        targetSets: targetSetCount ?? undefined,
        targetReps: value(row, 'objetivo').split(/[x×]/)[0]?.trim() || undefined,
        active: true
      })
    }
  })

  const sessions = [...builders.values()].map(({ session, logs }) => {
    const exerciseLogs = [...logs.values()].map((log) => ({
      ...log,
      sets: [...log.sets].sort((a, b) => a.setNumber - b.setNumber)
    }))
    const volumeKg = exerciseLogs.reduce(
      (total, log) =>
        total + log.sets.reduce(
          (sum, set) => sum + (set.completed ? set.reps * set.weightKg : 0),
          0
        ),
      0
    )
    return { ...session, volumeKg, exerciseLogs }
  })

  for (const session of sessions) {
    for (const log of session.exerciseLogs) {
      const targetSetCount = exerciseMap.get(log.exerciseId)?.targetSets
      if (targetSetCount && log.sets.length < targetSetCount) {
        const exerciseName = exerciseMap.get(log.exerciseId)?.name ?? log.exerciseId
        console.error(
          `[import:csv] Posible pérdida de series: ${session.id} / ${exerciseName} esperaba ${targetSetCount} y se detectaron ${log.sets.length}.`
        )
      }
    }
  }

  logCsvDiagnostics(sessions, exerciseMap)

  return {
    source: 'csv',
    filename,
    sessions,
    exercises: [...exerciseMap.values()],
    errors
  }
}

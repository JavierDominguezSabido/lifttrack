import type {
  Exercise,
  ExerciseLog,
  MuscleGroup,
  WorkoutSession,
  WorkoutTemplate
} from '../types'

interface RoutineExerciseSeed {
  id: string
  dayOfWeek: number
  name: string
  muscleGroup: MuscleGroup
  equipment?: string
  targetReps: number
  targetSets: number
  restSeconds: number
  lastReps: number[]
  lastWeightKg?: number
  notes?: string
}

const routine: RoutineExerciseSeed[] = [
  { id: 'press-banca', dayOfWeek: 1, name: 'Press banca', muscleGroup: 'Pecho', equipment: 'Barra', targetReps: 8, targetSets: 4, restSeconds: 150, lastReps: [8, 7, 7, 6], lastWeightKg: 65 },
  { id: 'press-inclinado-mancuernas', dayOfWeek: 1, name: 'Press inclinado mancuernas', muscleGroup: 'Pecho', equipment: 'Mancuernas', targetReps: 12, targetSets: 3, restSeconds: 120, lastReps: [12, 12, 12], lastWeightKg: 17, notes: 'Pegar espalda baja' },
  { id: 'fondos-paralelas-pecho-bajo', dayOfWeek: 1, name: 'Fondos en paralelas pecho bajo', muscleGroup: 'Pecho', equipment: 'Paralelas', targetReps: 8, targetSets: 3, restSeconds: 120, lastReps: [8, 8, 8], lastWeightKg: 6 },
  { id: 'aperturas-mancuernas', dayOfWeek: 1, name: 'Aperturas mancuernas', muscleGroup: 'Pecho', equipment: 'Mancuernas', targetReps: 15, targetSets: 3, restSeconds: 90, lastReps: [15, 15, 15], lastWeightKg: 8 },
  { id: 'extension-triceps-sobre-cabeza-lunes', dayOfWeek: 1, name: 'Extensión tríceps por encima de la cabeza', muscleGroup: 'Tríceps', targetReps: 12, targetSets: 3, restSeconds: 90, lastReps: [12, 12, 12], lastWeightKg: 12 },
  { id: 'gemelos-un-pie-chaleco-ligero', dayOfWeek: 1, name: 'Gemelos a un pie con chaleco ligero', muscleGroup: 'Pierna', equipment: 'Chaleco', targetReps: 20, targetSets: 3, restSeconds: 90, lastReps: [20, 16, 15], lastWeightKg: 6 },

  { id: 'dominadas', dayOfWeek: 2, name: 'Dominadas', muscleGroup: 'Espalda', equipment: 'Barra', targetReps: 8, targetSets: 4, restSeconds: 150, lastReps: [8, 8, 8, 8], lastWeightKg: 6 },
  { id: 'remo-barra', dayOfWeek: 2, name: 'Remo con barra', muscleGroup: 'Espalda', equipment: 'Barra', targetReps: 8, targetSets: 4, restSeconds: 150, lastReps: [8, 8, 8, 8], lastWeightKg: 55 },
  { id: 'remo-mancuerna', dayOfWeek: 2, name: 'Remo mancuerna', muscleGroup: 'Espalda', equipment: 'Mancuerna', targetReps: 10, targetSets: 3, restSeconds: 120, lastReps: [10, 10, 10], lastWeightKg: 16 },
  { id: 'curl-biceps-barra-martes', dayOfWeek: 2, name: 'Curl bíceps barra', muscleGroup: 'Bíceps', equipment: 'Barra', targetReps: 10, targetSets: 3, restSeconds: 120, lastReps: [10, 10, 10], lastWeightKg: 30 },
  { id: 'curl-predicador', dayOfWeek: 2, name: 'Curl predicador', muscleGroup: 'Bíceps', targetReps: 12, targetSets: 3, restSeconds: 120, lastReps: [12, 12, 12], lastWeightKg: 20 },
  { id: 'elevaciones-laterales-martes', dayOfWeek: 2, name: 'Elevaciones laterales mancuernas', muscleGroup: 'Hombro', equipment: 'Mancuernas', targetReps: 15, targetSets: 3, restSeconds: 60, lastReps: [15, 15, 15], lastWeightKg: 6 },

  { id: 'sentadilla-barra', dayOfWeek: 3, name: 'Sentadilla barra', muscleGroup: 'Pierna', equipment: 'Barra', targetReps: 8, targetSets: 4, restSeconds: 180, lastReps: [8, 8, 8, 8], lastWeightKg: 65 },
  { id: 'peso-muerto-rumano', dayOfWeek: 3, name: 'Peso muerto rumano', muscleGroup: 'Pierna', equipment: 'Barra', targetReps: 10, targetSets: 3, restSeconds: 150, lastReps: [10, 10, 10], lastWeightKg: 65 },
  { id: 'bulgaras-mancuernas', dayOfWeek: 3, name: 'Búlgaras con mancuernas', muscleGroup: 'Pierna', equipment: 'Mancuernas', targetReps: 10, targetSets: 3, restSeconds: 120, lastReps: [10, 10, 10], lastWeightKg: 20 },
  { id: 'curl-femoral', dayOfWeek: 3, name: 'Curl femoral', muscleGroup: 'Pierna', targetReps: 12, targetSets: 3, restSeconds: 90, lastReps: [12, 12, 12], lastWeightKg: 12.5 },
  { id: 'gemelos-un-pie-chaleco', dayOfWeek: 3, name: 'Gemelos a un pie con chaleco', muscleGroup: 'Pierna', equipment: 'Chaleco', targetReps: 15, targetSets: 4, restSeconds: 90, lastReps: [15, 15, 15, 15], lastWeightKg: 10 },
  { id: 'abdominales', dayOfWeek: 3, name: 'Abdominales', muscleGroup: 'Core', targetReps: 15, targetSets: 3, restSeconds: 60, lastReps: [15, 15, 15], lastWeightKg: 10 },

  { id: 'press-militar-barra', dayOfWeek: 4, name: 'Press militar barra', muscleGroup: 'Hombro', equipment: 'Barra', targetReps: 8, targetSets: 4, restSeconds: 120, lastReps: [8, 8, 8, 8], lastWeightKg: 35 },
  { id: 'elevaciones-laterales-jueves', dayOfWeek: 4, name: 'Elevaciones laterales mancuernas', muscleGroup: 'Hombro', equipment: 'Mancuernas', targetReps: 15, targetSets: 4, restSeconds: 90, lastReps: [15, 15, 15, 15], lastWeightKg: 6 },
  { id: 'pajaros-mancuernas', dayOfWeek: 4, name: 'Pájaros mancuernas', muscleGroup: 'Hombro', equipment: 'Mancuernas', targetReps: 15, targetSets: 3, restSeconds: 60, lastReps: [15, 15, 15], lastWeightKg: 4 },
  { id: 'encogimientos-trapecio', dayOfWeek: 4, name: 'Encogimientos trapecio', muscleGroup: 'Espalda', targetReps: 12, targetSets: 3, restSeconds: 90, lastReps: [12, 12, 12], lastWeightKg: 55 },

  { id: 'press-inclinado-barra', dayOfWeek: 5, name: 'Press inclinado barra', muscleGroup: 'Pecho', equipment: 'Barra', targetReps: 8, targetSets: 4, restSeconds: 150, lastReps: [7, 7, 7, 7], lastWeightKg: 57.5, notes: 'Pegar espalda baja' },
  { id: 'aperturas-inclinadas', dayOfWeek: 5, name: 'Aperturas inclinadas', muscleGroup: 'Pecho', equipment: 'Mancuernas', targetReps: 15, targetSets: 3, restSeconds: 90, lastReps: [15, 15, 15], lastWeightKg: 8 },
  { id: 'dominadas-ligeras', dayOfWeek: 5, name: 'Dominadas ligeras', muscleGroup: 'Espalda', equipment: 'Barra', targetReps: 10, targetSets: 3, restSeconds: 120, lastReps: [8, 8, 8], lastWeightKg: 0 },
  { id: 'curl-barra-viernes', dayOfWeek: 5, name: 'Curl barra', muscleGroup: 'Bíceps', equipment: 'Barra', targetReps: 10, targetSets: 3, restSeconds: 120, lastReps: [10, 10, 10], lastWeightKg: 30 },
  { id: 'curl-martillo', dayOfWeek: 5, name: 'Curl martillo', muscleGroup: 'Bíceps', equipment: 'Mancuernas', targetReps: 12, targetSets: 3, restSeconds: 90, lastReps: [12, 12, 12], lastWeightKg: 10 },
  { id: 'extension-triceps-sobre-cabeza-viernes', dayOfWeek: 5, name: 'Extensión tríceps por encima de la cabeza', muscleGroup: 'Tríceps', targetReps: 12, targetSets: 3, restSeconds: 90, lastReps: [12, 12, 12], lastWeightKg: 12 }
]

export const exercises: Exercise[] = routine.map((exercise) => ({
  ...exercise,
  targetReps: String(exercise.targetReps),
  active: true
}))

const templateNames: Record<number, { id: string; name: string; notes: string }> = {
  1: { id: 'lunes', name: 'Lunes', notes: 'Pecho, tríceps y gemelos' },
  2: { id: 'martes', name: 'Martes', notes: 'Espalda, bíceps y hombro' },
  3: { id: 'miercoles', name: 'Miércoles', notes: 'Pierna y abdominales' },
  4: { id: 'jueves', name: 'Jueves', notes: 'Hombro y trapecio' },
  5: { id: 'viernes', name: 'Viernes', notes: 'Pecho, espalda y brazos' }
}

export const templates: WorkoutTemplate[] = Object.entries(templateNames).map(([day, meta]) => {
  const dayOfWeek = Number(day)
  return {
    ...meta,
    dayOfWeek,
    exercises: routine
      .filter((exercise) => exercise.dayOfWeek === dayOfWeek)
      .map((exercise, index) => ({
        id: `${meta.id}-${exercise.id}`,
        templateId: meta.id,
        exerciseId: exercise.id,
        order: index + 1,
        targetSets: exercise.targetSets,
        targetReps: String(exercise.targetReps),
        restSeconds: exercise.restSeconds
      }))
  }
})

const sessionDates: Record<number, string> = {
  1: '2026-06-29T18:30:00.000Z',
  2: '2026-06-30T18:30:00.000Z',
  3: '2026-07-01T18:30:00.000Z',
  4: '2026-07-02T18:30:00.000Z',
  5: '2026-07-03T18:30:00.000Z'
}

function createInitialLog(exercise: RoutineExerciseSeed, sessionId: string, order: number): ExerciseLog {
  const logId = `${sessionId}-${exercise.id}`
  const weightKg = exercise.lastWeightKg ?? 0
  return {
    id: logId,
    sessionId,
    exerciseId: exercise.id,
    order,
    workingWeightKg: weightKg,
    notes: exercise.notes,
    sets: exercise.lastReps.map((reps, index) => ({
      id: `${logId}-set-${index + 1}`,
      exerciseLogId: logId,
      setNumber: index + 1,
      reps,
      weightKg,
      completed: true
    }))
  }
}

export const initialSessions: WorkoutSession[] = templates.map((template) => {
  const sessionId = `initial-${template.id}`
  const completedAt = sessionDates[template.dayOfWeek]
  const exerciseLogs = routine
    .filter((exercise) => exercise.dayOfWeek === template.dayOfWeek)
    .map((exercise, index) => createInitialLog(exercise, sessionId, index + 1))
  return {
    id: sessionId,
    templateId: template.id,
    name: template.name,
    dayOfWeek: template.dayOfWeek,
    startedAt: new Date(new Date(completedAt).getTime() - 65 * 60_000).toISOString(),
    completedAt,
    durationMinutes: 65,
    volumeKg: exerciseLogs.reduce(
      (total, log) =>
        total + log.sets.reduce((sum, set) => sum + set.reps * set.weightKg, 0),
      0
    ),
    exerciseLogs
  }
})

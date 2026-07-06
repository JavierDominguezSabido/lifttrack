export type MuscleGroup =
  | 'Pecho'
  | 'Espalda'
  | 'Pierna'
  | 'Hombro'
  | 'Bíceps'
  | 'Tríceps'
  | 'Core'

export interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
  equipment?: string
  dayOfWeek: number
  targetSets: number
  targetReps: string
  restSeconds: number
  lastReps: number[]
  lastWeightKg?: number
  notes?: string
}

export interface WorkoutTemplate {
  id: string
  name: string
  dayOfWeek: number
  notes?: string
  exercises: WorkoutTemplateExercise[]
}

export interface WorkoutTemplateExercise {
  id: string
  templateId: string
  exerciseId: string
  order: number
  targetSets: number
  targetReps: string
  restSeconds?: number
}

export interface WorkoutSession {
  id: string
  templateId?: string
  name: string
  dayOfWeek: number
  startedAt: string
  completedAt?: string
  durationMinutes?: number
  volumeKg?: number
  exerciseLogs: ExerciseLog[]
  notes?: string
}

export interface LastExercisePerformance {
  exerciseId: string
  sessionId: string
  performedAt: string
  weightKg: number
  reps: number[]
}

export interface ExerciseLog {
  id: string
  sessionId: string
  exerciseId: string
  order: number
  /** Peso base aplicado a las series del ejercicio. */
  workingWeightKg?: number
  sets: SetLog[]
  notes?: string
}

export interface SetLog {
  id: string
  exerciseLogId: string
  setNumber: number
  reps: number
  /** Peso efectivo que se registra para esta serie. */
  weightKg: number
  /** Permite una excepción al peso de trabajo en una futura edición avanzada. */
  weightOverrideKg?: number
  completed: boolean
  isWarmup?: boolean
}

/** Estado editable: las repeticiones siguen siendo texto hasta guardar. */
export interface DraftSetLog extends Omit<SetLog, 'reps'> {
  reps: string
}

export interface DraftExerciseLog extends Omit<ExerciseLog, 'sets'> {
  sets: DraftSetLog[]
}

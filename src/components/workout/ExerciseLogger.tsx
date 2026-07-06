import {
  Check,
  CheckCheck,
  Clock3,
  Minus,
  Plus,
  RotateCcw,
  Sparkles
} from 'lucide-react'
import {
  formatRestSeconds,
  getProgressionSuggestion
} from '../../utils/workout'
import {
  applyWorkingWeight,
  getWorkingWeight,
  normalizeRepsInput,
  setAllSetsCompleted
} from '../../utils/workoutDraft'
import type {
  DraftExerciseLog,
  DraftSetLog,
  Exercise,
  LastExercisePerformance,
  WorkoutTemplateExercise
} from '../../types'

interface ExerciseLoggerProps {
  templateExercise: WorkoutTemplateExercise
  log: DraftExerciseLog
  previousPerformance: LastExercisePerformance | null
  onChange: (log: DraftExerciseLog) => void
  exercise?: Exercise
}

export function ExerciseLogger({
  templateExercise,
  log,
  previousPerformance,
  onChange,
  exercise
}: ExerciseLoggerProps) {
  if (!exercise) return null

  const workingWeight = getWorkingWeight(log)
  const suggestion = previousPerformance
    ? getProgressionSuggestion(previousPerformance, templateExercise)
    : null

  function setWorkingWeight(value: number) {
    onChange(applyWorkingWeight(log, value))
  }

  function updateSet(setId: string, changes: Partial<DraftSetLog>) {
    onChange({
      ...log,
      sets: log.sets.map((set) => set.id === setId ? { ...set, ...changes } : set)
    })
  }

  function addSet() {
    const lastSet = log.sets[log.sets.length - 1]
    const setNumber = log.sets.length + 1
    onChange({
      ...log,
      sets: [
        ...log.sets,
        {
          id: `${log.id}-set-${setNumber}`,
          exerciseLogId: log.id,
          setNumber,
          reps: lastSet?.reps ?? templateExercise.targetReps ?? '8',
          weightKg: workingWeight,
          completed: false
        }
      ]
    })
  }

  function removeSet() {
    if (log.sets.length <= 1) return
    onChange({ ...log, sets: log.sets.slice(0, -1) })
  }

  return (
    <article className="card overflow-hidden">
      <header className="border-b border-line px-4 py-5 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-brand">
              {exercise.muscleGroup}
            </p>
            <h3 className="mt-1 text-xl font-extrabold leading-tight tracking-tight text-ink">
              {exercise.name}
            </h3>
          </div>
          {exercise.equipment && (
            <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-bold text-secondary">
              {exercise.equipment}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted px-3 py-2.5">
            <p className="text-xs font-semibold text-secondary">Objetivo</p>
            <p className="mt-0.5 font-extrabold text-ink">
              {templateExercise.targetReps} × {templateExercise.targetSets}
            </p>
          </div>
          <div className="rounded-xl bg-muted px-3 py-2.5">
            <p className="flex items-center gap-1 text-xs font-semibold text-secondary">
              <Clock3 className="size-3.5" aria-hidden="true" />
              Descanso
            </p>
            <p className="mt-0.5 font-extrabold text-ink">
              {formatRestSeconds(templateExercise.restSeconds)}
            </p>
          </div>
        </div>

        {previousPerformance && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-secondary">
              <span className="font-semibold text-subtle">Última vez:</span>{' '}
              <strong className="text-ink">{previousPerformance.reps.join('-')}</strong>
              {previousPerformance.weightKg > 0
                ? ` con ${previousPerformance.weightKg} kg`
                : ' sin peso añadido'}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {suggestion}
            </span>
          </div>
        )}

        {exercise.notes && (
          <p className="mt-3 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm font-medium text-warning-text">
            <span className="font-bold">Técnica:</span> {exercise.notes}
          </p>
        )}

        {templateExercise.notes && (
          <p className="mt-3 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2.5 text-sm font-medium text-ink">
            <span className="font-bold">Rutina:</span> {templateExercise.notes}
          </p>
        )}
      </header>

      <div className="p-4 sm:p-5">
        <section aria-labelledby={`weight-label-${log.id}`} className="rounded-2xl border border-brand/40 bg-brand-soft/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <label
              id={`weight-label-${log.id}`}
              htmlFor={`weight-${log.id}`}
              className="text-sm font-bold text-ink"
            >
              Peso de trabajo
            </label>
            <span className="text-xs font-semibold text-brand">Se aplica a todas las series</span>
          </div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="relative">
              <input
                id={`weight-${log.id}`}
                className="min-h-12 w-full rounded-xl border border-control bg-raised py-2 pl-4 pr-12 text-center text-xl font-extrabold text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand-soft"
                aria-label={`Peso de trabajo para ${exercise.name}, en kilogramos`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.25"
                value={workingWeight || ''}
                placeholder="0"
                onChange={(event) => setWorkingWeight(Number(event.target.value))}
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-secondary">
                kg
              </span>
            </div>
            <button
              type="button"
              onClick={() => setWorkingWeight(workingWeight + 1.25)}
              className="min-h-12 whitespace-nowrap rounded-xl bg-brand-solid px-4 text-sm font-extrabold text-on-brand shadow-sm transition hover:bg-brand-solid-hover active:scale-[0.98]"
              aria-label={`Sumar 1,25 kg al peso de ${exercise.name}`}
            >
              +1.25 kg
            </button>
          </div>
        </section>

        <section aria-labelledby={`sets-title-${log.id}`} className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 id={`sets-title-${log.id}`} className="font-extrabold text-ink">Series</h4>
              <p className="text-xs font-medium text-secondary">
                {log.sets.filter((set) => set.completed).length} de {log.sets.length} realizadas
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange(setAllSetsCompleted(log, true))}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-success/40 bg-success-soft px-2 text-xs font-extrabold leading-tight text-success-text transition hover:brightness-95 active:scale-[0.98]"
            >
              <CheckCheck className="size-4 shrink-0" aria-hidden="true" />
              Marcar todas como hechas
            </button>
            <button
              type="button"
              onClick={() => onChange(setAllSetsCompleted(log, false))}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-control bg-raised px-2 text-xs font-bold leading-tight text-secondary transition hover:bg-muted active:scale-[0.98]"
            >
              <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
              Desmarcar todas
            </button>
          </div>

          <div className="mb-2 mt-4 grid grid-cols-[56px_minmax(0,1fr)_52px] items-end gap-2 px-1 text-center text-xs font-bold text-secondary">
            <span>Serie</span>
            <span>Repeticiones</span>
            <span>Estado</span>
          </div>
          <div className="space-y-2.5">
            {log.sets.map((set) => (
              <div
                key={set.id}
                className={`grid grid-cols-[56px_minmax(0,1fr)_52px] items-center gap-2 rounded-2xl border p-2 transition ${
                  set.completed
                    ? 'border-success/40 bg-success-soft'
                    : 'border-line bg-muted'
                }`}
              >
                <div className="text-center">
                  <span className="block text-base font-extrabold text-ink">{set.setNumber}</span>
                  <span className={`text-[11px] font-bold ${set.completed ? 'text-success-text' : 'text-secondary'}`}>
                    {set.completed ? 'Hecha' : 'Pendiente'}
                  </span>
                </div>
                <div className="relative">
                  <label className="sr-only" htmlFor={`reps-${set.id}`}>
                    Repeticiones de la serie {set.setNumber} de {exercise.name}
                  </label>
                  <input
                    id={`reps-${set.id}`}
                    className="input !pr-14"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={set.reps}
                    onChange={(event) => updateSet(set.id, {
                      reps: normalizeRepsInput(event.target.value)
                    })}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-secondary">
                    reps
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`${set.completed ? 'Marcar como pendiente' : 'Marcar como hecha'} la serie ${set.setNumber}`}
                  aria-pressed={set.completed}
                  onClick={() => updateSet(set.id, { completed: !set.completed })}
                  className={`grid size-12 place-items-center rounded-xl border-2 transition active:scale-95 ${
                    set.completed
                      ? 'border-success-solid bg-success-solid text-on-brand shadow-sm'
                      : 'border-control bg-raised text-subtle hover:border-success hover:text-success'
                  }`}
                >
                  <Check className="size-6" strokeWidth={3} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_48px] gap-2">
            <button type="button" onClick={addSet} className="btn-secondary">
              <Plus className="size-4" aria-hidden="true" />
              Añadir serie
            </button>
            <button
              type="button"
              onClick={removeSet}
              disabled={log.sets.length <= 1}
              className="btn-secondary !px-0 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Quitar última serie"
            >
              <Minus className="size-5" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </article>
  )
}

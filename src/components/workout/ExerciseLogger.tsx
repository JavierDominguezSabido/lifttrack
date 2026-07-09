import {
  Check,
  CheckCheck,
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
  const completedSets = log.sets.filter((set) => set.completed).length
  const isCompleted = log.sets.length > 0 && completedSets === log.sets.length
  const suggestion = previousPerformance
    ? getProgressionSuggestion(previousPerformance, templateExercise)
    : null
  const targetLabel = `${templateExercise.targetReps}x${templateExercise.targetSets}`

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
    <article className={`card overflow-hidden transition ${isCompleted ? '!border-success/45' : ''}`}>
      <header className="border-b border-line/70 px-3.5 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold leading-tight tracking-tight text-ink sm:text-lg">
                {exercise.name}
              </h3>
              {isCompleted && (
                <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-[11px] font-extrabold text-success-text">
                  <Check className="size-3.5" aria-hidden="true" />
                  Completado
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-semibold text-secondary sm:text-sm">
              Objetivo {targetLabel} · Descanso {formatRestSeconds(templateExercise.restSeconds)}
            </p>
          </div>
          {exercise.equipment && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-bold text-secondary">
              {exercise.equipment}
            </span>
          )}
        </div>

        {previousPerformance && (
          <div className="mt-2 rounded-lg bg-muted/70 px-3 py-2 text-sm">
            <p className="leading-5 text-secondary">
              <span className="font-semibold text-subtle">Última vez:</span>{' '}
              <strong className="text-ink">{previousPerformance.reps.join('-')}</strong>
              {previousPerformance.weightKg > 0
                ? ` con ${previousPerformance.weightKg} kg`
                : ' sin peso añadido'}
            </p>
            {suggestion && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-brand">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Sugerencia: {suggestion}
              </p>
            )}
          </div>
        )}

        {(exercise.notes || templateExercise.notes) && (
          <div className="mt-2 space-y-1.5">
            {exercise.notes && (
              <p className="rounded-lg border border-warning/30 bg-warning-soft/80 px-3 py-2 text-sm font-medium text-warning-text">
                <span className="font-bold">Técnica:</span> {exercise.notes}
              </p>
            )}
            {templateExercise.notes && (
              <p className="rounded-lg border border-brand/20 bg-brand-soft/60 px-3 py-2 text-sm font-medium text-ink">
                <span className="font-bold">Rutina:</span> {templateExercise.notes}
              </p>
            )}
          </div>
        )}
      </header>

      <div className="space-y-3 p-3.5 sm:p-4">
        <section aria-labelledby={`weight-label-${log.id}`} className="rounded-xl bg-muted/55 p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <label className="min-w-0">
              <span
                id={`weight-label-${log.id}`}
                className="mb-1 block text-sm font-bold text-ink"
              >
                Peso de trabajo
              </span>
              <span className="relative block">
                <input
                  id={`weight-${log.id}`}
                  className="min-h-11 w-full rounded-xl border border-control bg-raised py-2 pl-3 pr-10 text-base font-extrabold text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand-soft"
                  aria-label={`Peso de trabajo para ${exercise.name}, en kilogramos`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.25"
                  value={String(workingWeight)}
                  onChange={(event) => setWorkingWeight(Number(event.target.value))}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-secondary">
                  kg
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => setWorkingWeight(workingWeight + 1.25)}
              className="min-h-11 whitespace-nowrap rounded-lg bg-brand-solid px-3 text-sm font-extrabold text-on-brand shadow-sm transition hover:bg-brand-solid-hover active:scale-[0.98]"
              aria-label={`Sumar 1,25 kg al peso de ${exercise.name}`}
            >
              +1.25 kg
            </button>
          </div>
        </section>

        <section aria-labelledby={`sets-title-${log.id}`}>
          <div className="mb-2 grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
            <div>
              <h4 id={`sets-title-${log.id}`} className="font-extrabold text-ink">Series</h4>
              <p className="text-xs font-medium text-secondary">
                {completedSets}/{log.sets.length} hechas
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onChange(setAllSetsCompleted(log, true))}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success-soft/80 px-2.5 text-xs font-extrabold leading-tight text-success-text transition hover:brightness-95 active:scale-[0.98]"
              >
                <CheckCheck className="size-4 shrink-0" aria-hidden="true" />
                Marcar todas
              </button>
              <button
                type="button"
                onClick={() => onChange(setAllSetsCompleted(log, false))}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 text-xs font-bold leading-tight text-secondary transition hover:bg-muted active:scale-[0.98]"
              >
                <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
                Desmarcar
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {log.sets.map((set) => (
              <div
                key={set.id}
                className={`grid grid-cols-[28px_minmax(0,1fr)_92px] items-center gap-2 rounded-xl border px-2 py-1.5 transition sm:grid-cols-[32px_minmax(0,1fr)_100px] sm:px-2.5 ${
                  set.completed
                    ? 'border-success/25 bg-success-soft/55'
                    : 'border-line/70 bg-raised'
                }`}
              >
                <span className="text-center text-base font-extrabold text-ink">
                  {set.setNumber}
                </span>
                <div className="relative">
                  <label className="sr-only" htmlFor={`reps-${set.id}`}>
                    Repeticiones de la serie {set.setNumber} de {exercise.name}
                  </label>
                  <input
                    id={`reps-${set.id}`}
                    className="min-h-10 w-full rounded-lg border border-control bg-surface py-2 pl-3 pr-14 text-base font-bold text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand-soft"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={set.reps}
                    placeholder="0"
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
                  className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border px-1.5 text-xs font-extrabold transition active:scale-95 sm:gap-1.5 sm:px-2 ${
                    set.completed
                      ? 'border-success-solid bg-success-solid text-on-brand shadow-sm'
                      : 'border-control bg-raised text-secondary hover:border-success hover:text-success'
                  }`}
                >
                  <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                  {set.completed ? 'Hecha' : 'Pendiente'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-[1fr_44px] gap-2">
            <button type="button" onClick={addSet} className="btn-secondary !min-h-10">
              <Plus className="size-4" aria-hidden="true" />
              Añadir serie
            </button>
            <button
              type="button"
              onClick={removeSet}
              disabled={log.sets.length <= 1}
              className="btn-secondary !min-h-10 !px-0 disabled:cursor-not-allowed disabled:opacity-40"
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

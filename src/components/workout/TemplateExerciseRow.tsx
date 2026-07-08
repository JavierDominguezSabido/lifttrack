import { Clock3 } from 'lucide-react'
import { formatRestSeconds } from '../../utils/workout'
import type { Exercise, WorkoutTemplateExercise } from '../../types'

export function TemplateExerciseRow({
  item,
  exercise
}: {
  item: WorkoutTemplateExercise
  exercise?: Exercise
}) {
  if (!exercise) return null

  return (
    <div className="flex min-h-16 items-center gap-3 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-sm font-extrabold text-secondary">
        {item.order}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-extrabold leading-tight text-ink">{exercise.name}</p>
        <p className="mt-1 text-xs font-medium text-secondary">
          {exercise.muscleGroup}{exercise.equipment ? ` · ${exercise.equipment}` : ''}
        </p>
      </div>
      <div className="shrink-0 pl-1 text-right">
        <p className="text-sm font-extrabold text-ink">{item.targetReps} × {item.targetSets}</p>
        {item.restSeconds && (
          <p className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-secondary">
            <Clock3 className="size-3" />
            {formatRestSeconds(item.restSeconds)}
          </p>
        )}
      </div>
    </div>
  )
}

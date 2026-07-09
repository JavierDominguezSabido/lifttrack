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
    <div className="flex min-h-14 items-center gap-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-extrabold text-secondary">
        {item.order}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-extrabold leading-tight text-ink">{exercise.name}</p>
        <p className="mt-0.5 text-xs font-medium text-secondary">
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

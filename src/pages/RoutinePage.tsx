import { CalendarDays, Dumbbell, Play } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TemplateExerciseRow } from '../components/workout/TemplateExerciseRow'
import { useWorkouts } from '../context/WorkoutContext'
import { dayNames, shortDayNames } from '../utils/workout'

const weekOrder = [1, 2, 3, 4, 5, 6, 0]

export function RoutinePage() {
  const { templates, getExerciseById } = useWorkouts()
  const orderedTemplates = [...templates].sort(
    (a, b) => weekOrder.indexOf(a.dayOfWeek) - weekOrder.indexOf(b.dayOfWeek)
  )
  const trainingDays = new Set(
    templates.filter((template) => template.exercises.length > 0).map((template) => template.dayOfWeek)
  )
  const today = new Date().getDay()
  const initialOpenTemplateId =
    orderedTemplates.find((template) => template.dayOfWeek === today && template.exercises.length > 0)?.id ??
    orderedTemplates.find((template) => template.dayOfWeek >= today && template.exercises.length > 0)?.id ??
    orderedTemplates.find((template) => template.exercises.length > 0)?.id ??
    orderedTemplates[0]?.id
  const [openTemplateId, setOpenTemplateId] = useState(initialOpenTemplateId)

  if (!templates.some((template) => template.exercises.length > 0)) {
    return (
      <section className="card grid min-h-64 place-items-center p-6 text-center">
        <div>
          <Dumbbell className="mx-auto size-9 text-brand" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-extrabold text-ink">Todavía no tienes una rutina</h2>
          <p className="mt-1 text-sm text-secondary">Crea tus días y elige ejercicios para empezar.</p>
          <Link to="/rutina/editar" className="btn-primary mt-5">Crear mi rutina</Link>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <section aria-labelledby="week-overview-title" className="card p-3.5 md:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id="week-overview-title" className="text-sm font-extrabold text-ink">Vista semanal</h2>
          <nav aria-label="Gestionar rutina" className="flex items-center gap-4">
            <Link to="/rutina/ejercicios" className="inline-flex min-h-11 items-center text-sm font-semibold text-secondary hover:text-ink">Ejercicios</Link>
            <Link to="/rutina/editar" className="inline-flex min-h-11 items-center text-sm font-semibold text-secondary hover:text-ink">Editar rutina</Link>
          </nav>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {shortDayNames.slice(1).concat(shortDayNames[0]).map((day, index) => {
            const dayIndex = (index + 1) % 7
            const active = trainingDays.has(dayIndex)
            return (
              <div key={`${day}-${index}`} className="text-center">
                <p className="mb-2 text-xs font-bold text-secondary">{day}</p>
                <div className={`mx-auto grid size-9 place-items-center rounded-lg text-sm font-bold ${
                  active ? 'bg-brand-solid text-on-brand shadow-sm' : 'bg-muted text-subtle'
                }`}>
                  {active ? <Dumbbell className="size-4" aria-hidden="true" /> : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-label="Rutina semanal" className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {orderedTemplates.map((template) => {
          const isOpen = openTemplateId === template.id

          return (
          <article key={template.id} className="card flex flex-col overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenTemplateId((current) => current === template.id ? '' : template.id)}
              className="flex min-h-16 items-center justify-between gap-3 border-b border-line/70 p-4 text-left "
              aria-expanded={isOpen}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {dayNames[template.dayOfWeek]}
                </span>
                <span className="mt-1 block truncate text-xl font-extrabold tracking-tight text-ink">
                  {template.name}
                </span>
                {template.notes && (
                  <span className="mt-0.5 block truncate text-sm font-medium text-secondary">{template.notes}</span>
                )}
              </span>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-extrabold text-secondary">
                {template.exercises.length} ejercicios
              </span>
            </button>

            <div className={`${isOpen ? 'block' : 'hidden'} flex-1 divide-y divide-line/70 px-4 py-1`}>
              {template.exercises.map((item) => {
                const exercise = getExerciseById(item.exerciseId)
                return (
                  <div key={item.id}>
                    <TemplateExerciseRow item={item} exercise={exercise} />
                    {(exercise?.notes || item.notes) && (
                      <div className="-mt-1 mb-2 ml-11 space-y-1.5">
                        {exercise?.notes && (
                          <p className="rounded-lg bg-warning-soft px-2.5 py-2 text-xs font-medium text-warning-text">
                            <strong>Técnica:</strong> {exercise.notes}
                          </p>
                        )}
                        {item.notes && (
                          <p className="rounded-lg bg-brand-soft px-2.5 py-2 text-xs font-medium text-ink">
                            <strong>Rutina:</strong> {item.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {template.exercises.length === 0 && (
                <p className="py-8 text-center text-sm font-medium text-secondary">
                  Día sin ejercicios.
                </p>
              )}
            </div>

            <footer className="p-3.5 pt-2">
              {template.exercises.length > 0 ? (
                <Link
                  to={`/entrenamiento/${template.id}`}
                  className="btn-primary w-full"
                >
                  <Play className="size-4" aria-hidden="true" />
                  Entrenar {template.name.toLowerCase()}
                </Link>
              ) : (
                <p className="py-2 text-center text-sm text-secondary">Descanso</p>
              )}
              <Link to={`/rutina/editar#${encodeURIComponent(template.id)}`} className="btn-secondary mt-2 w-full">Editar día</Link>
            </footer>
          </article>
          )
        })}
      </section>


    </div>
  )
}

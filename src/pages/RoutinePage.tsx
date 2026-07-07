import { CalendarDays, Clock3, Dumbbell, Play } from 'lucide-react'
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

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-base leading-6 text-secondary">
          Consulta tu planificación semanal y empieza el entrenamiento de cada día.
        </p>
        <Link to="/configuracion" className="btn-secondary">
          Configurar rutina
        </Link>
      </div>

      <section aria-labelledby="week-overview-title" className="card p-4 md:p-5">
        <h2 id="week-overview-title" className="mb-4 text-sm font-extrabold text-ink">
          Vista semanal
        </h2>
        <div className="grid grid-cols-7 gap-2">
          {shortDayNames.slice(1).concat(shortDayNames[0]).map((day, index) => {
            const dayIndex = (index + 1) % 7
            const active = trainingDays.has(dayIndex)
            return (
              <div key={`${day}-${index}`} className="text-center">
                <p className="mb-2 text-xs font-bold text-secondary">{day}</p>
                <div className={`mx-auto grid size-10 place-items-center rounded-xl text-sm font-bold ${
                  active ? 'bg-hero text-hero-accent shadow-sm' : 'bg-muted text-subtle'
                }`}>
                  {active ? <Dumbbell className="size-4" aria-hidden="true" /> : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-label="Rutina semanal" className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {orderedTemplates.map((template) => (
          <article key={template.id} className="card flex flex-col overflow-hidden">
            <header className="border-b border-line bg-muted/40 p-5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {dayNames[template.dayOfWeek]}
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">
                {template.name}
              </h2>
              {template.notes && (
                <p className="mt-1 text-sm font-medium text-secondary">{template.notes}</p>
              )}
            </header>

            <div className="flex-1 divide-y divide-line px-5 py-1">
              {template.exercises.map((item) => {
                const exercise = getExerciseById(item.exerciseId)
                return (
                  <div key={item.id}>
                    <TemplateExerciseRow item={item} exercise={exercise} />
                    {(exercise?.notes || item.notes) && (
                      <div className="-mt-2 mb-3 ml-[52px] space-y-1.5">
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

            <footer className="p-4 pt-2">
              {template.exercises.length > 0 ? (
                <Link
                  to={`/entrenamiento/${template.id}`}
                  className="btn-primary w-full"
                >
                  <Play className="size-4" aria-hidden="true" />
                  Entrenar {template.name.toLowerCase()}
                </Link>
              ) : (
                <Link to="/configuracion" className="btn-secondary w-full">
                  Añadir ejercicios
                </Link>
              )}
            </footer>
          </article>
        ))}
      </section>

      <p className="flex items-center gap-2 text-xs font-medium text-secondary">
        <Clock3 className="size-4" aria-hidden="true" />
        Objetivos y descansos se gestionan desde Configuración.
      </p>
    </div>
  )
}

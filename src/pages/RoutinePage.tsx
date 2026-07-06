import { CalendarDays, ChevronRight, Dumbbell, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TemplateExerciseRow } from '../components/workout/TemplateExerciseRow'
import { templates } from '../data/mockData'
import { dayNames, shortDayNames } from '../utils/workout'

export function RoutinePage() {
  const trainingDays = new Set(templates.map((template) => template.dayOfWeek))

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <p className="max-w-xl text-base leading-6 text-secondary">
          Rutina de fuerza de lunes a viernes.
        </p>
      </div>

      <section aria-labelledby="week-overview-title" className="card p-4 md:p-5">
        <h2 id="week-overview-title" className="mb-4 text-sm font-extrabold text-ink">Vista semanal</h2>
        <div className="grid grid-cols-7 gap-2">
          {shortDayNames.slice(1).concat(shortDayNames[0]).map((day, index) => {
            const dayIndex = (index + 1) % 7
            const active = trainingDays.has(dayIndex)
            return (
              <div key={`${day}-${index}`} className="text-center">
                <p className="mb-2 text-xs font-bold text-secondary">{day}</p>
                <div className={`mx-auto grid size-10 place-items-center rounded-xl text-sm font-bold ${
                  active ? 'bg-hero text-brand shadow-sm' : 'bg-muted text-subtle'
                }`}>
                  {active ? <Dumbbell className="size-4" aria-hidden="true" /> : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-label="Entrenamientos por día" className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {templates.map((template, index) => (
          <article key={template.id} className="card flex flex-col overflow-hidden">
            <div className="border-b border-line bg-muted/40 p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-brand">
                  Día {index + 1}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-subtle">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {dayNames[template.dayOfWeek]}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">{template.name}</h2>
              <p className="mt-1 text-sm font-medium text-secondary">{template.notes}</p>
            </div>

            <div className="flex-1 divide-y divide-line px-5 py-1">
              {template.exercises.map((item) => (
                <TemplateExerciseRow key={item.id} item={item} />
              ))}
            </div>

            <div className="p-4 pt-2">
              <Link to={`/entrenamiento/${template.id}`} className="btn-secondary w-full hover:!border-brand hover:!bg-brand-soft hover:!text-brand">
                <Play className="size-4 fill-current" aria-hidden="true" />
                Iniciar entrenamiento
                <ChevronRight className="ml-auto size-4 text-secondary" aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

import { ArrowRight, CalendarCheck, Clock3, Dumbbell, Flame, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProgressRing } from '../components/ui/ProgressRing'
import { TemplateExerciseRow } from '../components/workout/TemplateExerciseRow'
import { templates } from '../data/mockData'
import { useWorkouts } from '../context/WorkoutContext'
import {
  formatCompactNumber,
  getCurrentWeekSessions,
  getSessionVolume,
  getTodayTemplate,
  isInitialSession
} from '../utils/workout'

export function DashboardPage() {
  const { sessions } = useWorkouts()
  const todayTemplate = getTodayTemplate(templates)
  const recentSessions = [...sessions]
    .filter((session) => session.completedAt && !isInitialSession(session.id))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const weeklySessions = getCurrentWeekSessions(sessions)
  const weeklyVolume = weeklySessions.reduce((sum, session) => sum + getSessionVolume(session), 0)
  const weeklyMinutes = weeklySessions.reduce(
    (sum, session) => sum + (session.durationMinutes ?? 0),
    0
  )

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-hero text-on-hero shadow-card">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-hero-accent/15" />
        <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
          <div>
            <p className="eyebrow !text-hero-accent">Tu próximo entrenamiento</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">{todayTemplate.name}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-hero-muted">{todayTemplate.notes}</p>
            <div className="mt-5 flex flex-wrap gap-4 text-sm text-hero-muted">
              <span className="flex items-center gap-2"><Dumbbell className="size-4 text-hero-accent" />{todayTemplate.exercises.length} ejercicios</span>
              <span className="flex items-center gap-2"><Clock3 className="size-4 text-hero-accent" />~65 minutos</span>
            </div>
          </div>
          <Link
            to={`/entrenamiento/${todayTemplate.id}`}
            className="btn-primary self-end !min-h-12 !text-base md:min-w-44"
          >
            Entrenar hoy
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={CalendarCheck} label="Esta semana" value={String(weeklySessions.length)} suffix="sesiones" tone="orange" />
        <StatCard icon={Flame} label="Volumen total" value={formatCompactNumber(weeklyVolume)} suffix="kg" tone="blue" />
        <StatCard icon={Clock3} label="Tiempo entrenado" value={String(weeklyMinutes)} suffix="min" tone="green" />
        <StatCard icon={Trophy} label="Racha actual" value="3" suffix="semanas" tone="purple" />
      </section>

      <section aria-labelledby="weekly-workouts-title">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="eyebrow">Plan semanal</p>
            <h3 id="weekly-workouts-title" className="mt-1 text-xl font-extrabold tracking-tight">
              Tus entrenamientos
            </h3>
          </div>
          <Link to="/rutina" className="text-sm font-bold text-brand hover:text-brand-hover">
            Ver rutina
          </Link>
        </div>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:px-0">
          {templates.map((template) => (
            <Link
              key={template.id}
              to={`/entrenamiento/${template.id}`}
              className={`card min-w-36 snap-start p-4 transition hover:-translate-y-0.5 hover:border-brand ${
                template.id === todayTemplate.id ? '!border-brand ring-2 ring-brand-soft' : ''
              }`}
            >
              <p className="text-xs font-extrabold uppercase tracking-wider text-brand">
                {template.name}
              </p>
              <p className="mt-2 text-2xl font-extrabold text-ink">{template.exercises.length}</p>
              <p className="text-xs font-medium text-secondary">ejercicios</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="card p-5 md:p-6">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="eyebrow">Próxima sesión</p>
              <h3 className="mt-1 text-xl font-extrabold">{todayTemplate.name}</h3>
            </div>
            <Link to={`/entrenamiento/${todayTemplate.id}`} className="text-sm font-bold text-brand hover:text-brand-hover">Empezar</Link>
          </div>
          <div className="divide-y divide-line">
            {todayTemplate.exercises.slice(0, 4).map((item) => (
              <TemplateExerciseRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="card p-5 md:p-6">
          <p className="eyebrow">Objetivo semanal</p>
          <div className="mt-6">
            <ProgressRing
              value={(weeklySessions.length / templates.length) * 100}
              label={`${weeklySessions.length} de ${templates.length} sesiones`}
              detail="Progreso de la rutina semanal."
            />
          </div>
          <div className="mt-7 border-t border-line pt-5">
            <p className="text-sm font-bold">Última sesión</p>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-muted p-3">
              <div>
                <p className="text-sm font-semibold">{recentSessions[0]?.name ?? 'Sin sesiones'}</p>
                <p className="text-xs text-secondary">{recentSessions[0]?.durationMinutes ?? 0} min</p>
              </div>
              <span className="rounded-lg bg-success-soft px-2 py-1 text-xs font-bold text-success-text">Completada</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

const tones = {
  orange: 'bg-brand-soft text-brand',
  blue: 'bg-warning-soft text-warning-text',
  green: 'bg-success-soft text-success-text',
  purple: 'bg-brand-soft text-brand'
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  tone
}: {
  icon: typeof Dumbbell
  label: string
  value: string
  suffix: string
  tone: keyof typeof tones
}) {
  return (
    <div className="card flex min-h-24 items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl sm:size-11 ${tones[tone]}`}>
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-semibold leading-tight text-secondary">{label}</p>
        <p className="mt-1 text-lg font-extrabold leading-tight sm:text-xl">{value} <span className="block text-[11px] font-semibold text-secondary sm:inline sm:text-xs">{suffix}</span></p>
      </div>
    </div>
  )
}

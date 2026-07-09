import { ArrowRight, CalendarCheck, CheckCircle2, Dumbbell, Flame, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ProgressRing } from '../components/ui/ProgressRing'
import { TemplateExerciseRow } from '../components/workout/TemplateExerciseRow'
import { useWorkouts } from '../context/WorkoutContext'
import {
  calculateWeeklyStreak,
  dayNames,
  formatCompactNumber,
  formatDate,
  getCompletedRoutineDaysForWeek,
  getCurrentWeekSessions,
  getNextPendingTemplate,
  getSessionDate,
  getSessionDateObject,
  getSessionVolume,
  isInitialSession
} from '../utils/workout'

const weekOrder = [1, 2, 3, 4, 5, 6, 0]

export function DashboardPage() {
  const { sessions, templates, getExerciseById } = useWorkouts()
  const [weeklyPlanOpen, setWeeklyPlanOpen] = useState(false)
  const today = new Date()
  const orderedTemplates = [...templates].sort(
    (a, b) => weekOrder.indexOf(a.dayOfWeek) - weekOrder.indexOf(b.dayOfWeek)
  )
  const activeTemplates = orderedTemplates.filter((template) => template.exercises.length > 0)
  const recentSessions = [...sessions]
    .filter((session) => session.completedAt && !isInitialSession(session.id))
    .sort((a, b) => getSessionDate(b).localeCompare(getSessionDate(a)))
  const weeklySessions = getCurrentWeekSessions(sessions, today)
  const completedDays = getCompletedRoutineDaysForWeek(sessions, templates, today)
  const nextTemplate = getNextPendingTemplate(templates, completedDays, today)
  const todayTemplate = templates.find((template) => template.dayOfWeek === today.getDay())
  const todayCompleted = todayTemplate
    ? completedDays.has(todayTemplate.dayOfWeek)
    : false
  const weekCompleted = activeTemplates.length > 0 &&
    activeTemplates.every((template) => completedDays.has(template.dayOfWeek))
  const heroTemplate = nextTemplate ?? todayTemplate ?? templates[0]
  const heroIsToday = heroTemplate?.dayOfWeek === today.getDay()
  const weeklyVolume = weeklySessions.reduce((sum, session) => sum + getSessionVolume(session), 0)
  const weeklyStreak = calculateWeeklyStreak(sessions, today)
  const completedRoutineDays = completedDays.size
  const weeklyProgressValue = activeTemplates.length
    ? Math.min(100, (completedRoutineDays / activeTemplates.length) * 100)
    : 0
  const heroState = weekCompleted
    ? 'week-complete'
    : todayCompleted
      ? 'today-complete'
      : 'pending'

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-line/70 bg-hero text-on-hero shadow-card">
        <div className="relative grid gap-4 p-4 md:grid-cols-[1fr_auto] md:p-6">
          <div>
            <p className="eyebrow !text-hero-accent">
              {heroState === 'week-complete'
                ? 'Semana completada'
                : heroState === 'today-complete'
                  ? 'Entrenamiento de hoy completado'
                  : 'Tu próximo entrenamiento'}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
              {heroState === 'week-complete'
                ? 'Todos los entrenamientos hechos'
                : heroState === 'today-complete'
                  ? todayTemplate?.name
                  : heroTemplate?.name}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-hero-muted">
              {heroState === 'week-complete'
                ? 'Has completado todos los entrenamientos de esta semana.'
                : heroState === 'today-complete'
                  ? `Próximo entrenamiento: ${heroTemplate?.name ?? 'sin pendientes'}`
                  : heroTemplate?.notes}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-hero-muted">
              {heroState === 'week-complete' ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-hero-accent" />
                  {completedRoutineDays} de {activeTemplates.length} días completados
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <Dumbbell className="size-4 text-hero-accent" />
                    {heroTemplate?.exercises.length ?? 0} ejercicios
                  </span>
                  {todayCompleted && todayTemplate && (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-hero-accent" />
                      {todayTemplate.name} completado
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <Link
            to={heroState === 'week-complete'
              ? '/historial'
              : heroTemplate
                ? `/entrenamiento/${heroTemplate.id}`
                : '/rutina'}
            className="btn-primary self-end !min-h-11 md:min-w-40"
          >
            {heroState === 'week-complete'
              ? 'Ver historial'
              : heroState === 'today-complete'
                ? 'Entrenar próximo'
                : heroIsToday ? 'Entrenar hoy' : 'Entrenar próximo'}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="card grid grid-cols-3 divide-x divide-line/70 overflow-hidden">
        <StatCard
          icon={CalendarCheck}
          label="Esta semana"
          value={String(weeklySessions.length)}
          suffix={weeklySessions.length === 1 ? 'sesión' : 'sesiones'}
          tone="orange"
        />
        <StatCard
          icon={Flame}
          label="Volumen total"
          value={formatCompactNumber(weeklyVolume)}
          suffix="kg"
          tone="blue"
        />
        <StatCard
          icon={Trophy}
          label="Racha actual"
          value={String(weeklyStreak)}
          suffix={weeklyStreak === 1 ? 'semana' : 'semanas'}
          tone="purple"
        />
      </section>

      <section aria-labelledby="weekly-workouts-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Plan semanal</p>
            <h3 id="weekly-workouts-title" className="mt-1 text-xl font-extrabold tracking-tight">
              Tus entrenamientos
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setWeeklyPlanOpen((current) => !current)}
              className="text-sm font-bold text-brand md:hidden"
              aria-expanded={weeklyPlanOpen}
            >
              {weeklyPlanOpen ? 'Ocultar' : 'Ver plan'}
            </button>
            <Link to="/rutina" className="text-sm font-bold text-brand hover:text-brand-hover">
              Rutina
            </Link>
          </div>
        </div>
        <div className={`${weeklyPlanOpen ? 'block' : 'hidden'} relative -mx-4 overflow-hidden md:mx-0 md:block`}>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pr-10 md:grid md:grid-cols-7 md:overflow-visible md:px-0 md:pr-0">
            {orderedTemplates.map((template) => {
              const completed = completedDays.has(template.dayOfWeek)
              const isNext = !weekCompleted && heroTemplate?.id === template.id
              const hasExercises = template.exercises.length > 0

              return (
                <Link
                  key={template.id}
                  to={hasExercises ? `/entrenamiento/${template.id}` : '/configuracion'}
                  className={`card min-w-36 snap-start scroll-ml-4 p-4 transition hover:-translate-y-0.5 hover:border-brand md:min-w-0 ${
                    completed
                      ? '!border-success/50 bg-success-soft/40'
                      : isNext
                        ? '!border-brand ring-2 ring-brand-soft'
                        : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-extrabold uppercase tracking-wider ${completed ? 'text-success-text' : 'text-brand'}`}>
                      {template.name}
                    </p>
                    {completed && (
                      <CheckCircle2 className="size-4 shrink-0 text-success-text" aria-hidden="true" />
                    )}
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-ink">{template.exercises.length}</p>
                  <p className="text-xs font-medium text-secondary">
                    {!hasExercises ? 'sin ejercicios' : completed ? 'completado esta semana' : 'pendiente'}
                  </p>
                </Link>
              )
            })}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-canvas to-transparent md:hidden" />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="card p-4 md:p-5">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="eyebrow">Próxima sesión</p>
              <h3 className="mt-1 text-xl font-extrabold">
                {weekCompleted ? 'Semana completada' : heroTemplate?.name}
              </h3>
            </div>
            <Link
              to={weekCompleted ? '/rutina' : heroTemplate ? `/entrenamiento/${heroTemplate.id}` : '/rutina'}
              className="text-sm font-bold text-brand hover:text-brand-hover"
            >
              {weekCompleted ? 'Ver rutina' : 'Empezar'}
            </Link>
          </div>
          <div className="divide-y divide-line">
            {(weekCompleted ? [] : heroTemplate?.exercises ?? []).slice(0, 4).map((item) => (
              <TemplateExerciseRow key={item.id} item={item} exercise={getExerciseById(item.exerciseId)} />
            ))}
            {weekCompleted && (
              <p className="py-5 text-sm font-semibold text-secondary">
                No quedan entrenamientos pendientes esta semana.
              </p>
            )}
          </div>
        </div>

        <div className="card p-4 md:p-5">
          <p className="eyebrow">Objetivo semanal</p>
          <div className="mt-4">
            <ProgressRing
              value={weeklyProgressValue}
              label={`${completedRoutineDays} de ${activeTemplates.length} días`}
              detail="Progreso de la rutina semanal."
            />
          </div>
          <div className="mt-5 border-t border-line/70 pt-4">
            <p className="text-sm font-bold">Última sesión</p>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/70 p-2.5">
              <div>
                <p className="text-sm font-semibold">{recentSessions[0]?.name ?? 'Sin sesiones'}</p>
                <p className="text-xs text-secondary">
                  {recentSessions[0]
                    ? `${formatDate(getSessionDateObject(recentSessions[0]), {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })} · ${dayNames[getSessionDateObject(recentSessions[0]).getDay()]}`
                    : 'Cuando guardes una sesión aparecerá aquí.'}
                </p>
              </div>
              {recentSessions[0] && (
                <span className="rounded-lg bg-success-soft px-2 py-1 text-xs font-bold text-success-text">
                  Completada
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

const tones = {
  orange: 'bg-brand-soft/70 text-brand',
  blue: 'bg-muted text-secondary',
  purple: 'bg-muted text-secondary'
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
    <div className="flex min-h-20 min-w-0 flex-col justify-between gap-2 p-2.5 sm:min-h-16 sm:flex-row sm:items-center sm:justify-start sm:p-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg sm:size-9 ${tones[tone]}`}>
        <Icon className="size-[18px] sm:size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold leading-tight text-secondary sm:text-xs">{label}</p>
        <p className="mt-0.5 text-base font-extrabold leading-tight sm:text-lg">
          {value}{' '}
          <span className="block text-[10px] font-semibold text-secondary sm:inline sm:text-xs">
            {suffix}
          </span>
        </p>
      </div>
    </div>
  )
}

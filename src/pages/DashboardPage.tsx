import { ArrowRight, Check, Circle, Minus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkouts } from '../context/WorkoutContext'
import { usePendingWorkouts } from '../services/usePendingWorkouts'
import { getCompletedRoutineDaysForWeek, getNextPendingTemplate, isInitialSession, dayNames, getSessionDate, formatDate } from '../utils/workout'

export function DashboardPage() {
  const { overview, historyReader, sessions, templates, syncReady, getExerciseById } = useWorkouts()
  const { drafts } = usePendingWorkouts()
  const today = new Date()
  const activeTemplates = templates.filter(template => template.exercises.length > 0)
  const completed = historyReader && overview ? new Set(overview.currentWeekCompletedDays) : getCompletedRoutineDaysForWeek(sessions, templates, today)
  const next = getNextPendingTemplate(activeTemplates, completed, today)
  const recent = sessions.filter(session => !isInitialSession(session.id)).sort((a, b) => getSessionDate(b).localeCompare(getSessionDate(a))).slice(0, 3)
  const preparing = !activeTemplates.length && !syncReady
  const title = preparing ? 'Preparando tu día' : !activeTemplates.length ? 'Prepara tu primera rutina' : next ? next.name : 'Semana completada'
  const action = !activeTemplates.length ? 'Crear rutina' : next ? 'Empezar entrenamiento' : 'Revisar progreso'
  const target = !activeTemplates.length ? '/rutina/editar' : next ? '/entrenamiento/' + encodeURIComponent(next.id) : '/progreso'
  return <div className="today-page space-y-6 lg:space-y-8">
    <div className="today-stage">
      <section className="training-headline">
        <p className="eyebrow !text-brand">Tu siguiente paso</p>
        <h2 className="mt-3 max-w-lg text-3xl font-semibold leading-tight tracking-tight md:text-5xl">{title}</h2>
        <p className="mt-4 max-w-md text-sm leading-6 text-secondary">
          {preparing ? 'Cargando tu planificación.' : !activeTemplates.length ? 'Construye tu semana. Elige tus ejercicios y empieza a registrar cada serie.' : next ? next.exercises.length + ' ejercicios. Una serie cada vez.' : 'Has completado tu planificación. Es un buen momento para ver cómo has avanzado.'}
        </p>
        {!preparing && <Link to={target} className="btn-primary mt-6 w-full sm:w-fit !min-h-12">{action}<ArrowRight className="size-4" aria-hidden="true" /></Link>}
      </section>
      {next && <section className="session-lineup py-2 xl:px-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="section-title">En esta sesión</h2><Link to="/rutina" className="text-sm font-semibold text-secondary hover:text-ink">Ver rutina</Link></div>
        <ol className="divide-y divide-line/40">
          {next.exercises.slice(0, 5).map((item, i) => <li key={item.id} className="flex items-center gap-4 py-3.5">
            <span className="w-5 text-xs tabular-nums text-subtle">{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1"><p className="font-semibold">{getExerciseById(item.exerciseId)?.name ?? item.exerciseId}</p><p className="mt-1 text-xs text-secondary">{item.targetSets} series · {item.targetReps} reps</p></div>
          </li>)}
        </ol>
        {next.exercises.length > 5 && <p className="mt-2 text-xs text-secondary">Y {next.exercises.length - 5} ejercicios más</p>}
      </section>}
    </div>
    {drafts.length > 0 && <Link to="/pendientes" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex min-h-12 items-center gap-3 rounded-2xl border border-brand/30 bg-surface px-4 py-3 text-sm font-bold text-ink shadow-card hover:bg-raised lg:bottom-6 lg:right-6">
      <span>{drafts.length} {drafts.length === 1 ? 'entrenamiento pendiente' : 'entrenamientos pendientes'}</span>
      <span className="text-brand">Ver pendientes <ArrowRight className="inline size-4" aria-hidden="true" /></span>
    </Link>}
    {activeTemplates.length > 0 && <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="section-title">Tu semana</h2><p className="text-sm text-secondary">{`${activeTemplates.filter(t => completed.has(t.dayOfWeek)).length} de ${activeTemplates.length} días completados`}</p></div>
      <div className="week-track">
        {[1,2,3,4,5,6,0].map(day => {
          const planned = activeTemplates.find(t => t.dayOfWeek === day)
          const state = !planned ? 'Descanso' : completed.has(day) ? 'Completado' : 'Pendiente'
          return <Link key={day} aria-label={`${dayNames[day]}: ${state}`} to={planned ? '/entrenamiento/' + encodeURIComponent(planned.id) : '/rutina'} className={'rounded-xl px-4 py-3 ' + (planned ? 'bg-surface hover:bg-raised' : 'bg-transparent')}>
            <p className="text-xs font-semibold text-secondary"><span className="sm:hidden">{dayNames[day].slice(0, 3)}</span><span className="hidden sm:inline">{dayNames[day]}</span></p>
            <span aria-hidden="true" className={'week-indicator sm:hidden ' + (state === 'Completado' ? 'text-success-text' : 'text-secondary')}>{state === 'Completado' ? <Check /> : state === 'Pendiente' ? <Circle /> : <Minus />}</span>
            <p className={'hidden sm:block mt-2 text-sm font-semibold ' + (completed.has(day) ? 'text-success-text' : 'text-ink')}>{planned ? completed.has(day) ? 'Completado' : planned.exercises.length + ' ejercicios' : 'Descanso'}</p>
          </Link>
        })}
      </div>
      <div className="week-legend sm:hidden" aria-hidden="true"><span><Check />Completado</span><span><Circle />Pendiente</span><span><Minus />Descanso</span></div>
    </section>}
    {recent.length > 0 && <section>
      <div className="mb-3 flex items-center justify-between"><h2 className="section-title">Actividad reciente</h2>{target !== '/progreso' && <Link to="/progreso" className="text-sm font-semibold text-brand">Ver progreso</Link>}</div>
      <div className="grid gap-3 lg:grid-cols-3">{recent.map(session => <div key={session.id} className="border-l-2 border-line py-1 pl-4">
        <p className="font-semibold">{session.name}</p><p className="mt-1 text-sm text-secondary">{formatDate(getSessionDate(session))} · {session.exerciseLogs.length} ejercicios</p>
      </div>)}</div>
    </section>}
  </div>
}

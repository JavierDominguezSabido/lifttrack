import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkouts } from '../context/WorkoutContext'
import { readWorkoutDrafts } from './WorkoutPage'
import { toLocalDateKey } from '../utils/date'
import { getCompletedRoutineDaysForWeek, getNextPendingTemplate, isInitialSession } from '../utils/workout'
import { hasCompletedSessionForDraft } from '../utils/workoutLifecycle'

export function DashboardPage() {
  const { sessions, templates, ownerId } = useWorkouts()
  const today = new Date()
  const activeTemplates = templates.filter(template => template.exercises.length > 0)
  const completed = getCompletedRoutineDaysForWeek(sessions, templates, today)
  const next = getNextPendingTemplate(activeTemplates, completed, today)
  const draft = readWorkoutDrafts(ownerId === 'local' ? 'local' : 'user:' + ownerId, toLocalDateKey(today))
    .find(item => !hasCompletedSessionForDraft(sessions, item))
  const hasHistory = sessions.some(session => !isInitialSession(session.id))
  const title = draft ? 'Tu entrenamiento sigue aquí' : !activeTemplates.length ? 'Prepara tu primera rutina' : next ? next.name : 'Semana completada'
  const action = draft ? 'Continuar entrenamiento' : !activeTemplates.length ? 'Crear rutina' : next ? 'Empezar entrenamiento' : 'Revisar progreso'
  const target = draft ? '/entrenamiento/' + encodeURIComponent(draft.templateId) : !activeTemplates.length ? '/rutina/editar' : next ? '/entrenamiento/' + encodeURIComponent(next.id) : '/progreso'
  return <div className="space-y-5">
    <section className="rounded-2xl border border-line/70 bg-hero p-5 text-on-hero shadow-card md:p-8">
      <p className="eyebrow !text-hero-accent">{draft ? 'En curso' : 'Tu siguiente paso'}</p>
      <h2 className="mt-2 text-2xl font-extrabold md:text-3xl">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-hero-muted">
        {draft ? 'Retoma las series que dejaste guardadas.' : !activeTemplates.length ? 'Elige ejercicios para tus días de entrenamiento. Después podrás registrar cada sesión desde aquí.' : next ? next.exercises.length + ' ejercicios preparados. Registra tus series a tu ritmo.' : 'Has completado los días de tu rutina. Consulta cómo has avanzado o elige otra sesión desde Rutina.'}
      </p>
      <Link to={target} className="btn-primary mt-5 w-full sm:w-auto">{action}<ArrowRight className="size-4" aria-hidden="true" /></Link>
    </section>
    <div className="grid gap-4 md:grid-cols-2">
      {activeTemplates.length > 0 && <section className="card p-5">
        <h2 className="font-extrabold">Tu semana</h2>
        <p className="mt-2 text-secondary">{activeTemplates.filter(template => completed.has(template.dayOfWeek)).length} de {activeTemplates.length} días completados</p>
        <Link to="/rutina" className="btn-secondary mt-4 w-full sm:w-auto">Ver y editar rutina</Link>
      </section>}
      {hasHistory ? target !== '/progreso' && <section className="card p-5">
        <h2 className="font-extrabold">Tus entrenamientos anteriores</h2>
        <p className="mt-2 text-secondary">Consulta sesiones, edita registros y revisa la evolución de tus ejercicios.</p>
        <Link to="/progreso" className="btn-secondary mt-4 w-full sm:w-auto">Ver progreso</Link>
      </section> : activeTemplates.length > 0 && <section className="card p-5">
        <h2 className="font-extrabold">Todo listo para empezar</h2>
        <p className="mt-2 text-secondary">Al guardar tu primera sesión, verás tu evolución en Progreso.</p>
      </section>}
    </div>
  </div>
}

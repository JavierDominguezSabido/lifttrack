import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePendingWorkouts } from '../services/usePendingWorkouts'
import { countCompletedDraftSets, workoutDraftUrl } from '../services/workoutDraftStorage'
import { formatDate, parseLocalDate } from '../utils/date'

export function PendingWorkoutsPage() {
  const { drafts, loading } = usePendingWorkouts()
  return <section className="mx-auto w-full max-w-3xl">
    <Link to="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-secondary hover:text-ink">Volver a Hoy</Link>
    <p className="eyebrow mt-5">Entrenamientos</p>
    <h2 className="mt-2 text-3xl font-semibold tracking-tight">Pendientes</h2>
    <p className="mt-2 text-sm text-secondary">Elige la sesión que quieres continuar. Tu planificación de hoy sigue disponible.</p>
    {drafts.length === 0 ? <p role="status" className="mt-8 text-secondary">{loading ? 'Comprobando pendientes…' : 'No hay entrenamientos pendientes.'}</p> :
      <ul className="mt-7 divide-y divide-line/50">{drafts.map(draft => {
        const total = draft.logs.reduce((count, log) => count + log.sets.length, 0)
        return <li key={workoutDraftUrl(draft)}>
          <Link to={workoutDraftUrl(draft)} className="flex min-h-20 items-center justify-between gap-4 py-4 hover:text-brand">
            <span className="min-w-0"><strong className="block truncate text-lg">{draft.template.name}</strong>
              <span className="mt-1 block text-sm text-secondary">{formatDate(parseLocalDate(draft.localDate)!, { day: 'numeric', month: 'long', year: 'numeric' })} · {countCompletedDraftSets(draft)}/{total} series</span>
            </span>
            <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
          </Link>
        </li>
      })}</ul>}
  </section>
}

import { ArrowRight, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { TemplateExerciseRow } from '../components/workout/TemplateExerciseRow'
import { useWorkouts } from '../context/WorkoutContext'
import { dayNames, shortDayNames } from '../utils/workout'

export function RoutinePage() {
  const { templates, getExerciseById } = useWorkouts()
  const [params, setParams] = useSearchParams()
  const ordered = [...templates].sort((a,b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7))
  const selected = ordered.find(t => t.id === params.get('dia')) ?? ordered.find(t => t.dayOfWeek === new Date().getDay() && t.exercises.length) ?? ordered.find(t => t.exercises.length) ?? ordered[0]
  if (!ordered.some(t => t.exercises.length)) return <section className="training-headline routine-empty">
    <p className="eyebrow">Tu planificación</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Dale forma a tu semana</h2>
    <p className="mt-3 max-w-md text-secondary">Elige ejercicios, series y descansos para tus días de entrenamiento.</p>
    <Link to="/rutina/editar" className="btn-primary mt-6"><Plus className="size-4" />Crear mi rutina</Link>
  </section>
  return <div className="routine-page">
    <header className="page-intro">
      <div><p className="eyebrow">Planificación</p><h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Tu semana de entrenamiento</h2></div>
      <nav aria-label="Gestionar rutina" className="flex gap-4 text-sm font-semibold">
        <Link to="/rutina/ejercicios" className="inline-flex min-h-11 items-center text-secondary hover:text-ink">Ejercicios</Link>
        <Link to="/rutina/editar" className="inline-flex min-h-11 items-center text-brand">Editar rutina</Link>
      </nav>
    </header>
    <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Días de rutina" className="grid grid-cols-7 gap-1 lg:grid-cols-1 lg:gap-2">
        {ordered.map(t => <button key={t.id} type="button" aria-pressed={selected?.id === t.id} onClick={() => setParams({dia:t.id})}
          className={'flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl px-1 py-3 lg:items-start lg:px-4 ' + (selected?.id === t.id ? 'bg-brand-soft text-brand' : 'text-secondary hover:bg-surface')}>
          <span className="font-semibold lg:hidden">{shortDayNames[t.dayOfWeek]}</span><span className="hidden font-semibold lg:block">{dayNames[t.dayOfWeek]}</span>
          <span className="mt-1 text-[10px] lg:text-xs">{t.exercises.length ? t.exercises.length + ' ej.' : '—'}</span>
        </button>)}
      </nav>
      {selected && <section className="training-plan">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div><p className="eyebrow">{dayNames[selected.dayOfWeek]}</p><h3 className="mt-1 text-2xl font-semibold">{selected.name}</h3>{selected.notes && <p className="mt-2 text-sm text-secondary">{selected.notes}</p>}</div>
          <Link to={'/rutina/editar#' + encodeURIComponent(selected.id)} className="btn-secondary">Editar día</Link>
        </header>
        <div className="divide-y divide-line/40">{selected.exercises.map(item => <div key={item.id} className="py-1">
          <TemplateExerciseRow item={item} exercise={getExerciseById(item.exerciseId)} />
          {(item.notes || getExerciseById(item.exerciseId)?.notes) && <p className="pb-3 pl-11 text-xs text-secondary">{[getExerciseById(item.exerciseId)?.notes, item.notes].filter(Boolean).join(' · ')}</p>}
        </div>)}</div>
        {selected.exercises.length ? <Link to={'/entrenamiento/' + encodeURIComponent(selected.id)} className="btn-primary mt-5 w-full sm:w-auto">Empezar entrenamiento<ArrowRight className="size-4" /></Link> : <div className="py-8"><h4 className="section-title">Día de descanso</h4><p className="mt-2 text-sm text-secondary">Puedes dejarlo libre o añadir ejercicios desde Editar día.</p></div>}
      </section>}
    </div>
  </div>
}

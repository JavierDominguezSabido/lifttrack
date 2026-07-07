import {
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Dumbbell,
  Edit3,
  Library,
  Plus,
  Save,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useWorkouts } from '../context/WorkoutContext'
import { AccountSettings } from '../components/settings/AccountSettings'
import { DataSettings } from '../components/settings/DataSettings'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import type { Exercise, MuscleGroup, WorkoutTemplate, WorkoutTemplateExercise } from '../types'
import { dayNames, formatRestSeconds, shortDayNames } from '../utils/workout'

const muscleGroups: MuscleGroup[] = [
  'Pecho', 'Espalda', 'Pierna', 'Hombro', 'Bíceps', 'Tríceps', 'Core'
]

const cloneTemplates = (templates: WorkoutTemplate[]) =>
  JSON.parse(JSON.stringify(templates)) as WorkoutTemplate[]

const createId = () => typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : `template-exercise-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const weekOrder = [1, 2, 3, 4, 5, 6, 0]

function parseTarget(value: string) {
  const match = value.trim().match(/^([1-9]\d*)\s*[xX×]\s*([1-9]\d*)$/)
  return match ? { targetReps: match[1], targetSets: Number(match[2]) } : null
}

function parseRest(value: string) {
  const match = value.trim().match(/^(\d+):([0-5]\d)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function SettingsPage() {
  const {
    exercises,
    templates,
    hasCustomRoutine,
    createExercise,
    updateExercise,
    archiveExercise,
    saveTemplates,
    getExerciseById
  } = useWorkouts()
  const [tab, setTab] = useState<'routine' | 'library'>('routine')
  const [drafts, setDrafts] = useState(() => cloneTemplates(templates))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null)
  const [showExerciseForm, setShowExerciseForm] = useState(false)
  const [daySelections, setDaySelections] = useState<Record<string, string>>({})

  useEffect(() => setDrafts(cloneTemplates(templates)), [templates])

  const orderedDrafts = [...drafts].sort(
    (a, b) => weekOrder.indexOf(a.dayOfWeek) - weekOrder.indexOf(b.dayOfWeek)
  )
  const trainingDays = new Set(drafts.filter((item) => item.exercises.length).map((item) => item.dayOfWeek))

  function updateTemplate(templateId: string, update: (template: WorkoutTemplate) => WorkoutTemplate) {
    setDrafts((current) => current.map((item) => item.id === templateId ? update(item) : item))
    setMessage(null)
  }

  function addToDay(templateId: string, exerciseId: string) {
    if (!exerciseId) return
    const template = drafts.find((item) => item.id === templateId)
    if (!template) return
    const duplicate = template.exercises.some((item) => item.exerciseId === exerciseId)
    if (duplicate && !window.confirm('Este ejercicio ya está en el día. ¿Quieres añadirlo otra vez como variante?')) {
      return
    }

    updateTemplate(templateId, (current) => ({
      ...current,
      exercises: [...current.exercises, {
        id: createId(),
        templateId,
        exerciseId,
        order: current.exercises.length + 1,
        targetReps: '8',
        targetSets: 3,
        restSeconds: 90
      }]
    }))
  }

  function updateItem(templateId: string, itemId: string, changes: Partial<WorkoutTemplateExercise>) {
    updateTemplate(templateId, (template) => ({
      ...template,
      exercises: template.exercises.map((item) =>
        item.id === itemId ? { ...item, ...changes } : item
      )
    }))
  }

  function removeItem(templateId: string, itemId: string) {
    updateTemplate(templateId, (template) => ({
      ...template,
      exercises: template.exercises
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, order: index + 1 }))
    }))
  }

  function moveItem(templateId: string, index: number, direction: -1 | 1) {
    updateTemplate(templateId, (template) => {
      const destination = index + direction
      if (destination < 0 || destination >= template.exercises.length) return template
      const next = [...template.exercises]
      ;[next[index], next[destination]] = [next[destination], next[index]]
      return {
        ...template,
        exercises: next.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 }))
      }
    })
  }

  function persistRoutine() {
    setError(null)
    saveTemplates(drafts)
    setMessage('Rutina semanal guardada.')
  }

  function handleArchive(exerciseId: string) {
    setError(null)
    if (!archiveExercise(exerciseId)) {
      setError('Quita el ejercicio de todos los días y guarda la rutina antes de archivarlo.')
      return
    }
    setMessage('Ejercicio archivado. Su historial se conserva.')
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <AccountSettings />

      <section className="card overflow-hidden" aria-labelledby="appearance-settings-title">
        <header className="border-b border-line bg-muted/40 p-5 md:p-6">
          <p className="eyebrow">Apariencia</p>
          <h2 id="appearance-settings-title" className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
            Apariencia
          </h2>
          <p className="mt-2 text-sm leading-6 text-secondary">
            Ajusta el tema visual de LiftTrack en este dispositivo.
          </p>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 md:p-6">
          <p className="text-sm font-semibold text-secondary">Tema de la aplicación</p>
          <ThemeToggle />
        </div>
      </section>

      <section className="card p-5 md:p-6">
        <p className="eyebrow">Rutina</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
          Rutina y ejercicios
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">
          Administra la biblioteca y personaliza los ejercicios de cada día. Los cambios no
          eliminan entrenamientos anteriores.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1.5">
        <button
          type="button"
          onClick={() => setTab('routine')}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition ${
            tab === 'routine' ? 'bg-surface text-ink shadow-sm' : 'text-secondary'
          }`}
        >
          <CalendarDays className="size-4" /> Editar rutina
        </button>
        <button
          type="button"
          onClick={() => setTab('library')}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition ${
            tab === 'library' ? 'bg-surface text-ink shadow-sm' : 'text-secondary'
          }`}
        >
          <Library className="size-4" /> Ejercicios
        </button>
      </div>

      {message && <p role="status" className="status-success">{message}</p>}
      {error && <p role="alert" className="status-error">{error}</p>}

      {tab === 'routine' ? (
        <>
          <div>
            <p className="max-w-xl text-sm leading-6 text-secondary">
              {hasCustomRoutine
                ? 'Estás usando tu rutina personalizada.'
                : 'Estás usando la rutina base. Guarda cualquier cambio para personalizarla.'}
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
                      {active ? <Dumbbell className="size-4" /> : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section aria-label="Editar entrenamientos por día" className="space-y-4">
            {orderedDrafts.map((template) => (
              <article key={template.id} className="card overflow-hidden">
                <header className="border-b border-line bg-muted/40 p-4 sm:p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand">
                    {dayNames[template.dayOfWeek]}
                  </p>
                  <h2 className="mt-1 text-xl font-extrabold text-ink">{template.name}</h2>
                  {template.notes && <p className="mt-1 text-sm text-secondary">{template.notes}</p>}
                </header>

                <div className="space-y-3 p-3 sm:p-4">
                  {template.exercises.map((item, index) => (
                    <RoutineExerciseEditor
                      key={item.id}
                      item={item}
                      exercise={getExerciseById(item.exerciseId)}
                      first={index === 0}
                      last={index === template.exercises.length - 1}
                      onMove={(direction) => moveItem(template.id, index, direction)}
                      onRemove={() => removeItem(template.id, item.id)}
                      onChange={(changes) => updateItem(template.id, item.id, changes)}
                      onError={setError}
                    />
                  ))}
                  {template.exercises.length === 0 && (
                    <p className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-secondary">
                      No hay ejercicios en este día.
                    </p>
                  )}

                  <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_auto]">
                    <select
                      aria-label={`Ejercicio para ${template.name}`}
                      value={daySelections[template.id] ?? ''}
                      className="input !text-left !font-semibold"
                      onChange={(event) => setDaySelections((current) => ({
                        ...current,
                        [template.id]: event.target.value
                      }))}
                    >
                      <option value="" disabled>Añadir ejercicio desde la biblioteca</option>
                      {exercises.filter((exercise) => exercise.active).map((exercise) => (
                        <option key={exercise.id} value={exercise.id}>{exercise.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={!daySelections[template.id]}
                      onClick={() => {
                        addToDay(template.id, daySelections[template.id])
                        setDaySelections((current) => ({ ...current, [template.id]: '' }))
                      }}
                    >
                      <Plus className="size-4" /> Añadir al día
                    </button>
                  </div>
                  <button type="button" onClick={() => setTab('library')} className="text-sm font-bold text-brand">
                    ¿No está en la lista? Crear ejercicio nuevo
                  </button>
                </div>

                <div className="border-t border-line p-3 sm:p-4">
                  <Link to={`/entrenamiento/${template.id}`} className="text-sm font-bold text-brand">
                    Entrenar {template.name.toLowerCase()}
                  </Link>
                </div>
              </article>
            ))}
          </section>

          <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur-xl lg:bottom-4">
            <button type="button" onClick={persistRoutine} className="btn-primary w-full">
              <Save className="size-4" /> Guardar cambios
            </button>
          </div>
        </>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Biblioteca</p>
              <h2 className="mt-1 text-xl font-extrabold">Ejercicios disponibles</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingExercise(null)
                setShowExerciseForm(true)
              }}
              className="btn-primary"
            >
              <Plus className="size-4" /> Añadir ejercicio
            </button>
          </div>

          {showExerciseForm && (
            <ExerciseForm
              exercise={editingExercise}
              onCancel={() => setShowExerciseForm(false)}
              onSave={(values) => {
                if (editingExercise) updateExercise({ ...editingExercise, ...values })
                else createExercise({ ...values, active: true })
                setShowExerciseForm(false)
                setMessage(editingExercise ? 'Ejercicio actualizado.' : 'Ejercicio creado.')
              }}
            />
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {exercises.map((exercise) => (
              <article key={exercise.id} className={`card p-4 ${exercise.active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-ink">{exercise.name}</h3>
                    <p className="mt-1 text-xs font-semibold text-secondary">
                      {exercise.muscleGroup || 'Sin grupo muscular'}
                      {!exercise.active && ' · Archivado'}
                    </p>
                    {exercise.notes && <p className="mt-2 text-sm text-secondary">{exercise.notes}</p>}
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                    exercise.active ? 'bg-success-soft text-success-text' : 'bg-muted text-secondary'
                  }`}>
                    {exercise.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExercise(exercise)
                      setShowExerciseForm(true)
                    }}
                    className="btn-secondary !min-h-10 !py-2"
                  >
                    <Edit3 className="size-4" /> Editar
                  </button>
                  {exercise.active ? (
                    <button
                      type="button"
                      onClick={() => handleArchive(exercise.id)}
                      className="btn-secondary !min-h-10 !py-2"
                    >
                      <Archive className="size-4" /> Archivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        updateExercise({ ...exercise, active: true })
                        setMessage('Ejercicio activado.')
                      }}
                      className="btn-secondary !min-h-10 !py-2"
                    >
                      <Plus className="size-4" /> Activar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <DataSettings />
    </div>
  )
}

function RoutineExerciseEditor({
  item,
  exercise,
  first,
  last,
  onMove,
  onRemove,
  onChange,
  onError
}: {
  item: WorkoutTemplateExercise
  exercise?: Exercise
  first: boolean
  last: boolean
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onChange: (changes: Partial<WorkoutTemplateExercise>) => void
  onError: (message: string | null) => void
}) {
  return (
    <div className="rounded-2xl border border-line bg-raised p-3">
      <div className="flex items-start gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-sm font-extrabold">
          {item.order}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-ink">{exercise?.name ?? 'Ejercicio no disponible'}</p>
          <p className="text-xs text-secondary">{exercise?.muscleGroup || 'Sin grupo muscular'}</p>
        </div>
        <button type="button" disabled={first} onClick={() => onMove(-1)} className="grid size-10 place-items-center rounded-xl border border-line disabled:opacity-30" aria-label="Subir">
          <ArrowUp className="size-4" />
        </button>
        <button type="button" disabled={last} onClick={() => onMove(1)} className="grid size-10 place-items-center rounded-xl border border-line disabled:opacity-30" aria-label="Bajar">
          <ArrowDown className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-secondary">
          Objetivo
          <input
            key={`${item.id}-${item.targetReps}-${item.targetSets}`}
            defaultValue={`${item.targetReps}x${item.targetSets}`}
            className="input mt-1 !text-left"
            inputMode="numeric"
            placeholder="8x4"
            onBlur={(event) => {
              const parsed = parseTarget(event.target.value)
              if (!parsed) {
                onError('El objetivo debe tener formato como 8x4, 12x3 o 15x4.')
                event.target.value = `${item.targetReps}x${item.targetSets}`
                return
              }
              onError(null)
              onChange(parsed)
            }}
          />
        </label>
        <label className="text-xs font-bold text-secondary">
          Descanso
          <input
            key={`${item.id}-${item.restSeconds}`}
            defaultValue={formatRestSeconds(item.restSeconds)}
            className="input mt-1 !text-left"
            inputMode="numeric"
            placeholder="1:30"
            onBlur={(event) => {
              const parsed = parseRest(event.target.value)
              if (parsed === null) {
                onError('El descanso debe tener formato m:ss, por ejemplo 1:30 o 2:30.')
                event.target.value = formatRestSeconds(item.restSeconds)
                return
              }
              onError(null)
              onChange({ restSeconds: parsed })
            }}
          />
        </label>
      </div>
      <label className="mt-2 block text-xs font-bold text-secondary">
        Nota para esta rutina
        <textarea
          value={item.notes ?? ''}
          onChange={(event) => onChange({ notes: event.target.value })}
          className="mt-1 min-h-20 w-full rounded-xl border border-control bg-raised px-3 py-2.5 text-base font-medium text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
          placeholder="Nota específica opcional"
        />
      </label>
      <button type="button" onClick={onRemove} className="mt-2 inline-flex min-h-10 items-center gap-2 px-2 text-sm font-bold text-danger-text">
        <Trash2 className="size-4" /> Quitar del día
      </button>
    </div>
  )
}

function ExerciseForm({
  exercise,
  onCancel,
  onSave
}: {
  exercise: Exercise | null
  onCancel: () => void
  onSave: (exercise: Omit<Exercise, 'id' | 'active'>) => void
}) {
  const [name, setName] = useState(exercise?.name ?? '')
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscleGroup ?? '')
  const [notes, setNotes] = useState(exercise?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('El nombre del ejercicio es obligatorio.')
      return
    }
    onSave({
      name: name.trim(),
      muscleGroup: muscleGroup ? muscleGroup as MuscleGroup : undefined,
      notes: notes.trim() || undefined
    })
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold">{exercise ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h3>
        <button type="button" onClick={onCancel} className="grid size-10 place-items-center rounded-xl" aria-label="Cerrar">
          <X className="size-5" />
        </button>
      </div>
      {error && <p className="status-error">{error}</p>}
      <label className="block text-sm font-bold text-secondary">
        Nombre *
        <input value={name} onChange={(event) => setName(event.target.value)} className="input mt-1 !text-left" placeholder="Press banca" />
      </label>
      <label className="block text-sm font-bold text-secondary">
        Grupo muscular
        <select value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value as MuscleGroup | '')} className="input mt-1 !text-left !font-semibold">
          <option value="">Sin especificar</option>
          {muscleGroups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
      </label>
      <label className="block text-sm font-bold text-secondary">
        Nota técnica
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-control bg-raised px-3 py-2.5 text-base text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" />
      </label>
      <button type="submit" className="btn-primary w-full">
        <Save className="size-4" /> Guardar cambios
      </button>
    </form>
  )
}

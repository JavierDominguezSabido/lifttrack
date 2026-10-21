import { confirmAction } from '../components/ui/confirmAction'
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Edit3,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AccountSettings } from '../components/settings/AccountSettings'
import { DataSettings } from '../components/settings/DataSettings'
import { useWorkouts } from '../context/WorkoutContext'
import type { Exercise, MuscleGroup, WorkoutTemplate, WorkoutTemplateExercise } from '../types'
import { dayNames, formatRestSeconds, formatTarget } from '../utils/workout'
import { getEmptyRoutine } from '../services/routineStorage'

const muscleGroups: MuscleGroup[] = [
  'Pecho', 'Espalda', 'Pierna', 'Hombro', 'Bíceps', 'Tríceps', 'Core'
]

const cloneTemplates = (templates: WorkoutTemplate[]) =>
  JSON.parse(JSON.stringify(templates)) as WorkoutTemplate[]

const createId = () => typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : `template-exercise-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const weekOrder = [1, 2, 3, 4, 5, 6, 0]
type SettingsSection = 'account' | 'data'
type RoutineFields = Record<string, { target?: string; rest?: string }>

function parseTarget(value: string) {
  const match = value.trim().match(/^([1-9]\d*)\s*[xX×]\s*([1-9]\d*)$/)
  return match ? { targetSets: Number(match[1]), targetReps: match[2] } : null
}

function parseRest(value: string) {
  const match = value.trim().match(/^(\d+):([0-5]\d)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function SettingsPage() {
  const { ownerId } = useWorkouts()
  return <SettingsPageContent key={ownerId} />
}

function SettingsPageContent() {
  const {
    exercises,
    ownerId,
    templates,
    createExercise,
    updateExercise,
    archiveExercise,
    saveTemplates,
    getExerciseById
  } = useWorkouts()
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const settingsView = location.pathname === '/rutina/editar' ? 'routine' : location.pathname === '/rutina/ejercicios' ? 'library' : 'overview'
  const setSettingsView = (view: string) => navigate(view === 'routine' ? '/rutina/editar' : view === 'library' ? '/rutina/ejercicios' : '/rutina')
  const routineDraftKey = `lifttrack.routineEditor.${ownerId}`
  const [recovered] = useState<WorkoutTemplate[] | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(routineDraftKey) ?? 'null')
      return Array.isArray(saved) ? saved : null
    } catch { return null }
  })
  const [drafts, setDrafts] = useState(() => recovered ?? cloneTemplates(templates.length ? templates : getEmptyRoutine()))
  const [fields, setFields] = useState<RoutineFields>(() => {
    try { return JSON.parse(sessionStorage.getItem(routineDraftKey + '.fields') ?? '{}') ?? {} } catch { return {} }
  })
  const [routineDirty, setRoutineDirty] = useState(Boolean(recovered))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const exerciseParam = params.get('ejercicio')
  const editingExercise = exercises.find(exercise => exercise.id === exerciseParam) ?? null
  const showExerciseForm = settingsView === 'library' && (exerciseParam === 'nuevo' || Boolean(editingExercise))
  const exerciseFormRef = useRef<HTMLFormElement>(null)
  const revealExerciseForm = () => {
    exerciseFormRef.current?.scrollIntoView({ block: 'start' })
    exerciseFormRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
  }
  const openExerciseForm = (exercise: Exercise | null) => {
    const next = new URLSearchParams(params)
    next.set('ejercicio', exercise?.id ?? 'nuevo')
    setParams(next)
  }
  const closeExerciseForm = () => {
    const next = new URLSearchParams(params)
    next.delete('ejercicio')
    setParams(next)
  }
  const [exerciseFormDirty, setExerciseFormDirty] = useState(false)
  const exerciseDraftKey = `lifttrack.exerciseForm.${ownerId}.${editingExercise?.id ?? 'new'}`
  useEffect(() => { if (showExerciseForm) revealExerciseForm() }, [showExerciseForm, exerciseDraftKey])

  async function discardExerciseForm() {
    if (!showExerciseForm) return true
    if (exerciseFormDirty && !await confirmAction('Hay cambios sin guardar en el ejercicio. ¿Descartarlos?')) return false
    try { window.sessionStorage.removeItem(exerciseDraftKey) } catch { /* El formulario sigue disponible en memoria. */ }
    setExerciseFormDirty(false)
    return true
  }
  const [daySelections, setDaySelections] = useState<Record<string, string>>({})
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [exerciseStatus, setExerciseStatus] = useState<'active' | 'all' | 'archived'>('active')
  const openSettingsSection: SettingsSection = location.pathname === '/cuenta/datos' ? 'data' : 'account'
  const setOpenSettingsSection = (section: SettingsSection) => navigate(section === 'data' ? '/cuenta/datos' : '/cuenta')

  useEffect(() => { if (!routineDirty) setDrafts(cloneTemplates(templates.length ? templates : getEmptyRoutine())) }, [templates, routineDirty])
  useLayoutEffect(() => {
    if (!routineDirty) return
    try { sessionStorage.setItem(routineDraftKey, JSON.stringify(drafts)); sessionStorage.setItem(routineDraftKey + '.fields', JSON.stringify(fields)) }
    catch { setError('No se pudo conservar el borrador. Guarda la rutina antes de salir.') }
  }, [drafts, fields, routineDirty, routineDraftKey])
  useEffect(() => {
    if (!routineDirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [routineDirty])

  const orderedDrafts = [...drafts].sort(
    (a, b) => weekOrder.indexOf(a.dayOfWeek) - weekOrder.indexOf(b.dayOfWeek)
  )
  const filteredExercises = useMemo(() => {
    const normalizedSearch = exerciseSearch.trim().toLowerCase()
    return exercises
      .filter((exercise) => {
        if (exerciseStatus === 'active' && !exercise.active) return false
        if (exerciseStatus === 'archived' && exercise.active) return false
        if (!normalizedSearch) return true
        return [
          exercise.name,
          exercise.muscleGroup ?? '',
          exercise.notes ?? ''
        ].some((value) => value.toLowerCase().includes(normalizedSearch))
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  }, [exerciseSearch, exerciseStatus, exercises])

  useEffect(() => {
    if (location.hash && settingsView === 'routine') {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'start' })
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [openSettingsSection, settingsView, location.hash])

  function updateTemplate(templateId: string, update: (template: WorkoutTemplate) => WorkoutTemplate) {
    setRoutineDirty(true)
    setDrafts((current) => current.map((item) => item.id === templateId ? update(item) : item))
    setMessage(null)
  }

  function addToDay(templateId: string, exerciseId: string) {
    if (!exerciseId) return
    const template = drafts.find((item) => item.id === templateId)
    if (!template) return
    const duplicate = template.exercises.some((item) => item.exerciseId === exerciseId)
    if (duplicate) {
      setError('Este ejercicio ya está en la rutina. Para una variante, crea un ejercicio distinto en el catálogo.')
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
    setFields(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== itemId)))
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
    for (const item of drafts.flatMap(day => day.exercises)) {
      const values = fields[item.id]
      if (values?.target !== undefined && !parseTarget(values.target)) { setError('El objetivo debe tener formato series×reps, como 3×8, 4×12 o 3×15.'); return }
      if (values?.rest !== undefined && parseRest(values.rest) === null) { setError('El descanso debe tener formato m:ss, por ejemplo 1:30 o 2:30.'); return }
    }
    try {
      saveTemplates(drafts)
      try { sessionStorage.removeItem(routineDraftKey); sessionStorage.removeItem(routineDraftKey + '.fields') } catch { /* Guardado realizado. */ }
      setFields({})
      setRoutineDirty(false)
      setMessage('Rutina guardada.')
    } catch (error) {
      setMessage(null)
      setError(error instanceof Error ? error.message : 'No se pudo guardar la rutina.')
    }
  }

  async function openOverview() {
    if (!await discardExerciseForm()) return
    setSettingsView('overview')
  }

  async function handleArchive(exerciseId: string) {
    setError(null)
    const exercise = exercises.find((item) => item.id === exerciseId)
    if (!await confirmAction(
      `Vas a archivar ${exercise?.name ?? 'este ejercicio'}. Se conservará su historial, pero dejará de aparecer como ejercicio activo. ¿Continuar?`
    )) return

    if (!archiveExercise(exerciseId)) {
      setError('Quita el ejercicio de todos los días y guarda la rutina antes de archivarlo.')
      return
    }
    setMessage('Ejercicio archivado. Su historial se conserva.')
  }

  if (settingsView === 'routine') {
    return (
      <div className="routine-editor space-y-4 md:space-y-5 pb-[calc(12rem+env(safe-area-inset-bottom))] lg:pb-28">
        <SettingsSubpageHeader
          title="Editar rutina"
          description="Añade ejercicios a tus días y ajusta series, repeticiones y descansos."
          onBack={openOverview}
        />

        {message && <p role="status" className="status-success">{message}</p>}
        {error && <p role="alert" className="status-error">{error}</p>}
        {routineDirty && <p role="status" className="text-sm text-secondary">Tienes cambios sin guardar. El borrador se conserva al volver a esta pantalla.</p>}
        <Link to="/rutina/ejercicios" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-secondary hover:text-ink">Gestionar ejercicios<ArrowRight className="size-4" aria-hidden="true" /></Link>

        <section aria-label="Editar entrenamientos por día" className="grid grid-cols-1 items-start gap-10">
          {orderedDrafts.map((template) => (
            <article id={template.id} key={template.id} className="day-editor scroll-mt-24">
              <header className="py-4">
                {template.name.toLocaleLowerCase() !== dayNames[template.dayOfWeek].toLocaleLowerCase() && (
                  <p className="eyebrow mb-2 !text-brand">
                    {dayNames[template.dayOfWeek]}
                  </p>
                )}
                <h2>{template.name}</h2>
                {template.notes && <p className="mt-2 text-sm text-secondary">{template.notes}</p>}
              </header>

              <div className="space-y-3">
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
                    fields={fields[item.id]}
                    onFieldChange={(field, value) => {
                      setFields(current => ({...current,[item.id]:{...current[item.id],[field]:value}}))
                      setRoutineDirty(true)
                      setMessage(null)
                      const parsed = field === 'target' ? parseTarget(value) : parseRest(value)
                      if (parsed !== null) {
                        updateItem(template.id,item.id,typeof parsed === 'number' ? {restSeconds:parsed} : parsed)
                        setError(null)
                      }
                    }}
                  />
                ))}
                {template.exercises.length === 0 && (
                  <p className="border-b border-line/40 py-5 text-sm text-secondary">
                    No hay ejercicios en este día.
                  </p>
                )}

                <div className="grid gap-2 pt-2 sm:grid-cols-[1fr_auto]">
                  <select
                    aria-label={`Ejercicio para ${template.name}`}
                    value={daySelections[template.id] ?? ''}
                    className="input input-line !text-left !font-semibold"
                    onChange={(event) => setDaySelections((current) => ({
                      ...current,
                      [template.id]: event.target.value
                    }))}
                  >
                    <option value="" disabled>Añadir ejercicio desde la biblioteca</option>
                    {exercises.filter((exercise) => exercise.active && !template.exercises.some(item => item.exerciseId === exercise.id)).map((exercise) => (
                      <option key={exercise.id} value={exercise.id}>{exercise.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!daySelections[template.id]}
                    onClick={async () => {
                      addToDay(template.id, daySelections[template.id])
                      setDaySelections((current) => ({ ...current, [template.id]: '' }))
                    }}
                  >
                    <Plus className="size-4" /> Añadir al día
                  </button>
                </div>
                <button type="button" onClick={() => navigate('/rutina/ejercicios?ejercicio=nuevo')} className="min-h-11 text-left text-sm font-bold text-brand">
                  ¿No está en la lista? Crear ejercicio nuevo
                </button>
              </div>

              {template.exercises.length > 0 && !routineDirty && <div className="mt-2 border-t border-line/40 pt-2">
                <Link to={`/entrenamiento/${template.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand">
                  Entrenar {template.name.toLowerCase()}<ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>}
            </article>
          ))}
        </section>

        <div className="save-bar fixed inset-x-0 z-20 grid grid-cols-2 gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm lg:bottom-4 lg:left-[264px] lg:right-8 lg:rounded-[5px] lg:border">
          <button type="button" disabled={!routineDirty} onClick={async () => {
            if (!await confirmAction('¿Descartar los cambios sin guardar de la rutina?')) return
            try { sessionStorage.removeItem(routineDraftKey); sessionStorage.removeItem(routineDraftKey + '.fields') } catch { /* Continúa en memoria. */ }
            setFields({})
            setError(null)
            setMessage(null)
            setRoutineDirty(false)
          }} className="btn-secondary w-full !px-3">
            Descartar cambios
          </button>
          <button type="button" disabled={!routineDirty} onClick={persistRoutine} className="btn-primary w-full !px-3">
            <Save className="size-4" /> Guardar cambios
          </button>
        </div>
      </div>
    )
  }

  if (settingsView === 'library') {
    return (
      <div className="exercise-library space-y-5 md:space-y-6">
        <SettingsSubpageHeader
          eyebrow="Biblioteca"
          title="Gestionar ejercicios"
          description="Busca, crea, edita o archiva ejercicios de la biblioteca."
          onBack={openOverview}
          aside={<Link to="/rutina/editar" aria-label="Volver a editar rutina" className="inline-flex min-h-11 items-center text-sm font-bold text-brand">Editar rutina</Link>}
        />

        {message && <p role="status" className="status-success">{message}</p>}
        {error && <p role="alert" className="status-error">{error}</p>}

        <section className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-secondary">
                Buscar
              </span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                <input
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                  className="input input-line !text-left !font-semibold pl-9"
                  placeholder="Buscar ejercicio..."
                />
              </span>
            </label>
            <button
              type="button"
              onClick={async () => {
                if (showExerciseForm && !editingExercise) { revealExerciseForm(); return }
                if (!await discardExerciseForm()) return
                openExerciseForm(null)
              }}
              className="btn-primary w-full self-end lg:w-auto"
            >
              <Plus className="size-4" /> Añadir ejercicio
            </button>
          </div>

          <div className="grid grid-cols-3">
            {([
              ['active', 'Activos'],
              ['all', 'Todos'],
              ['archived', 'Archivados']
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setExerciseStatus(value)}
                className={`min-h-12 border-b-2 px-1 text-sm font-bold transition ${
                  exerciseStatus === value ? 'border-brand text-brand' : 'border-line text-secondary hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {exerciseParam && !showExerciseForm && <p role="alert" className="status-error">Este ejercicio ya no está en la biblioteca. Puedes crear uno nuevo.</p>}
        {showExerciseForm && (
          <ExerciseForm
            key={exerciseDraftKey}
            draftKey={exerciseDraftKey}
            formRef={exerciseFormRef}
            onDirtyChange={setExerciseFormDirty}
            exercise={editingExercise}
            onCancel={async () => { if (await discardExerciseForm()) closeExerciseForm() }}
            onSave={(values) => {
              if (editingExercise) updateExercise({ ...editingExercise, ...values })
              else createExercise({ ...values, active: true })
              try { window.sessionStorage.removeItem(exerciseDraftKey) } catch { /* No impide guardar. */ }
              setExerciseFormDirty(false)
              closeExerciseForm()
              setMessage(editingExercise ? 'Ejercicio actualizado.' : 'Ejercicio creado.')
            }}
          />
        )}

        <div className="grid gap-x-8 md:grid-cols-2">
          {filteredExercises.map((exercise) => (
            <article key={exercise.id} className={`border-b border-line/60 py-4 ${exercise.active ? '' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-bold tracking-[-0.02em] text-ink">{exercise.name}</h3>
                  <p className="mt-1 text-xs font-semibold text-secondary">
                    {exercise.muscleGroup || 'Sin grupo muscular'}
                    {!exercise.active && ' · Archivado'}
                  </p>
                  {exercise.notes && <p className="mt-2 text-sm text-secondary">{exercise.notes}</p>}
                </div>
                <span className={`shrink-0 pt-1 text-xs font-extrabold uppercase tracking-[0.12em] ${
                  exercise.active ? 'text-secondary' : 'text-subtle'
                }`}>
                  {exercise.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (showExerciseForm && editingExercise?.id === exercise.id) { revealExerciseForm(); return }
                    if (!await discardExerciseForm()) return
                    openExerciseForm(exercise)
                  }}
                  className="btn-secondary !min-h-11 !py-2"
                >
                  <Edit3 className="size-4" /> Editar
                </button>
                {exercise.active ? (
                  <button
                    type="button"
                    onClick={() => handleArchive(exercise.id)}
                    className="btn-secondary !min-h-11 !py-2"
                  >
                    <Archive className="size-4" /> Archivar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      updateExercise({ ...exercise, active: true })
                      setMessage('Ejercicio activado.')
                    }}
                    className="btn-secondary !min-h-11 !py-2"
                  >
                    <Plus className="size-4" /> Activar
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {filteredExercises.length === 0 && (
          <p className="py-6 text-sm font-semibold text-secondary">
            No hay ejercicios que coincidan con la búsqueda.
          </p>
        )}
      </div>
    )
  }

  return (
      <div className="account-page space-y-4 md:space-y-5">
      <header className="account-intro"><p className="eyebrow">Tu espacio</p><h2>Cuenta y datos</h2><p>Gestiona tu sesión y tus entrenamientos.</p></header>
      <SettingsAccordionHeader
        id="account"
        title="Cuenta y sincronización"
        summary="Sesión, nube y datos locales"
        open={openSettingsSection === 'account'}
        onOpen={setOpenSettingsSection}
      />
      {openSettingsSection === 'account' && <section className="account-content"><AccountSettings /></section>}

      {message && <p role="status" className="status-success">{message}</p>}
      {error && <p role="alert" className="status-error">{error}</p>}

      <SettingsAccordionHeader
        id="data"
        title="Datos"
        summary="Importar, exportar y revisar sincronización"
        open={openSettingsSection === 'data'}
        onOpen={setOpenSettingsSection}
      />
      <div className="account-content" hidden={openSettingsSection !== 'data'}>
        <DataSettings />
      </div>
    </div>
  )
}

function SettingsAccordionHeader({
  id,
  title,
  summary,
  open,
  onOpen
}: {
  id: SettingsSection
  title: string
  summary: string
  open: boolean
  onOpen: (section: SettingsSection) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="card flex min-h-16 w-full items-center justify-between gap-3 py-4 text-left transition"
      aria-expanded={open}
    >
      <span className="min-w-0">
        <span className="block text-xl font-extrabold tracking-[-0.035em] text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-secondary">{summary}</span>
      </span>
      <ChevronDown className={`size-5 shrink-0 text-secondary transition-transform ${open ? 'rotate-180 text-brand' : ''}`} aria-hidden="true" />
    </button>
  )
}

function SettingsSubpageHeader({
  eyebrow,
  title,
  description,
  onBack,
  aside
}: {
  eyebrow?: string
  title: string
  description: string
  onBack: () => void
  aside?: ReactNode
}) {
  return (
    <header className="page-head">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-11 items-center gap-2 px-1 text-sm font-bold text-secondary hover:text-ink">
          <ArrowLeft className="size-4" /> Volver a rutina
        </button>
        {aside}
      </div>
      <p className="eyebrow mt-4">{eyebrow ?? 'Planificación'}</p>
      <h2 className="page-title">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary">{description}</p>
    </header>
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
  onError,
  fields,
  onFieldChange
}: {
  item: WorkoutTemplateExercise
  exercise?: Exercise
  first: boolean
  last: boolean
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onChange: (changes: Partial<WorkoutTemplateExercise>) => void
  onError: (message: string | null) => void
  fields?: RoutineFields[string]
  onFieldChange: (field: 'target' | 'rest', value: string) => void
}) {
  return (
    <div className="border-b border-line/40 pb-4 pt-1">
      <div className="flex items-start gap-3">
        <span className="w-7 shrink-0 pt-0.5 text-lg font-medium tabular-nums text-subtle">
          {String(item.order).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-bold text-ink">{exercise?.name ?? 'Ejercicio no disponible'}</p>
          <p className="mt-0.5 text-xs text-secondary">{exercise?.muscleGroup || 'Sin grupo muscular'}</p>
        </div>
        <button type="button" disabled={first} onClick={() => onMove(-1)} className="grid size-11 shrink-0 place-items-center rounded-[3px] border border-line/65 text-secondary hover:text-ink disabled:opacity-30" aria-label={`Subir ${exercise?.name ?? 'ejercicio'}`}>
          <ArrowUp className="size-4" />
        </button>
        <button type="button" disabled={last} onClick={() => onMove(1)} className="grid size-11 shrink-0 place-items-center rounded-[3px] border border-line/65 text-secondary hover:text-ink disabled:opacity-30" aria-label={`Bajar ${exercise?.name ?? 'ejercicio'}`}>
          <ArrowDown className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 pl-10 lg:gap-4">
        <label className="text-xs font-bold text-secondary">
          Objetivo
          <input
            value={fields?.target ?? formatTarget(item.targetSets, item.targetReps)}
            onChange={event => onFieldChange('target',event.target.value)}
            aria-invalid={fields?.target !== undefined && !parseTarget(fields.target)}
            className="input input-line mt-1 !text-left"
            placeholder="3×8"
            aria-label={`Objetivo de ${exercise?.name ?? 'ejercicio'}: series por repeticiones, por ejemplo 3×8`}
            onBlur={(event) => {
              const parsed = parseTarget(event.target.value)
              if (!parsed) {
                onError('El objetivo debe tener formato series×reps, como 3×8, 4×12 o 3×15.')
                return
              }
              onError(null)
            }}
          />
        </label>
        <label className="text-xs font-bold text-secondary">
          Descanso
          <input
            value={fields?.rest ?? (item.restSeconds ? formatRestSeconds(item.restSeconds) : '0:00')}
            onChange={event => onFieldChange('rest',event.target.value)}
            aria-invalid={fields?.rest !== undefined && parseRest(fields.rest) === null}
            className="input input-line mt-1 !text-left"
            placeholder="1:30"
            aria-label={`Descanso de ${exercise?.name ?? 'ejercicio'} en minutos y segundos, por ejemplo 1:30`}
            onBlur={(event) => {
              const parsed = parseRest(event.target.value)
              if (parsed === null) {
                onError('El descanso debe tener formato m:ss, por ejemplo 1:30 o 2:30.')
                return
              }
              onError(null)
            }}
          />
        </label>
      </div>
      <label className="ml-10 mt-3 block text-xs font-bold text-secondary">
        Nota para esta rutina
        <textarea
          value={item.notes ?? ''}
          onChange={(event) => onChange({ notes: event.target.value })}
          className="input-line mt-1 min-h-16 w-full px-3 py-2.5 text-base font-medium text-ink outline-none placeholder:text-subtle"
          placeholder="Nota específica opcional"
        />
      </label>
      <button type="button" onClick={onRemove} className="ml-10 mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-danger-text">
        <Trash2 className="size-4" /> Quitar del día
      </button>
    </div>
  )
}

function ExerciseForm({
  exercise,
  draftKey,
  formRef,
  onDirtyChange,
  onCancel,
  onSave
}: {
  exercise: Exercise | null
  draftKey: string
  formRef: React.RefObject<HTMLFormElement>
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
  onSave: (exercise: Omit<Exercise, 'id' | 'active'>) => void
}) {
  const [initial] = useState(() => {
    try {
      const draft = JSON.parse(window.sessionStorage.getItem(draftKey) ?? 'null')
      if (draft && typeof draft.name === 'string' && typeof draft.muscleGroup === 'string' && typeof draft.notes === 'string') return {
        name: draft.name as string, muscleGroup: draft.muscleGroup as string, notes: draft.notes as string,
        syncRevision: typeof draft.syncRevision === 'string' ? draft.syncRevision : exercise ? 'unread' : undefined
      }
    } catch { /* Un borrador ilegible no sustituye los datos del ejercicio. */ }
    return { name: exercise?.name ?? '', muscleGroup: exercise?.muscleGroup ?? '', notes: exercise?.notes ?? '', syncRevision: exercise?.syncRevision }
  })
  const [name, setName] = useState(initial.name)
  const [muscleGroup, setMuscleGroup] = useState(initial.muscleGroup)
  const [notes, setNotes] = useState(initial.notes)
  const [error, setError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState(false)
  const dirty = name !== (exercise?.name ?? '') || muscleGroup !== (exercise?.muscleGroup ?? '') || notes !== (exercise?.notes ?? '')

  useLayoutEffect(() => {
    onDirtyChange(dirty)
    try {
      if (dirty) window.sessionStorage.setItem(draftKey, JSON.stringify({ name, muscleGroup, notes, syncRevision: initial.syncRevision }))
      else window.sessionStorage.removeItem(draftKey)
      setStorageError(false)
    } catch { setStorageError(true) }
  }, [dirty, draftKey, name, muscleGroup, notes, onDirtyChange, initial.syncRevision])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const guardNavigation = async (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!storageError || !link) return
      event.preventDefault()
      event.stopPropagation()
      if (await confirmAction('No se pudo conservar el borrador. ¿Salir y perder los cambios del ejercicio?')) {
        window.location.assign(link.href)
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', guardNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', guardNavigation, true)
    }
  }, [dirty, storageError])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('El nombre del ejercicio es obligatorio.')
      return
    }
    try { onSave({
      syncRevision: initial.syncRevision,
      name: name.trim(),
      muscleGroup: muscleGroup ? muscleGroup as MuscleGroup : undefined,
      notes: notes.trim() || undefined
    }) } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar el ejercicio.')
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="scroll-mt-24 space-y-4 border-t-2 border-brand pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-extrabold tracking-[-0.04em]">{exercise ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h3>
        <button type="button" onClick={onCancel} className="-mr-2 grid size-11 place-items-center rounded-[3px] text-secondary hover:text-ink" aria-label="Cerrar">
          <X className="size-5" />
        </button>
      </div>
      {error && <p id="exercise-form-error" role="alert" className="status-error">{error}</p>}
      {dirty && <p role="status" className={storageError ? 'status-error' : 'text-sm text-secondary'}>
        {storageError ? 'No se pudo conservar el borrador. Guarda los cambios antes de salir.' : 'Cambios sin guardar. El borrador se recuperará al volver a abrir este ejercicio en esta pestaña.'}
      </p>}
      <label className="block text-sm font-bold text-secondary">
        Nombre *
        <input aria-required="true" aria-invalid={!!error && !name.trim()} aria-describedby={error ? 'exercise-form-error' : undefined} value={name} onChange={(event) => setName(event.target.value)} className="input input-line mt-1 !text-left" placeholder="Press banca" />
      </label>
      <label className="block text-sm font-bold text-secondary">
        Grupo muscular
        <select value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value as MuscleGroup | '')} className="input input-line mt-1 !text-left !font-semibold">
          <option value="">Sin especificar</option>
          {muscleGroups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
      </label>
      <label className="block text-sm font-bold text-secondary">
        Nota técnica
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input-line mt-1 min-h-24 w-full px-3 py-2.5 text-base text-ink outline-none" />
      </label>
      <button type="submit" className="btn-primary w-full">
        <Save className="size-4" /> Guardar cambios
      </button>
    </form>
  )
}

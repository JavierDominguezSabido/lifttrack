import { Activity, CalendarDays, ChartNoAxesColumnIncreasing, LayoutDashboard, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useWorkouts } from '../../context/WorkoutContext'
import { getCompletedRoutineDaysForWeek } from '../../utils/workout'
import { ThemeToggle } from '../ui/ThemeToggle'
import { shouldShowInitialWorkoutLoader } from '../../utils/workoutLifecycle'

const navigation = [
  { label: 'Hoy', path: '/', icon: LayoutDashboard },
  { label: 'Rutina', path: '/rutina', icon: CalendarDays },
  { label: 'Progreso', path: '/progreso', icon: ChartNoAxesColumnIncreasing },
  { label: 'Cuenta', path: '/cuenta', icon: Settings }
]

const pageTitles: Record<string, string> = {
  '/': 'Hoy',
  '/rutina': 'Rutina semanal',
  '/entrenamiento': 'Entrenamiento',
  '/historial': 'Historial',
  '/cuenta': 'Cuenta',
  '/progreso': 'Progreso'
}

export function AppLayout() {
  const location = useLocation()
  const { sessions, templates, sessionsError, initialLoading, ownerId, syncError, syncOperations, retrySync, resolveConflict } = useWorkouts()
  const [syncActionError, setSyncActionError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const currentError = syncError ?? sessionsError ?? syncOperations.find(op => op.status === 'error')?.error ?? null
  const [persistentError, setPersistentError] = useState<string | null>(null)
  useEffect(() => {
    setPersistentError(null)
    if (!currentError) return
    const timer = window.setTimeout(() => setPersistentError(currentError), 15000)
    return () => window.clearTimeout(timer)
  }, [currentError, ownerId])
  const visibleError = persistentError === currentError ? persistentError : null
  const conflicted = syncOperations.find(op => op.status === 'conflict')
  const latestConflict = conflicted ? syncOperations.filter(op => op.resource === conflicted.resource).slice(-1)[0] : undefined
  const conflictLabel = latestConflict?.resource === 'routine' ? 'la rutina' : latestConflict?.resource.startsWith('draft:') ? 'el entrenamiento en curso' : 'la sesión'
  useEffect(() => { setSyncActionError(null); setResolving(false) }, [ownerId])
  async function resolve(keepLocal: boolean) {
    if (!latestConflict || !window.confirm(keepLocal
      ? `¿Aplicar tu versión local de ${conflictLabel}, incluido cualquier borrado pendiente, sobre la versión de la nube?`
      : `¿Descartar los cambios locales pendientes de ${conflictLabel} y conservar la nube?`)) return
    setResolving(true)
    setSyncActionError(null)
    try { await resolveConflict(latestConflict.id, keepLocal) }
    catch (error) { setSyncActionError(error instanceof Error ? error.message : 'No se pudo resolver el conflicto.') }
    finally { setResolving(false) }
  }
  const hasLocalWorkoutDraft = (() => {
    try {
      const userKey = ownerId === 'local' ? 'local' : `user:${ownerId}`
      const prefix = `lifttrack.workoutDraft.${userKey}.`
      return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .some((key) => key?.startsWith(prefix))
    } catch {
      return false
    }
  })()
  const showInitialLoader = shouldShowInitialWorkoutLoader({
    initialLoading,
    sessionCount: sessions.length,
    templateCount: templates.length,
    hasLocalDraft: hasLocalWorkoutDraft
  })
  const activeTemplateCount = templates.filter((template) => template.exercises.length > 0).length
  const completedDays = getCompletedRoutineDaysForWeek(sessions, templates)
  const weeklySessionCount = templates.filter(template => template.exercises.length > 0 && completedDays.has(template.dayOfWeek)).length
  const weeklyProgress = activeTemplateCount
    ? Math.min(100, (weeklySessionCount / activeTemplateCount) * 100)
    : 0
  const currentDate = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date())
  const title =
    Object.entries(pageTitles).find(([path]) =>
      path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
    )?.[1] ?? 'LiftTrack'

  useEffect(() => {
    if (location.pathname.startsWith('/entrenamiento')) return
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-canvas transition-colors lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line/70 bg-surface/80 px-3 py-5 backdrop-blur-xl lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-hero text-hero-accent">
            <Activity className="size-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-base font-extrabold tracking-tight">LiftTrack</p>
            <p className="text-xs font-medium text-subtle">Registro de entrenos</p>
          </div>
        </div>

        <nav aria-label="Navegación principal de escritorio" className="space-y-1">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                  (isActive || (path === '/' && location.pathname.startsWith('/entrenamiento')) || (path === '/progreso' && location.pathname.startsWith('/historial'))) ? 'bg-brand-solid text-on-brand shadow-sm' : 'text-secondary hover:bg-muted hover:text-ink'
                }`
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {activeTemplateCount > 0 && <div className="mt-auto rounded-xl border border-line/70 bg-raised p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Semana activa</p>
          <p className="mt-1 text-xl font-extrabold text-ink">
            {weeklySessionCount} / {activeTemplateCount}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${weeklyProgress}%` }}
            />
          </div>
        </div>}
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-line/70 bg-canvas/88 px-4 backdrop-blur-xl md:px-8 lg:h-16">
          <div className="min-w-0">
            <p className="hidden text-xs font-semibold capitalize text-subtle sm:block">{currentDate}</p>
            <h1 className="truncate text-lg font-extrabold tracking-tight lg:text-xl">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pt-7 lg:pb-12 lg:pt-8">
          {(latestConflict || visibleError) && (
            <section aria-label="Operaciones pendientes de sincronización" className="card mb-4 space-y-2 p-3">
              {!latestConflict && <p role="alert" className="status-error">{visibleError}</p>}
              {latestConflict ? <>
                <p role="alert" className="text-sm">Hay cambios distintos en {conflictLabel}. La cola está pausada y tu copia local se conserva.</p>
                <div className="flex flex-wrap gap-2">
                  <button disabled={resolving} className="btn-secondary" onClick={() => void resolve(true)}>Conservar versión local</button>
                  <button disabled={resolving} className="btn-secondary" onClick={() => void resolve(false)}>Usar versión de la nube</button>
                </div>
              </> : <button className="btn-secondary" onClick={() => void retrySync().catch(error => setSyncActionError(String(error)))}>Reintentar sincronización</button>}
              {syncActionError && <p role="alert" className="status-error">{syncActionError}</p>}
            </section>
          )}
          {showInitialLoader ? (
            <p role="status" className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-secondary">
              Cargando entrenamientos…
            </p>
          ) : (
            <>
              <Outlet />
            </>
          )}
        </main>
      </div>

      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 grid min-h-[64px] grid-cols-4 border-t border-line bg-surface px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_24px_rgba(7,11,18,0.14)] backdrop-blur-sm lg:hidden">
        {navigation.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-bold transition ${
                (isActive || (path === '/' && location.pathname.startsWith('/entrenamiento')) || (path === '/progreso' && location.pathname.startsWith('/historial'))) ? 'bg-brand-soft text-brand' : 'text-subtle'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-1 h-0.5 w-5 rounded-full bg-brand" aria-hidden="true" />
                )}
            <Icon className="size-[18px]" strokeWidth={2.3} />
            {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

import { Activity, CalendarDays, ChartNoAxesColumnIncreasing, Dumbbell, LayoutDashboard } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useWorkouts } from '../../context/WorkoutContext'
import { templates } from '../../data/mockData'
import { getCurrentWeekSessions } from '../../utils/workout'
import { ThemeToggle } from '../ui/ThemeToggle'

const navigation = [
  { label: 'Inicio', path: '/', icon: LayoutDashboard },
  { label: 'Rutina', path: '/rutina', icon: CalendarDays },
  { label: 'Entrenar', path: '/entrenamiento', icon: Dumbbell },
  { label: 'Historial', path: '/historial', icon: ChartNoAxesColumnIncreasing }
]

const pageTitles: Record<string, string> = {
  '/': 'Resumen',
  '/rutina': 'Rutina semanal',
  '/entrenamiento': 'Entrenamiento',
  '/historial': 'Historial'
}

export function AppLayout() {
  const location = useLocation()
  const { sessions } = useWorkouts()
  const weeklySessionCount = getCurrentWeekSessions(sessions).length
  const weeklyProgress = Math.min(100, (weeklySessionCount / templates.length) * 100)
  const currentDate = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date())
  const title =
    Object.entries(pageTitles).find(([path]) =>
      path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
    )?.[1] ?? 'LiftTrack'

  return (
    <div className="min-h-dvh bg-canvas transition-colors lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <span className="grid size-11 place-items-center rounded-2xl bg-hero text-hero-accent shadow-sm">
            <Activity className="size-6" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-lg font-extrabold tracking-tight">LiftTrack</p>
            <p className="text-xs font-medium text-subtle">Training log</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${
                  isActive ? 'bg-brand-solid text-on-brand shadow-sm' : 'text-secondary hover:bg-muted hover:text-ink'
                }`
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl bg-brand-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Semana activa</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">
            {weeklySessionCount} / {templates.length}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${weeklyProgress}%` }}
            />
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur-xl md:px-8 lg:h-20">
          <div>
            <p className="hidden text-xs font-semibold capitalize text-subtle sm:block">{currentDate}</p>
            <h1 className="text-xl font-extrabold tracking-tight lg:text-2xl">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div aria-label="LiftTrack" className="grid size-10 place-items-center rounded-2xl bg-hero text-sm font-extrabold text-hero-accent shadow-sm">
              LT
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5 md:px-8 md:pt-7 lg:pb-12 lg:pt-8">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 grid min-h-[72px] grid-cols-4 border-t border-line bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-nav backdrop-blur-xl lg:hidden">
        {navigation.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-xs font-bold transition ${
                isActive ? 'bg-brand-soft text-brand' : 'text-subtle'
              }`
            }
          >
            <Icon className="size-5" strokeWidth={2.3} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { PendingWorkoutsPage } from './PendingWorkoutsPage'
import { WorkoutPage } from './WorkoutPage'
import { readWorkoutDrafts, workoutDraftKey, workoutDraftUrl, writeWorkoutDraft, type StoredWorkoutDraft } from '../services/workoutDraftStorage'
import { toLocalDateKey } from '../utils/date'
import type { WorkoutSession, WorkoutTemplate } from '../types'
import type { HistoryReader } from '../services/historyReader'
import { getWorkoutSessionId } from '../utils/workoutDraft'

const remote = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), upsert: vi.fn(), remove: vi.fn() }))
const auth = vi.hoisted(() => ({ user: null as null | { id: string } }))
vi.mock('../services/supabase/supabaseWorkoutDraftRepository', () => ({
  getRemoteWorkoutDraft: remote.get, listRemoteWorkoutDrafts: remote.list,
  upsertRemoteWorkoutDraft: remote.upsert, deleteRemoteWorkoutDraft: remote.remove
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }))
const friday: WorkoutTemplate = { id: 'viernes', name: 'Viernes', dayOfWeek: 5, exercises: [{
  id: 'item', templateId: 'viernes', exerciseId: 'press', order: 1, targetSets: 2, targetReps: '8'
}] }
const tuesday: WorkoutTemplate = { ...friday, id: 'martes', name: 'Martes', dayOfWeek: 2,
  exercises: [{ ...friday.exercises[0], id: 'tuesday-item', templateId: 'martes' }] }
const context = { ownerId: 'local', historyReader: undefined as HistoryReader | undefined, overview: undefined,
  sessions: [] as WorkoutSession[], templates: [friday, tuesday], exercises: [{ id: 'press', name: 'Press banca', active: true }],
  getExerciseById: () => ({ id: 'press', name: 'Press banca', active: true }),
  saveSession: vi.fn(), syncReady: true }
vi.mock('../context/WorkoutContext', () => ({ useWorkouts: () => context }))

function draft(template: WorkoutTemplate, date: string, hour: number): StoredWorkoutDraft {
  const startedAt = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`).toISOString()
  return { version: 3, started: true, userKey: 'local', templateId: template.id,
    dayOfWeek: template.dayOfWeek, localDate: date, startedAt, updatedAt: startedAt,
    status: 'active', template, viewMode: 'guided', logs: [{
      id: `log-${hour}`, sessionId: 'draft', exerciseId: 'press', order: 1, workingWeightKg: 50,
      sets: [1, 2].map(n => ({ id: `set-${hour}-${n}`, exerciseLogId: `log-${hour}`,
        setNumber: n, reps: '8', weightKg: 50, completed: n === 1 }))
    }] }
}
function mount(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/pendientes" element={<PendingWorkoutsPage />} />
    <Route path="/entrenamiento/:templateId" element={<WorkoutPage />} />
    <Route path="/historial" element={<p>Historial guardado</p>} />
  </Routes></MemoryRouter>)
}
async function settle() { await act(async () => { await Promise.resolve() }) }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 24, 10))
  localStorage.clear(); vi.resetAllMocks(); auth.user = null; context.ownerId = 'local'
  context.historyReader = undefined; context.sessions = []; context.templates = [friday, tuesday]
  context.saveSession.mockImplementation(async (session: WorkoutSession) => { context.sessions = [session] })
  remote.get.mockResolvedValue(null); remote.list.mockResolvedValue([]); remote.remove.mockResolvedValue(undefined)
  remote.upsert.mockImplementation(async (_day, _key, payload) => ({ payload, pending: true, updatedAt: payload.updatedAt }))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

it('abrir, cambiar de modo y editar peso/reps sin completar no crea pendiente', async () => {
  const page = mount('/entrenamiento/viernes'); await settle()
  fireEvent.change(screen.getByLabelText('Repeticiones de la serie 1 de Press banca'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText(/Peso de trabajo para Press/), { target: { value: '55' } })
  fireEvent.click(screen.getByRole('button', { name: 'Modo guiado' }))
  expect(readWorkoutDrafts('local')).toEqual([])
  page.unmount(); mount(); await settle()
  expect(screen.queryByRole('link', { name: /Ver pendientes/ })).toBeNull()
})

it('la primera serie fija jueves 24 para la rutina Viernes; el modo no cambia la identidad', async () => {
  const page = mount('/entrenamiento/viernes'); await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 1' }))
  const started = readWorkoutDrafts('local')[0]
  expect(started.template.name).toBe('Viernes')
  expect(started.localDate).toBe('2026-09-24')
  expect(started.startedAt).toBe(new Date(2026, 8, 24, 10).toISOString())
  fireEvent.click(screen.getByRole('button', { name: 'Modo guiado' }))
  fireEvent.click(screen.getByRole('button', { name: 'Vista completa' }))
  expect(readWorkoutDrafts('local')[0].startedAt).toBe(started.startedAt)
  page.unmount()
})

it('la fecha se fija al completar la primera serie, no al abrir la pantalla', async () => {
  const page = mount('/entrenamiento/viernes'); await settle()
  vi.setSystemTime(new Date(2026, 8, 25, 0, 5))
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 1' }))
  expect(readWorkoutDrafts('local')[0].localDate).toBe('2026-09-25')
  expect(readWorkoutDrafts('local')[0].template.name).toBe('Viernes')
  page.unmount()
})

it('dos pendientes aparecen por separado sin sustituir Hoy y se puede escoger uno', async () => {
  const first = draft(tuesday, '2026-09-22', 17)
  const second = draft(friday, '2026-09-24', 9)
  writeWorkoutDraft(first); writeWorkoutDraft(second)
  const page = mount(); await settle()
  expect(screen.getByRole('link', { name: /2 entrenamientos pendientes.*Ver pendientes/ })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Empezar entrenamiento' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: /Ver pendientes/ }))
  expect(screen.getByText('Martes')).toBeTruthy()
  expect(screen.getByText('Viernes')).toBeTruthy()
  expect(screen.getByText(/22 de septiembre.*1\/2 series/)).toBeTruthy()
  expect(screen.getAllByRole('link').some(link => link.getAttribute('href') === workoutDraftUrl(first))).toBe(true)
  page.unmount()
})

it('dos entrenamientos de la misma rutina y fecha mantienen identidades separadas', async () => {
  const first = draft(tuesday, '2026-09-22', 9)
  const second = draft(tuesday, '2026-09-22', 17)
  writeWorkoutDraft(first); writeWorkoutDraft(second)
  expect(readWorkoutDrafts('local')).toHaveLength(2)
  expect(workoutDraftUrl(first)).not.toBe(workoutDraftUrl(second))
})

it('volver desde Rutina a una rutina iniciada continúa el mismo draft', async () => {
  const first = draft(tuesday, '2026-09-22', 17)
  writeWorkoutDraft(first)
  const page = mount('/entrenamiento/martes'); await settle()
  expect(screen.getByRole('button', { name: 'Vista completa' })).toBeTruthy()
  expect(readWorkoutDrafts('local')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Vista completa' }))
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 2' }))
  expect(readWorkoutDrafts('local')).toHaveLength(1)
  expect(readWorkoutDrafts('local')[0].startedAt).toBe(first.startedAt)
  expect(readWorkoutDrafts('local')[0].logs[0].sets[1].completed).toBe(true)
  page.unmount()
})

it('navegar entre rutinas y volver no inicia otro draft de la primera', async () => {
  const page = render(<MemoryRouter initialEntries={['/entrenamiento/viernes']}>
    <Link to="/entrenamiento/martes">Ir a Martes</Link>
    <Link to="/entrenamiento/viernes">Volver a Viernes</Link>
    <Routes><Route path="/entrenamiento/:templateId" element={<WorkoutPage />} /></Routes>
  </MemoryRouter>)
  await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 1' }))
  const first = readWorkoutDrafts('local')[0]
  fireEvent.click(screen.getByRole('link', { name: 'Ir a Martes' })); await settle()
  fireEvent.click(screen.getByRole('link', { name: 'Volver a Viernes' })); await settle()
  expect(readWorkoutDrafts('local')).toHaveLength(1)
  expect(readWorkoutDrafts('local')[0].startedAt).toBe(first.startedAt)
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 2' }))
  expect(readWorkoutDrafts('local')).toHaveLength(1)
  page.unmount()
})

it('dos drafts de la misma rutina exigen elegir cuál continuar', async () => {
  writeWorkoutDraft(draft(tuesday, '2026-09-22', 9))
  writeWorkoutDraft(draft(tuesday, '2026-09-22', 17))
  mount('/entrenamiento/martes'); await settle()
  expect(screen.getByRole('heading', { name: 'Pendientes' })).toBeTruthy()
  expect(screen.getAllByText('Martes')).toHaveLength(2)
  expect(readWorkoutDrafts('local')).toHaveLength(2)
})

it('continuar el martes el miércoles conserva fecha, rutina e ID y elimina solo su draft', async () => {
  const first = draft(tuesday, '2026-09-22', 17)
  const other = draft(friday, '2026-09-23', 8)
  writeWorkoutDraft(first); writeWorkoutDraft(other)
  vi.setSystemTime(new Date(2026, 8, 23, 10))
  const page = mount(workoutDraftUrl(first)); await settle()
  expect(screen.getByText('Martes')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Vista completa' }))
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar y guardar' })); await settle()
  await settle()
  expect(screen.getByText('Historial guardado')).toBeTruthy()
  const saved = context.saveSession.mock.calls[0][0] as WorkoutSession
  expect(saved.startedAt).toBe(first.startedAt)
  expect(toLocalDateKey(saved.completedAt!)).toBe('2026-09-22')
  expect(saved.name).toBe('Martes')
  expect(saved).not.toHaveProperty('durationMinutes')
  expect(readWorkoutDrafts('local')).toEqual([other])
  expect(context.saveSession).toHaveBeenCalledTimes(1)
  page.unmount()
})

it('tras terminar uno se puede iniciar otro entrenamiento distinto de la misma rutina y fecha', async () => {
  const first = draft(tuesday, '2026-09-24', 8)
  writeWorkoutDraft(first)
  const page = mount('/entrenamiento/martes'); await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Vista completa' }))
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar y guardar' })); await settle(); await settle()
  expect(readWorkoutDrafts('local')).toHaveLength(0)
  page.unmount()
  vi.setSystemTime(new Date(2026, 8, 24, 12))
  const secondPage = mount('/entrenamiento/martes'); await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 1' }))
  const second = readWorkoutDrafts('local')[0]
  expect(second.startedAt).not.toBe(first.startedAt)
  expect(second.localDate).toBe(first.localDate)
  expect(context.sessions).toHaveLength(1)
  secondPage.unmount()
})

it('ignora datos legacy y corruptos sin impedir abrir Hoy', async () => {
  localStorage.setItem('lifttrack.workoutDraft.local.2026-09-22.martes', '{bad')
  localStorage.setItem('lifttrack.workoutDraft.local.2026-09-23.viernes', JSON.stringify({ ...draft(friday, '2026-09-23', 8), version: 2 }))
  mount(); await settle()
  expect(screen.getByRole('link', { name: 'Empezar entrenamiento' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: /Ver pendientes/ })).toBeNull()
  expect(localStorage.getItem('lifttrack.workoutDraft.local.2026-09-22.martes')).toBe('{bad')
})

it('descubre un pendiente real remoto en otro dispositivo sin bloquear Hoy', async () => {
  auth.user = { id: 'user-a' }; context.ownerId = 'user-a'
  const first = { ...draft(tuesday, '2026-09-22', 17), userKey: 'user:user-a' }
  const row = { draftKey: workoutDraftKey(first), dayOfWeek: first.dayOfWeek, payload: first, updatedAt: first.updatedAt }
  remote.list.mockResolvedValue([row]); remote.get.mockResolvedValue(row)
  mount(); expect(screen.getByRole('link', { name: 'Empezar entrenamiento' })).toBeTruthy()
  await settle(); await settle()
  expect(screen.getByRole('link', { name: /Ver pendientes/ })).toBeTruthy()
  expect(readWorkoutDrafts('user:user-a')).toHaveLength(1)
})

it('no mezcla pendientes de dos cuentas al cambiar de usuario', async () => {
  auth.user = { id: 'user-a' }; context.ownerId = 'user-a'
  const first = { ...draft(tuesday, '2026-09-22', 17), userKey: 'user:user-a' }
  writeWorkoutDraft(first)
  const page = mount(); await settle()
  expect(screen.getByRole('link', { name: /Ver pendientes/ })).toBeTruthy()
  auth.user = { id: 'user-b' }; context.ownerId = 'user-b'
  page.rerender(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<DashboardPage />} /></Routes></MemoryRouter>)
  await settle()
  expect(screen.queryByRole('link', { name: /Ver pendientes/ })).toBeNull()
  expect(readWorkoutDrafts('user:user-a')).toHaveLength(1)
})

it('descarta solo el draft remoto que comparte identidad estable con una sesión confirmada', async () => {
  auth.user = { id: 'user-a' }; context.ownerId = 'user-a'
  const first = { ...draft(tuesday, '2026-09-22', 17), userKey: 'user:user-a' }
  const row = { draftKey: workoutDraftKey(first), dayOfWeek: first.dayOfWeek, payload: first, updatedAt: first.updatedAt }
  remote.list.mockResolvedValue([row]); remote.get.mockResolvedValue(row)
  context.historyReader = { session: vi.fn().mockResolvedValue({
    id: getWorkoutSessionId(first.templateId, first.startedAt), startedAt: first.startedAt,
    completedAt: first.startedAt, templateId: first.templateId
  }) } as unknown as HistoryReader
  mount(); await settle(); await settle()
  expect(screen.queryByRole('link', { name: /Ver pendientes/ })).toBeNull()
  expect(remote.remove).toHaveBeenCalledWith(first.dayOfWeek, workoutDraftKey(first), 'user-a')
})

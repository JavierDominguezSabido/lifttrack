// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkoutPage } from './WorkoutPage'
import { getDatedLocalDraftKey } from '../utils/workoutLifecycle'
import { toLocalDateKey } from '../utils/date'

const mocks = vi.hoisted(() => ({ get: vi.fn(), upsert: vi.fn(), remove: vi.fn(), save: vi.fn() }))
vi.mock('../services/supabase/supabaseWorkoutDraftRepository', () => ({
  getRemoteWorkoutDraft: mocks.get, upsertRemoteWorkoutDraft: mocks.upsert, deleteRemoteWorkoutDraft: mocks.remove
}))
const user = { id: 'user-a' }
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user }) }))
const exercise = { id: 'press', name: 'Press banca', active: true }
const template = { id: 'lunes', name: 'Lunes', dayOfWeek: 1, exercises: [{
  id: 'template-press', templateId: 'lunes', exerciseId: 'press', order: 1, targetSets: 1, targetReps: '8'
}] }
const context = {
  ownerId: 'user:user-a', sessions: [], templates: [template], exercises: [exercise],
  getExerciseById: () => exercise, saveSession: mocks.save, syncReady: true
}
vi.mock('../context/WorkoutContext', () => ({ useWorkouts: () => context }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function mount() {
  return render(<MemoryRouter initialEntries={['/entrenamiento/lunes']}><Routes>
    <Route path="/entrenamiento/:templateId" element={<WorkoutPage />} />
    <Route path="/historial" element={<p>Historial guardado</p>} />
  </Routes></MemoryRouter>)
}
function localKey() { return getDatedLocalDraftKey('user:user-a', toLocalDateKey(new Date()), 'lunes') }
function stored() { return JSON.parse(localStorage.getItem(localKey())!) }
function edit(reps: string) {
  fireEvent.change(screen.getByLabelText('Repeticiones de la serie 1 de Press banca'), { target: { value: reps } })
}
async function settle() { await act(async () => { await Promise.resolve() }) }

describe('persistencia del entrenamiento ante fallos y respuestas tardías', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T10:00:00Z'))
    localStorage.clear()
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    mocks.get.mockResolvedValue(null)
    mocks.remove.mockResolvedValue(undefined)
    mocks.upsert.mockImplementation(async (_day, _key, payload) => ({ payload, updatedAt: new Date().toISOString() }))
    mocks.save.mockResolvedValue(undefined)
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

  it('guarda localmente aunque falle la lectura inicial de Supabase y recupera al reconectar', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Sin red'))
    mount()
    await settle()
    edit('12')
    expect(stored().logs[0].sets[0].reps).toBe('12')
    expect(screen.getByText('Guardado en este dispositivo · nube pendiente')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(mocks.upsert).not.toHaveBeenCalled()
    fireEvent(window, new Event('online'))
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(mocks.upsert.mock.calls[0][2].logs[0].sets[0].reps).toBe('12')
    expect(screen.getByText('Borrador sincronizado')).toBeTruthy()
  })

  it('no sustituye una edición por una lectura que llega tarde', async () => {
    const read = deferred<unknown>()
    mocks.get.mockReturnValueOnce(read.promise)
    mount()
    edit('12')
    const older = structuredClone(stored())
    older.logs[0].sets[0].reps = '3'
    await act(async () => { read.resolve({ payload: older, updatedAt: '2026-09-01T11:00:00Z' }) })
    expect(stored().logs[0].sets[0].reps).toBe('12')
    expect((screen.getByLabelText('Repeticiones de la serie 1 de Press banca') as HTMLInputElement).value).toBe('12')
  })

  it('una confirmación antigua no marca como sincronizada la edición más reciente', async () => {
    const first = deferred<unknown>()
    mocks.upsert.mockReturnValueOnce(first.promise)
    mount()
    await settle()
    edit('10')
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    edit('12')
    await act(async () => { first.resolve({ updatedAt: new Date().toISOString() }) })
    expect(screen.queryByText('Borrador sincronizado')).toBeNull()
    expect(stored().logs[0].sets[0].reps).toBe('12')
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(screen.getByText('Borrador sincronizado')).toBeTruthy()
    expect(mocks.upsert.mock.calls[1][2].logs[0].sets[0].reps).toBe('12')
  })

  it('conserva el borrador y reutiliza todos los identificadores tras un error y recarga', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Respuesta perdida'))
    const page = mount()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar y guardar' }))
    await settle()
    const first = mocks.save.mock.calls[0][0]
    expect(stored().startedAt).toBe(first.startedAt)
    expect(mocks.remove).not.toHaveBeenCalled()
    page.unmount()
    vi.setSystemTime(new Date('2026-09-01T10:05:00Z'))
    mount()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar y guardar' }))
    await settle()
    const retried = mocks.save.mock.calls[1][0]
    expect(retried.id).toBe(first.id)
    expect(retried.exerciseLogs).toEqual(first.exerciseLogs)
    expect(localStorage.getItem(localKey())).toBeNull()
    expect(screen.getByText('Historial guardado')).toBeTruthy()
  })

  it('avisa del fallo de almacenamiento local y permite reintentar sin perder la edición', async () => {
    mount()
    await settle()
    edit('10')
    const original = Storage.prototype.setItem
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith('lifttrack.workoutDraft')) throw new DOMException('Quota', 'QuotaExceededError')
      original.call(this, key, value)
    })
    edit('12')
    expect(screen.getByText('No se pudo guardar en este dispositivo')).toBeTruthy()
    expect(stored().logs[0].sets[0].reps).toBe('10')
    storage.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await settle()
    expect(stored().logs[0].sets[0].reps).toBe('12')
    expect(screen.queryByText('No se pudo guardar en este dispositivo')).toBeNull()
  })

  it('una subida tardía no recrea el borrador después de finalizar', async () => {
    const upload = deferred<unknown>()
    mocks.upsert.mockReturnValueOnce(upload.promise)
    mount()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 1' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar y guardar' }))
    await settle()
    await act(async () => { upload.resolve({ updatedAt: new Date().toISOString() }) })
    expect(localStorage.getItem(localKey())).toBeNull()
    expect(screen.getByText('Historial guardado')).toBeTruthy()
  })

  it('una finalización pendiente no borra ediciones realizadas después de reabrir la pantalla', async () => {
    const save = deferred<void>()
    mocks.save.mockReturnValueOnce(save.promise)
    const page = mount()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como hecha la serie 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar y guardar' }))
    page.unmount()
    mount()
    await settle()
    edit('12')
    await act(async () => { save.resolve() })
    expect(stored().logs[0].sets[0].reps).toBe('12')
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(screen.queryByText('Historial guardado')).toBeNull()
  })
})

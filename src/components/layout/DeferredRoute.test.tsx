// @vitest-environment jsdom
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { lazy, useState } from 'react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { DeferredRoute } from './DeferredRoute'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('conserva la navegación mientras carga y reutiliza el módulo al volver', async () => {
  let resolve!: (module: { default: () => JSX.Element }) => void
  const load = vi.fn(() => new Promise<{ default: () => JSX.Element }>(done => { resolve = done }))
  const Page = lazy(load)
  function Layout() {
    const { pathname } = useLocation()
    return <><Link to="/">Hoy</Link><Link to="/progreso">Progreso</Link>
      <DeferredRoute resetKey={pathname}><Routes>
        <Route path="/" element={<p>Pantalla inicial</p>} />
        <Route path="/progreso" element={<Page />} />
      </Routes></DeferredRoute></>
  }
  render(<MemoryRouter initialEntries={['/progreso']}><Layout /></MemoryRouter>)
  expect(screen.getByRole('status').textContent).toBe('Cargando pantalla…')
  expect(screen.getByRole('link', { name: 'Hoy' })).toBeTruthy()
  await act(async () => { resolve({ default: () => <p>Progreso cargado</p> }) })
  expect(screen.getByText('Progreso cargado')).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Hoy' }))
  expect(screen.getByText('Pantalla inicial')).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Progreso' }))
  expect(screen.getByText('Progreso cargado')).toBeTruthy()
  expect(load).toHaveBeenCalledTimes(1)
})

it('un módulo fallido ofrece recuperación y permite abrir otra ruta', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const FailedPage = lazy(async () => { throw new Error('Failed to fetch dynamically imported module') })
  const view = render(<DeferredRoute resetKey="failed"><FailedPage /></DeferredRoute>)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Recargar pantalla' })).toBeTruthy()
  view.rerender(<DeferredRoute resetKey="home"><p>Hoy disponible</p></DeferredRoute>)
  expect(screen.getByText('Hoy disponible')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('cambiar de ruta no remonta un formulario compartido entre rutas', () => {
  function Form() {
    const [value, setValue] = useState('')
    return <input aria-label="Nota" value={value} onChange={event => setValue(event.target.value)} />
  }
  const view = render(<DeferredRoute resetKey="first"><Form /></DeferredRoute>)
  fireEvent.change(screen.getByRole('textbox', { name: 'Nota' }), { target: { value: 'Sin guardar' } })
  view.rerender(<DeferredRoute resetKey="second"><Form /></DeferredRoute>)
  expect((screen.getByRole('textbox', { name: 'Nota' }) as HTMLInputElement).value).toBe('Sin guardar')
})

// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { confirmAction } from './confirmAction'
afterEach(()=>{document.body.innerHTML='';document.body.style.overflow=''})
it('diálogo real: foco, tabulación, Escape y restauración del contenido',async()=>{
  document.body.innerHTML='<main id="root"><button>Origen</button></main>'
  const origin=screen.getByRole('button',{name:'Origen'});origin.focus()
  let result!:Promise<boolean>
  await act(async()=>{result=confirmAction('Eliminar sesión',{confirmLabel:'Eliminar'})})
  expect(document.getElementById('root')!.inert).toBe(true)
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Cancelar'}))
  fireEvent.keyDown(document.activeElement!,{key:'Tab'})
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Eliminar'}))
  fireEvent.keyDown(document.activeElement!,{key:'Escape'})
  expect(await result).toBe(false)
  expect(document.activeElement).toBe(origin)
  expect(document.getElementById('root')!.inert).toBe(false)
  expect(document.body.style.overflow).toBe('')
})
it('confirmar devuelve true y cierra; navegar cancela sin ejecutar acción',async()=>{
  let result!:Promise<boolean>
  await act(async()=>{result=confirmAction('Guardar')})
  fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
  expect(await result).toBe(true)
  await act(async()=>{result=confirmAction('Eliminar')})
  await act(async()=>{window.dispatchEvent(new PopStateEvent('popstate'))})
  expect(await result).toBe(false)
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
})

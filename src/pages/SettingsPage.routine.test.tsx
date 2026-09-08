// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { RoutinePage } from './RoutinePage'
import { WorkoutContext, type WorkoutContextValue } from '../context/WorkoutContext'
import type { Exercise, WorkoutTemplate } from '../types'

const mocks=vi.hoisted(()=>({confirm:vi.fn(),save:vi.fn(),create:vi.fn(),update:vi.fn()}))
vi.mock('../components/ui/confirmAction',()=>({confirmAction:mocks.confirm}))
const catalog:Exercise[]=[{id:'press',name:'Press',active:true,muscleGroup:'Pecho'},{id:'row',name:'Remo',active:true,muscleGroup:'Espalda'},{id:'curl',name:'Curl',active:true,muscleGroup:'Bíceps'}]
const routine:WorkoutTemplate[]=[{id:'fri',name:'Viernes',dayOfWeek:5,exercises:['press','row'].map((id,i)=>({id:'item-'+id,templateId:'fri',exerciseId:id,order:i+1,targetSets:3,targetReps:'10',restSeconds:90}))},{id:'sat',name:'Sábado',dayOfWeek:6,exercises:[]}]
function Harness({path}:{path:string}) {
  const [exercises,setExercises]=useState(catalog),[templates,setTemplates]=useState(routine)
  const value={ownerId:'local',exercises,templates,getExerciseById:(id:string)=>exercises.find(e=>e.id===id),
    createExercise:(input:Omit<Exercise,'id'>)=>{const e={...input,id:'new'};mocks.create(e);setExercises(list=>[...list,e]);return e},
    updateExercise:(e:Exercise)=>{mocks.update(e);setExercises(list=>list.map(old=>old.id===e.id?e:old))},
    archiveExercise:(id:string)=>{if(templates.some(t=>t.exercises.some(e=>e.exerciseId===id)))return false;setExercises(list=>list.map(e=>e.id===id?{...e,active:false}:e));return true},
    saveTemplates:(next:WorkoutTemplate[])=>{mocks.save(next);setTemplates(next)}
  } as unknown as WorkoutContextValue
  return <WorkoutContext.Provider value={value}><MemoryRouter initialEntries={[path]}><Routes><Route path="/rutina" element={<RoutinePage/>}/><Route path="/rutina/editar" element={<SettingsPage/>}/><Route path="/rutina/ejercicios" element={<SettingsPage/>}/></Routes></MemoryRouter></WorkoutContext.Provider>
}
function mount(path='/rutina/ejercicios'){return render(<StrictMode><Harness path={path}/></StrictMode>)}
function exerciseCard(name:string){return within(screen.getByRole('heading',{name}).closest('article')!)}
beforeEach(()=>{
  sessionStorage.clear();vi.resetAllMocks();mocks.confirm.mockResolvedValue(true)
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{})
  Element.prototype.scrollIntoView=vi.fn()
})
afterEach(()=>{cleanup();vi.restoreAllMocks()})

it('Añadir abre, revela y enfoca el formulario; crea y guarda localmente',async()=>{
  mount();fireEvent.click(screen.getByRole('button',{name:'Añadir ejercicio'}))
  await screen.findByRole('heading',{name:'Nuevo ejercicio'})
  const name=screen.getByLabelText('Nombre *')
  expect(document.activeElement).toBe(name);expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  fireEvent.change(name,{target:{value:'Sentadilla'}})
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}))
  await screen.findByRole('heading',{name:'Sentadilla'})
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({name:'Sentadilla',active:true}))
  expect(screen.queryByRole('heading',{name:'Nuevo ejercicio'})).toBeNull()
})
it('Editar abre el ejercicio correcto y guarda sin conservar datos de otro formulario',async()=>{
  mount();fireEvent.click(exerciseCard('Press').getByRole('button',{name:'Editar'}))
  await screen.findByRole('heading',{name:'Editar ejercicio'})
  expect((screen.getByLabelText('Nombre *') as HTMLInputElement).value).toBe('Press')
  fireEvent.change(screen.getByLabelText('Nombre *'),{target:{value:'Press banca'}})
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}))
  await screen.findByRole('heading',{name:'Press banca'})
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({id:'press',name:'Press banca'}))
  fireEvent.click(exerciseCard('Remo').getByRole('button',{name:'Editar'}))
  await waitFor(()=>expect((screen.getByLabelText('Nombre *') as HTMLInputElement).value).toBe('Remo'))
  expect(document.activeElement).toBe(screen.getByLabelText('Nombre *'))
})
it('protege los cambios de ejercicio al cambiar de formulario',async()=>{
  mount();fireEvent.click(exerciseCard('Press').getByRole('button',{name:'Editar'}));await screen.findByLabelText('Nombre *')
  fireEvent.change(screen.getByLabelText('Nombre *'),{target:{value:'Borrador'}})
  mocks.confirm.mockResolvedValue(false)
  fireEvent.click(screen.getByRole('button',{name:'Añadir ejercicio'}))
  await waitFor(()=>expect(mocks.confirm).toHaveBeenCalled())
  expect((screen.getByLabelText('Nombre *') as HTMLInputElement).value).toBe('Borrador')
})
it('archiva y activa, pero conserva la restricción de ejercicios en uso',async()=>{
  mount();fireEvent.click(exerciseCard('Press').getByRole('button',{name:'Archivar'}))
  await screen.findByText('Quita el ejercicio de todos los días y guarda la rutina antes de archivarlo.')
  fireEvent.click(exerciseCard('Curl').getByRole('button',{name:'Archivar'}))
  await waitFor(()=>expect(screen.queryByRole('heading',{name:'Curl'})).toBeNull())
  fireEvent.click(screen.getByRole('button',{name:'Archivados'}))
  fireEvent.click(exerciseCard('Curl').getByRole('button',{name:'Activar'}))
  await screen.findByText('Ejercicio activado.')
  fireEvent.click(screen.getByRole('button',{name:'Activos'}))
  expect(exerciseCard('Curl').getByText('Activo')).toBeTruthy()
})
it('Objetivo, Descanso y Nota registran dirty y se guardan sin perder foco',()=>{
  mount('/rutina/editar')
  const save=screen.getByRole('button',{name:'Guardar cambios'}) as HTMLButtonElement
  expect(save.disabled).toBe(true)
  const target=screen.getByLabelText(/Objetivo de Press/);target.focus()
  fireEvent.change(target,{target:{value:'8x3'}})
  expect(document.activeElement).toBe(target);expect(save.disabled).toBe(false)
  const rest=screen.getByLabelText(/Descanso de Press/);rest.focus()
  fireEvent.change(rest,{target:{value:'2:00'}})
  expect(document.activeElement).toBe(rest)
  fireEvent.change(screen.getAllByLabelText('Nota para esta rutina')[0],{target:{value:'Pausa abajo'}})
  fireEvent.click(save)
  expect(mocks.save.mock.lastCall?.[0][0].exercises[0]).toMatchObject({targetReps:'8',targetSets:3,restSeconds:120,notes:'Pausa abajo'})
})
it('retiene texto incompleto, impide guardar inválidos y descarta el borrador',async()=>{
  mount('/rutina/editar');const target=screen.getByLabelText(/Objetivo de Press/)
  fireEvent.change(target,{target:{value:'8x'}})
  expect((screen.getByRole('button',{name:'Guardar cambios'}) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}))
  expect(mocks.save).not.toHaveBeenCalled();expect((target as HTMLInputElement).value).toBe('8x')
  expect(target.getAttribute('aria-invalid')).toBe('true')
  fireEvent.click(screen.getByRole('button',{name:'Descartar cambios'}))
  await waitFor(()=>expect((screen.getByLabelText(/Objetivo de Press/) as HTMLInputElement).value).toBe('10x3'))
})
it('reordena, quita y añade desde biblioteca manteniendo IDs y orden',()=>{
  mount('/rutina/editar');fireEvent.click(screen.getByRole('button',{name:'Bajar Press'}))
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}))
  expect(mocks.save.mock.lastCall?.[0][0].exercises.map((e:{exerciseId:string;order:number})=>[e.exerciseId,e.order])).toEqual([['row',1],['press',2]])
  fireEvent.click(screen.getAllByRole('button',{name:'Quitar del día'})[0])
  fireEvent.change(screen.getByLabelText('Ejercicio para Viernes'),{target:{value:'curl'}})
  fireEvent.click(screen.getAllByRole('button',{name:'Añadir al día'})[0])
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}))
  expect(mocks.save.mock.lastCall?.[0][0].exercises.map((e:{exerciseId:string;order:number})=>[e.exerciseId,e.order])).toEqual([['press',1],['curl',2]])
})
it('crea desde edición, vuelve y conserva el borrador de rutina',async()=>{
  mount('/rutina/editar')
  fireEvent.change(screen.getByLabelText(/Objetivo de Press/),{target:{value:'7x3'}})
  fireEvent.click(screen.getAllByRole('button',{name:'¿No está en la lista? Crear ejercicio nuevo'})[0])
  await screen.findByRole('heading',{name:'Nuevo ejercicio'})
  fireEvent.change(screen.getByLabelText('Nombre *'),{target:{value:'Nuevo'}})
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}))
  fireEvent.click(screen.getByRole('link',{name:'Volver a editar rutina'}))
  await waitFor(()=>expect((screen.getByLabelText(/Objetivo de Press/) as HTMLInputElement).value).toBe('7x3'))
  fireEvent.change(screen.getByLabelText('Ejercicio para Viernes'),{target:{value:'new'}})
  fireEvent.click(screen.getAllByRole('button',{name:'Añadir al día'})[0])
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}))
  expect(mocks.save.mock.lastCall?.[0][0].exercises.at(-1).exerciseId).toBe('new')
  fireEvent.click(screen.getByRole('button',{name:'Volver a rutina'}))
  await screen.findByRole('heading',{name:'Tu semana de entrenamiento'})
})
it('edición tiene una columna y espacio inferior reservado para la barra fija',()=>{
  const {container}=mount('/rutina/editar')
  const days=screen.getByRole('region',{name:'Editar entrenamientos por día'})
  expect(days.className).toContain('grid-cols-1');expect(days.className).not.toContain('xl:grid-cols-2')
  const editor=container.querySelector('.routine-editor')!
  expect(editor.className).toContain('pb-[calc(12rem+env(safe-area-inset-bottom))]')
  expect(editor.className).toContain('lg:pb-28')
})

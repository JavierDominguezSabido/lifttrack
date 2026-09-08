// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HistoryPage } from './HistoryPage'
import { EditSessionPage } from './EditSessionPage'
import { HistoryReader } from '../services/historyReader'
import type { WorkoutSession } from '../types'
const mock=vi.hoisted(()=>({rpc:vi.fn(),save:vi.fn(),context:{} as Record<string,unknown>}))
vi.mock('../services/supabase/supabaseClient',()=>({supabase:{rpc:mock.rpc}}))
vi.mock('../context/WorkoutContext',()=>({useWorkouts:()=>mock.context}))
const exercise={id:'press',name:'Press',muscleGroup:'Pecho',active:true}
const sessions:WorkoutSession[]=Array.from({length:35},(_,i)=>({id:'s'+i,name:'Sesión '+i,dayOfWeek:1,startedAt:new Date(Date.UTC(2026,8,7-i,10)).toISOString(),completedAt:new Date(Date.UTC(2026,8,7-i,11)).toISOString(),exerciseLogs:[{id:'l'+i,sessionId:'s'+i,exerciseId:'press',order:1,sets:[{id:'set'+i,exerciseLogId:'l'+i,setNumber:1,reps:8,weightKg:60,completed:true}]}]}))
beforeEach(()=>{
  localStorage.clear();vi.resetAllMocks();vi.spyOn(window,'scrollTo').mockImplementation(()=>{})
  mock.context={sessions:[],exercises:[exercise],templates:[],ownerId:'a',historyReader:new HistoryReader('a'),overview:{sessionCount:35,activeWeeks:6,streakWeeks:6,totalVolume:16800,exerciseLogCounts:{press:35},currentWeekCompletedDays:[1],weekProbes:[]},getExerciseById:()=>exercise,deleteSession:vi.fn(),saveSession:mock.save}
  mock.rpc.mockImplementation(async(name,args)=>{
    if(name==='lifttrack_read_session_v1')return {data:sessions.find(s=>s.id===args.p_session_id)??null,error:null}
    if(name==='lifttrack_read_exercise_progress_v4')return {data:{sessionCount:35,bestWeight:60,accumulatedVolume:16800,latest:{sessionId:'s0',logId:'l0',date:sessions[0].completedAt,startedAt:sessions[0].startedAt,weightKg:60,reps:[8]},entries:[{sessionId:'s0',logId:'l0',date:sessions[0].completedAt,startedAt:sessions[0].startedAt,weightKg:60,reps:[8],volumeKg:480}],hasMore:true},error:null}
    const filtered=args.p_search_exercise_ids?.length===0?[]:sessions
    const offset=args.p_cursor?Number(args.p_cursor.id.slice(1))+1:0
    const items=filtered.slice(offset,offset+args.p_limit),more=offset+items.length<filtered.length
    return {data:{items,totalCount:35,filteredCount:filtered.length,hasMore:more,nextCursor:more?{id:items.at(-1)!.id}:null},error:null}
  })
})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
function mount(path='/progreso') {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><Link to="/other">Otra pantalla</Link><Link to="/progreso">Volver a Progreso</Link><Routes><Route path="/progreso" element={<HistoryPage/>}/><Route path="/other" element={<p>Otra vista</p>}/><Route path="/progreso/sesion/:sessionId/editar" element={<EditSessionPage/>}/></Routes></MemoryRouter></StrictMode>)
}
it('primera carga, cargar más y navegación reutilizan RPC sin descargar todo',async()=>{
  mount();await screen.findByText('35 de 35 sesiones')
  expect(screen.getAllByRole('article')).toHaveLength(10)
  expect(mock.rpc).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'Ver más sesiones'}))
  await waitFor(()=>expect(screen.getAllByRole('article')).toHaveLength(20))
  expect(mock.rpc).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByText('Otra pantalla'));await screen.findByText('Otra vista')
  fireEvent.click(screen.getByText('Volver a Progreso'));await screen.findByText('35 de 35 sesiones')
  expect(screen.getAllByRole('article')).toHaveLength(10);expect(mock.rpc).toHaveBeenCalledTimes(2)
})
it('cambiar búsqueda reinicia cursor y muestra conteo filtrado exacto',async()=>{
  mount();await screen.findByText('35 de 35 sesiones')
  fireEvent.click(screen.getByRole('button',{name:'Ver más sesiones'}));await waitFor(()=>expect(screen.getAllByRole('article')).toHaveLength(20))
  fireEvent.click(screen.getByRole('button',{name:/Filtros/}))
  fireEvent.change(screen.getByPlaceholderText('Nombre de ejercicio'),{target:{value:'inexistente'}})
  await screen.findByText('0 de 35 sesiones')
  expect(mock.rpc.mock.lastCall?.[1].p_cursor).toBeNull();expect(mock.rpc.mock.lastCall?.[1].p_search_exercise_ids).toEqual([])
  expect(screen.queryAllByRole('article')).toHaveLength(0)
})
it('Por ejercicio usa agregados y detalle paginado; la gráfica conserva sus registros',async()=>{
  mount('/progreso?vista=progress');await screen.findByRole('img',{name:/Evolución del peso de trabajo/})
  expect(mock.rpc.mock.calls.some(([name])=>name==='lifttrack_read_exercise_progress_v4')).toBe(true)
  expect(mock.rpc.mock.calls.filter(([name])=>name==='lifttrack_read_sessions_page_v3')).toHaveLength(1)
})
it('edición histórica directa no requiere la rutina ni el historial descargado y preserva cambios sin guardar',async()=>{
  mount('/progreso/sesion/s34/editar')
  const reps=await screen.findByLabelText('Repeticiones de la serie 1 de Press')
  fireEvent.change(reps,{target:{value:'12'}})
  await act(async()=>{(mock.context.historyReader as HistoryReader).invalidate()})
  expect((screen.getByLabelText('Repeticiones de la serie 1 de Press') as HTMLInputElement).value).toBe('12')
  expect(mock.rpc.mock.calls.every(([name])=>name==='lifttrack_read_session_v1')).toBe(true)
})
it('historial vacío confirmado muestra el estado inicial y no inventa métricas',async()=>{
  mock.context.overview={sessionCount:0,totalVolume:0,activeWeeks:0,streakWeeks:0,exerciseLogCounts:{},currentWeekCompletedDays:[],weekProbes:[]}
  mock.rpc.mockResolvedValue({data:{items:[],totalCount:0,filteredCount:0,hasMore:false,nextCursor:null},error:null})
  mount();await screen.findByText('Tu progreso empieza con una sesión')
  expect(screen.queryByRole('button',{name:'Ver más sesiones'})).toBeNull()
  expect(screen.queryAllByRole('article')).toHaveLength(0)
})

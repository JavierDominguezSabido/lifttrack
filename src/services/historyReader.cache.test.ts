// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { HistoryReader, StaleHistoryRead } from './historyReader'
import { enqueueSyncOperation } from './syncOutbox'
import type { WorkoutSession } from '../types'

const remote = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase/supabaseClient', () => ({ supabase: { rpc: remote.rpc } }))

beforeEach(() => { localStorage.clear(); remote.rpc.mockReset() })

const savedSession:WorkoutSession={
  id:'new-session',templateId:'martes',name:'Martes',dayOfWeek:2,
  startedAt:'2026-09-22T10:00:00Z',completedAt:'2026-09-22T10:30:00Z',
  exerciseLogs:[{id:'new-log',sessionId:'new-session',exerciseId:'press',order:1,workingWeightKg:65,
    sets:[{id:'new-set',exerciseLogId:'new-log',setNumber:1,reps:8,weightKg:65,completed:true}]}]
}

it('muestra el último rendimiento cacheado sin esperar una lectura remota y lo aísla por cuenta', () => {
  localStorage.setItem('lifttrack:performance:v1:user-a:["press"]', JSON.stringify({
    sessionId: 'session-a', startedAt: '2026-09-22T10:00:00.000Z',
    performedAt: '2026-09-22T10:30:00.000Z', weightKg: 60, reps: [8]
  }))
  expect(new HistoryReader('user-a').cachedPerformance('press', ['press'])?.weightKg).toBe(60)
  expect(new HistoryReader('user-b').cachedPerformance('press', ['press'])).toBeUndefined()
})

it('ignora una lectura cacheada corrupta sin bloquear el entrenamiento', () => {
  localStorage.setItem('lifttrack:performance:v1:user-a:["press"]', '{invalid')
  expect(new HistoryReader('user-a').cachedPerformance('press', ['press'])).toBeUndefined()
})

it('invalida solo el último rendimiento de la cuenta modificada', () => {
  const value = JSON.stringify({ sessionId: 'old', startedAt: '2026-09-20T10:00:00Z',
    performedAt: '2026-09-20T10:30:00Z', weightKg: 50, reps: [8] })
  localStorage.setItem('lifttrack:performance:v1:user-a:["press"]', value)
  localStorage.setItem('lifttrack:performance:v1:user-b:["press"]', value)
  const reader = new HistoryReader('user-a')
  reader.invalidatePerformanceCache()
  reader.invalidate()
  expect(reader.cachedPerformance('press', ['press'])).toBeUndefined()
  expect(new HistoryReader('user-b').cachedPerformance('press', ['press'])?.weightKg).toBe(50)
})

it('una respuesta anterior a la invalidación no vuelve a cachear peso obsoleto', async () => {
  let answer!: (value: unknown) => void
  remote.rpc.mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
  const reader = new HistoryReader('user-a')
  const pending = reader.performance('press', ['press'])
  reader.invalidatePerformanceCache()
  reader.invalidate()
  answer({ data: { sessionId: 'old', startedAt: '2026-09-20T10:00:00Z',
    performedAt: '2026-09-20T10:30:00Z', weightKg: 50, reps: [8] }, error: null })
  await expect(pending).rejects.toBeInstanceOf(StaleHistoryRead)
  expect(reader.cachedPerformance('press', ['press'])).toBeUndefined()
})

it('tras guardar, el rendimiento nuevo está disponible de inmediato incluso con outbox pendiente', () => {
  const reader=new HistoryReader('user-a')
  localStorage.setItem('lifttrack:performance:v1:user-a:["press"]',JSON.stringify({
    sessionId:'old',startedAt:'2026-09-20T10:00:00Z',performedAt:'2026-09-20T10:30:00Z',weightKg:50,reps:[8]
  }))
  enqueueSyncOperation('user-a','session:new-session',{action:'save',session:savedSession})
  reader.invalidate();reader.rememberSavedSession(savedSession)
  expect(reader.cachedPerformance('press',['press'])?.weightKg).toBe(65)
  reader.invalidate()
  expect(reader.cachedPerformance('press',['press'])?.weightKg).toBe(65)
  expect(new HistoryReader('user-a').cachedPerformance('press',['press'])?.sessionId).toBe('new-session')
  expect(new HistoryReader('user-b').cachedPerformance('press',['press'])).toBeUndefined()
})

it('guardar un pendiente antiguo conserva como Última vez una sesión posterior ya conocida', () => {
  localStorage.setItem('lifttrack:performance:v1:user-a:["press"]',JSON.stringify({
    sessionId:'later',startedAt:'2026-09-24T10:00:00Z',performedAt:'2026-09-24T10:30:00Z',weightKg:70,reps:[8]
  }))
  const reader=new HistoryReader('user-a')
  reader.rememberSavedSession(savedSession)
  expect(reader.cachedPerformance('press',['press'])?.sessionId).toBe('later')
})

it('un remoto rezagado no sustituye el guardado local y editarlo lo retira de la caché', async () => {
  const reader=new HistoryReader('user-a')
  reader.rememberSavedSession(savedSession)
  remote.rpc.mockResolvedValue({data:{sessionId:'old',startedAt:'2026-09-20T10:00:00Z',
    performedAt:'2026-09-20T10:30:00Z',weightKg:50,reps:[8]},error:null})
  expect((await reader.performance('press',['press']))?.weightKg).toBe(65)
  expect(reader.cachedPerformance('press',['press'])?.weightKg).toBe(65)
  reader.forgetSavedSession(savedSession.id);reader.invalidatePerformanceCache();reader.invalidate()
  expect(reader.cachedPerformance('press',['press'])).toBeUndefined()
})

it('la caché conserva el primer log de equivalentes dentro de la sesión', () => {
  const reader=new HistoryReader('user-a')
  reader.rememberSavedSession({...savedSession,exerciseLogs:[
    {...savedSession.exerciseLogs[0],id:'old-log',exerciseId:'press-old',order:1,workingWeightKg:60},
    {...savedSession.exerciseLogs[0],order:2,workingWeightKg:65}
  ]})
  expect(reader.cachedPerformance('press',['press','press-old'])?.weightKg).toBe(60)
})

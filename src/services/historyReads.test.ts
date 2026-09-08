// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkoutSession } from '../types'
import { HistoryPager, compareSessions, matchesSession, pendingHistory, reconcileOverview, reconcilePerformance, reconcileProgress, type SessionFilters } from './historyReads'
import { HistoryReader, ReadContractError, StaleHistoryRead } from './historyReader'
import { enqueueSyncOperation, type SyncOperation } from './syncOutbox'

const client=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('./supabase/supabaseClient',()=>({supabase:client}))
const filters:SessionFilters={exerciseIds:null,searchIds:null,day:null,from:null,to:null,templateDays:{}}
function session(id:string,weight=60,date='2026-09-07T10:00:00Z'):WorkoutSession {
  return {id,name:id,dayOfWeek:1,startedAt:date,completedAt:date,exerciseLogs:[{id:id+'-log',sessionId:id,exerciseId:'press',order:1,sets:[{id:id+'-set',exerciseLogId:id+'-log',setNumber:1,reps:8,weightKg:weight,completed:true}]}]}
}
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();vi.spyOn(navigator,'onLine','get').mockReturnValue(true)})

describe('lecturas paginadas y reconciliación real del frontend',()=>{
  it('reduce la última operación por recurso e incluye altas, errores y conflictos',()=>{
    const operation=(id:string,sequence:number,action:'save'|'delete',status:SyncOperation['status']='pending'):SyncOperation=>({owner:'a',id:String(sequence),resource:'session:'+id,sequence,expected:'empty',status,payload:{action,session:action==='save'?session(id,sequence):undefined}})
    const p=pendingHistory([operation('new',1,'save'),operation('edit',2,'save'),operation('delete',3,'save'),operation('edit',4,'save','conflict'),operation('delete',5,'delete','error'),operation('done',6,'save','done')])
    expect(p.excluded).toEqual(['delete','edit','new'])
    expect(p.local.map(s=>[s.id,s.exerciseLogs[0].sets[0].weightKg])).toEqual([['new',1],['edit',4]])
  })
  it('1.005 sesiones: mezcla estable, buffer real, conteos y ausencia de duplicados',async()=>{
    const source=Array.from({length:1005},(_,i)=>session('s-'+String(i).padStart(4,'0'))).sort(compareSessions)
    const excluded=['s-1004','new'],local=[session('new',80,'2026-09-08T10:00:00Z')]
    const remote=source.filter(s=>!excluded.includes(s.id)),load=vi.fn(async(cursor:unknown)=>{
      const start=cursor===null?0:Number((cursor as {offset:number}).offset),items=remote.slice(start,start+10)
      return {items,totalCount:remote.length,filteredCount:remote.length,hasMore:start+10<remote.length,nextCursor:start+10<remote.length?{offset:start+10}:null}
    })
    const pager=new HistoryPager(load,local,filters)
    await pager.more(7);expect(load).toHaveBeenCalledTimes(1);expect(pager.items).toHaveLength(7)
    await pager.more(3);expect(load).toHaveBeenCalledTimes(1)
    while(pager.hasMore)await pager.more(17)
    const expected=[...remote,...local].sort(compareSessions)
    expect(pager.items.map(s=>s.id)).toEqual(expected.map(s=>s.id))
    expect(new Set(pager.items.map(s=>s.id)).size).toBe(1005)
    expect(pager.totalCount).toBe(1005);expect(pager.filteredCount).toBe(1005)
    expect(load).toHaveBeenCalledTimes(101)
  })
  it('filtros independientes, fechas y día histórico se aplican a la versión local',()=>{
    const s=session('s');s.templateId='old';s.exerciseLogs.push({...s.exerciseLogs[0],id:'row',exerciseId:'row',order:2})
    expect(matchesSession(s,{...filters,exerciseIds:['press'],searchIds:['row'],day:1,from:s.startedAt,to:'2026-09-08Z'})).toBe(true)
    expect(matchesSession(s,{...filters,searchIds:[]})).toBe(false)
    expect(matchesSession(s,{...filters,to:s.startedAt})).toBe(false)
    expect(matchesSession({...s,dayOfWeek:undefined as unknown as number},{...filters,day:4,templateDays:{old:4}})).toBe(true)
    expect(matchesSession({...s,id:'initial-s'},filters)).toBe(false)
  })
  it('máximo remoto fuera de recientes se combina con modificaciones y altas locales',()=>{
    const remote={sessionCount:11,bestWeight:95,accumulatedVolume:5000,entries:[],hasMore:true}
    expect(reconcileProgress(remote,[session('changed',40)],['press'],8)).toMatchObject({sessionCount:12,bestWeight:95,accumulatedVolume:5320})
    expect(reconcileProgress(remote,[session('new',110)],['press'],8).bestWeight).toBe(110)
    expect(reconcileProgress(remote,[],['press'],8).bestWeight).toBe(95)
  })
  it('overview une semanas y repara huecos en una racha sin cargar sus sesiones',()=>{
    const local=[session('new',60,'2026-09-07T10:00:00Z'),session('gap',60,'2026-08-24T10:00:00Z')]
    const result=reconcileOverview({sessionCount:3,totalVolume:100,activeWeeks:3,streakWeeks:0,exerciseLogCounts:{press:3},currentWeekCompletedDays:[],weekProbes:[{weekStart:'2026-09-07',active:false,completedRunStart:null},{weekStart:'2026-08-31',active:true,completedRunStart:'2026-08-31'},{weekStart:'2026-08-24',active:false,completedRunStart:null},{weekStart:'2026-08-17',active:true,completedRunStart:'2026-08-10'}]},local,new Date('2026-09-07T12:00:00Z'))
    expect(result).toMatchObject({sessionCount:5,totalVolume:1060,activeWeeks:5,streakWeeks:5,exerciseLogCounts:{press:5},currentWeekCompletedDays:[1]})
    expect(result.latestSession?.id).toBe('new')
  })
  it('último rendimiento respeta reales/semillas y descarta calentamientos',()=>{
    const remote={exerciseId:'press',sessionId:'initial-remote',startedAt:'2040-01-01Z',performedAt:'2040-01-01Z',weightKg:500,reps:[1]}
    expect(reconcilePerformance(remote,[session('real',40)],'press',['press'])?.weightKg).toBe(40)
    const warm=session('warm',100);warm.exerciseLogs[0].sets[0].isWarmup=true
    expect(reconcilePerformance(remote,[warm],'press',['press'])?.sessionId).toBe('initial-remote')
  })
})

describe('caché, cuentas y generaciones',()=>{
  it('reutiliza lecturas entre pantallas y nunca comparte datos entre cuentas',async()=>{
    client.rpc.mockImplementation(async(_name,args)=>({data:session(args.p_user_id),error:null}))
    const a=new HistoryReader('a'),b=new HistoryReader('b')
    expect((await a.session('s'))?.id).toBe('a');await a.session('s')
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect((await b.session('s'))?.id).toBe('b');expect(client.rpc).toHaveBeenCalledTimes(2)
    a.refreshIfStale();await a.session('s');expect(client.rpc).toHaveBeenCalledTimes(2)
  })
  it('descarta respuestas antiguas al cambiar outbox y utiliza detalle local sin RPC',async()=>{
    let resolve!:(value:unknown)=>void
    client.rpc.mockReturnValue(new Promise(r=>{resolve=r}))
    const reader=new HistoryReader('a'),reading=reader.session('s')
    enqueueSyncOperation('a','session:s',{action:'save',session:session('s',80)},'empty')
    resolve({data:session('s',40),error:null})
    await expect(reading).rejects.toBeInstanceOf(StaleHistoryRead)
    expect((await reader.session('s'))?.exerciseLogs[0].sets[0].weightKg).toBe(80)
    enqueueSyncOperation('a','session:s',{action:'delete'},'empty')
    expect(await reader.session('s')).toBeNull();expect(client.rpc).toHaveBeenCalledTimes(1)
  })
  it('excluye una creación ya recibida por el servidor antes de sumar la copia local',async()=>{
    enqueueSyncOperation('a','session:new',{action:'save',session:session('new')},'empty')
    client.rpc.mockImplementation(async(_name,args)=>{
      expect(args.p_excluded_session_ids).toEqual(['new'])
      return {data:{items:[],totalCount:0,filteredCount:0,hasMore:false,nextCursor:null},error:null}
    })
    const pager=new HistoryReader('a').pager(filters)
    await pager.more();expect(pager.items.map(s=>s.id)).toEqual(['new']);expect(pager.totalCount).toBe(1)
  })
  it('offline reutiliza solo la base compatible; una generación invalidada no muestra datos antiguos',async()=>{
    client.rpc.mockResolvedValue({data:session('s'),error:null})
    const first=new HistoryReader('a');await first.session('s')
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
    const offline=new HistoryReader('a');expect((await offline.session('s'))?.id).toBe('s')
    offline.invalidate()
    await expect(offline.session('s')).rejects.toThrow('Sin conexión')
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })
  it('rechaza contratos inesperados, invalida respuestas y reinicia el cursor con filtros nuevos',async()=>{
    client.rpc.mockResolvedValueOnce({data:{items:[]},error:null})
    const reader=new HistoryReader('a')
    await expect(reader.pager(filters).more()).rejects.toBeInstanceOf(ReadContractError)
    client.rpc.mockResolvedValue({data:{items:[],totalCount:0,filteredCount:0,hasMore:false,nextCursor:null},error:null})
    await reader.pager({...filters,searchIds:['press']}).more()
    expect(client.rpc.mock.lastCall?.[1].p_cursor).toBeNull()
    reader.invalidate();await reader.pager(filters).more()
    expect(client.rpc.mock.lastCall?.[1].p_cursor).toBeNull()
  })
  it('la confirmación retira E/L y converge al servidor sin duplicar la creación',async()=>{
    enqueueSyncOperation('a','session:new',{action:'save',session:session('new')},'empty')
    client.rpc.mockImplementation(async(_name,args)=>{
      const excluded=args.p_excluded_session_ids.includes('new')
      return {data:{items:excluded?[]:[session('new')],totalCount:excluded?0:1,filteredCount:excluded?0:1,hasMore:false,nextCursor:null},error:null}
    })
    const reader=new HistoryReader('a'),before=reader.pager(filters)
    await before.more();expect(before.items.map(s=>s.id)).toEqual(['new'])
    const key=Object.keys(localStorage).find(k=>k.startsWith('lifttrack.outbox.v1.'))!
    const operation=JSON.parse(localStorage.getItem(key)!)
    localStorage.setItem(key,JSON.stringify({...operation,status:'done',payload:{},revision:'confirmed'}))
    reader.invalidate()
    const after=reader.pager(filters);await after.more()
    expect(after.items.map(s=>s.id)).toEqual(['new']);expect(after.totalCount).toBe(1)
    expect(client.rpc.mock.lastCall?.[1].p_excluded_session_ids).toEqual([])
  })
})

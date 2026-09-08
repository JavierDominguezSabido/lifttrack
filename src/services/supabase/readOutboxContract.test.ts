import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { WorkoutSession } from '../../types'
import { filterSessions, getProgressEntryWeight } from '../../pages/HistoryPage'
import { getLastExercisePerformanceFromSessions } from '../../utils/workoutHistory'
import { getSessionVolume } from '../../utils/workout'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const now = '2026-09-07T12:00:00Z'
let db: PGlite
type Entry = { sessionId: string; logId: string; date: string; startedAt: string; weightKg: number; reps: number[]; volumeKg: number }
type Progress = { sessionCount: number; bestWeight: number; accumulatedVolume: number; latest: Entry | null; entries: Entry[]; hasMore: boolean }
type Probe = { weekStart: string; active: boolean; completedRunStart: string | null }
type Overview = { sessionCount: number; activeWeeks: number; streakWeeks: number; totalVolume: number; latestSession: WorkoutSession | null; exerciseLogCounts: Record<string, number>; currentWeekCompletedDays: number[]; weekProbes: Probe[] }
type Page = { items: WorkoutSession[]; totalCount: number; filteredCount: number; hasMore: boolean; nextCursor: unknown }
type Performance = { sessionId: string; performedAt: string; startedAt: string; weightKg: number; reps: number[] } | null
async function rpc<T>(name: string, args: unknown[]) {
  return (await db.query<{ result: T }>(`select public.${name}(${args.map((_, i) => '$' + (i+1)).join(',')}) result`, args)).rows[0].result
}
const progress = (excluded: string[] = [], ids = ['press']) => rpc<Progress>('lifttrack_read_exercise_progress_v2', [owner,ids,8,excluded])
const overview = (excluded: string[] = [], weeks: string[] = []) => rpc<Overview>('lifttrack_read_history_overview_v2', [owner,'UTC',now,excluded,weeks])
const last = (excluded: string[] = []) => rpc<Performance>('lifttrack_read_last_performance_v2', [owner,['press'],excluded])
const page = (excluded: string[] = [], cursor: unknown = null, size = 3, exercise: string[] | null = null, search: string[] | null = null) => rpc<Page>('lifttrack_read_sessions_page_v3', [owner,'UTC','{}',size,cursor === null ? null : JSON.stringify(cursor),exercise,search,null,null,null,false,excluded])
function normalize(value: unknown): unknown {
  if (value === null) return undefined
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as object).map(([k,v])=>[k,normalize(v)]))
  return value
}
// Descarga completa SOLO como oráculo de pruebas en PostgreSQL aislado.
async function all() {
  const p = await rpc<Page>('lifttrack_read_sessions_page_v2',[owner,'UTC','{}',100,null,null,null,null,null,null,true])
  return normalize(p.items) as WorkoutSession[]
}
function real(s: WorkoutSession) { return !s.id.startsWith('initial-') }
function order(a: WorkoutSession,b: WorkoutSession) {
  return Date.parse(b.completedAt ?? b.startedAt)-Date.parse(a.completedAt ?? a.startedAt) || Date.parse(b.startedAt)-Date.parse(a.startedAt) || -Buffer.compare(Buffer.from(a.id),Buffer.from(b.id))
}
function week(date: string) {
  const d=new Date(date); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7)
  return d.toISOString().slice(0,10)
}
function previous(w: string) { const d=new Date(w); d.setUTCDate(d.getUTCDate()-7); return d.toISOString().slice(0,10) }
function effective(sessions: WorkoutSession[], excluded: string[], local: WorkoutSession[]) {
  return [...sessions.filter(s=>!excluded.includes(s.id)),...local].sort(order)
}
function localProgress(sessions: WorkoutSession[]) {
  const entries=sessions.filter(real).flatMap(session=>{
    const log=session.exerciseLogs.find(l=>l.exerciseId==='press')
    return log ? [{session,log}] : []
  })
  return { sessionCount:entries.length, bestWeight:Math.max(0,...entries.map(getProgressEntryWeight)), accumulatedVolume:entries.reduce((sum,e)=>sum+getSessionVolume({...e.session,exerciseLogs:[e.log]}),0) }
}
function mergeOverview(remote: Overview, local: WorkoutSession[]) {
  const locals=local.filter(real), probes=new Map(remote.weekProbes.map(p=>[p.weekStart,p]))
  const active=new Set(locals.map(s=>week(s.completedAt ?? s.startedAt)))
  const completed=new Set(locals.filter(s=>s.completedAt).map(s=>week(s.completedAt!)))
  let cursor=week(now), streak=0
  while(true) {
    if(completed.has(cursor)) { streak++; cursor=previous(cursor); continue }
    const start=probes.get(cursor)?.completedRunStart
    if(!start) break
    streak+=(Date.parse(cursor)-Date.parse(start))/(7*86400000)+1
    cursor=previous(start)
    if(!completed.has(cursor)) break
  }
  return {sessionCount:remote.sessionCount+locals.length, totalVolume:remote.totalVolume+locals.reduce((sum,s)=>sum+(s.volumeKg ?? getSessionVolume(s)),0), activeWeeks:remote.activeWeeks+[...active].filter(w=>!probes.get(w)!.active).length, streakWeeks:streak}
}
function fullOverview(sessions: WorkoutSession[]) {
  const r=sessions.filter(real), active=new Set(r.map(s=>week(s.completedAt ?? s.startedAt))), completed=new Set(r.filter(s=>s.completedAt).map(s=>week(s.completedAt!)))
  let streak=0,cursor=week(now)
  while(completed.has(cursor)) { streak++;cursor=previous(cursor) }
  return { sessionCount:r.length,totalVolume:r.reduce((sum,s)=>sum+(s.volumeKg ?? getSessionVolume(s)),0),activeWeeks:active.size,streakWeeks:streak }
}
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`set timezone='UTC'; create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;`)
  await db.exec(readFileSync('docs/supabase-schema.sql','utf8').replace('create extension if not exists pgcrypto;',''))
  await db.exec(readFileSync('docs/migrations/atomic-workout-sessions.sql','utf8'))
  await db.exec(readFileSync('docs/migrations/persistent-sync.sql','utf8'))
  await db.exec(readFileSync('docs/migrations/workout-history-read-api.sql','utf8'))
  await db.exec(readFileSync('docs/migrations/workout-history-pagination-v2.sql','utf8'))
  await db.query('insert into auth.users(id) values($1),($2)',[owner,other])
  const before=(await db.query("select oid,prosrc,proacl,prosecdef from pg_proc where pronamespace='public'::regnamespace order by oid")).rows
  await db.exec(readFileSync('docs/migrations/workout-history-outbox-reads.sql','utf8'))
  const after=(await db.query("select oid,prosrc,proacl,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname not in ('lifttrack_read_history_overview_v2','lifttrack_read_sessions_page_v3','lifttrack_read_exercise_progress_v2','lifttrack_read_last_performance_v2') order by oid")).rows
  expect(after).toEqual(before)
},30000)
beforeEach(async()=>{
  await db.exec('reset role; truncate public.workout_sessions,public.workout_templates,public.exercises cascade')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  await db.exec('set role authenticated')
  await db.query(`insert into public.exercises(user_id,stable_key,name,muscle_group) values($1,'press','Press','Pecho'),($1,'row','Remo','Espalda')`,[owner])
  await db.query(`insert into public.workout_sessions(user_id,client_id,name,day_of_week,started_at,completed_at)
    select $1,'s-'||n,'Sesión',1,'2026-06-15'::timestamptz+n*interval '7 days','2026-06-15'::timestamptz+n*interval '7 days' from generate_series(1,12) n`,[owner])
  await db.query(`insert into public.exercise_logs(user_id,client_id,session_id,exercise_id,position)
    select $1,'log-'||s.client_id,s.id,e.id,1 from public.workout_sessions s cross join public.exercises e where e.stable_key='press'`,[owner])
  await db.query(`insert into public.set_logs(user_id,client_id,exercise_log_id,set_number,reps,weight_kg,completed)
    select $1,'set-'||l.client_id,l.id,1,1,case l.client_id when 'log-s-12' then 100 when 'log-s-1' then 95 else 60 end,true from public.exercise_logs l`,[owner])
})
afterAll(async()=>{await db?.close()})

it('sin exclusiones conserva las RPC instaladas; ninguna lectura modifica datos',async()=>{
  const snapshot=(await db.query('select jsonb_agg(to_jsonb(s) order by id) data from public.workout_sessions s')).rows
  const o=await overview()
  expect(Object.fromEntries(Object.entries(o).filter(([key])=>key!=='weekProbes'))).toEqual(await rpc('lifttrack_read_history_overview_v1',[owner,'UTC',now]))
  expect(await page([],null,3)).toEqual(await rpc('lifttrack_read_sessions_page_v2',[owner,'UTC','{}',3]))
  const p=await progress(), old=await rpc<Progress>('lifttrack_read_exercise_progress_v1',[owner,['press'],8])
  expect({...p,latest:p.latest && { ...p.latest,startedAt:undefined },entries:p.entries.map(e=>({...e,startedAt:undefined}))}).toEqual({...old,latest:old.latest && {...old.latest,startedAt:undefined},entries:old.entries.map(e=>({...e,startedAt:undefined}))})
  const l=await last(); expect({...l,startedAt:undefined}).toEqual({...await rpc<NonNullable<Performance>>('lifttrack_read_last_performance_v1',[owner,['press']]),startedAt:undefined})
  expect((await db.query('select jsonb_agg(to_jsonb(s) order by id) data from public.workout_sessions s')).rows).toEqual(snapshot)
})

it('borrar/modificar récord descubre 95 kg fuera de recientes; crear y cambiar logs/series también equivalen',async()=>{
  const source=await all(), record=source.find(s=>s.id==='s-12')!
  const changed={...record,exerciseLogs:record.exerciseLogs.map(l=>({...l,sets:l.sets.map(s=>({...s,weightKg:40,reps:3}))}))}
  const moved={...record,exerciseLogs:record.exerciseLogs.map(l=>({...l,exerciseId:'row'}))}
  const created={...record,id:'new',volumeKg:0,exerciseLogs:record.exerciseLogs.map(l=>({...l,sets:l.sets.map(s=>({...s,weightKg:110,isWarmup:true}))}))}
  const unfinished={...changed,completedAt:undefined,exerciseLogs:changed.exerciseLogs.map(l=>({...l,sets:l.sets.map(s=>({...s,completed:false}))}))}
  for(const [excluded,local] of [[['s-12'],[]],[['s-12'],[changed]],[['s-12'],[moved]],[['new'],[created]],[['s-12','new'],[changed,created]],[['s-12'],[unfinished]]] as [string[],WorkoutSession[]][]) {
    const r=await progress(excluded), addition=localProgress(local), expected=localProgress(effective(source,excluded,local))
    expect({sessionCount:r.sessionCount+addition.sessionCount,bestWeight:Math.max(r.bestWeight,addition.bestWeight),accumulatedVolume:r.accumulatedVolume+addition.accumulatedVolume}).toEqual(expected)
    if(excluded.includes('s-12')) {expect(r.bestWeight).toBe(95); expect(r.entries.map(e=>e.sessionId)).not.toContain('s-1')}
    const merged=effective(source,excluded,local)
    expect(mergeOverview(await overview(excluded, [...new Set(local.filter(real).map(s=>week(s.completedAt ?? s.startedAt)))]),local)).toEqual(fullOverview(merged))
    const candidate=await last(excluded), localCandidate=getLastExercisePerformanceFromSessions(local,'press')
    const selected=[candidate,localCandidate && {...localCandidate,startedAt:local.find(s=>s.id===localCandidate.sessionId)!.startedAt}].filter((x): x is NonNullable<Performance>=>Boolean(x)).sort((a,b)=>Number(a.sessionId.startsWith('initial-'))-Number(b.sessionId.startsWith('initial-'))||Date.parse(b.performedAt)-Date.parse(a.performedAt)||Date.parse(b.startedAt)-Date.parse(a.startedAt))[0]
    const expectedLast=getLastExercisePerformanceFromSessions(merged,'press')
    expect(selected?.sessionId).toBe(expectedLast?.sessionId); expect(selected?.weightKg).toBe(expectedLast?.weightKg)
  }
})

it('semanas: huecos reparados, semanas parciales y múltiples saves sin doble conteo',async()=>{
  const source=await all(), excluded=['s-12','s-10','s-5']
  const local=[source.find(s=>s.id==='s-12')!,source.find(s=>s.id==='s-10')!,{...source.find(s=>s.id==='s-5')!,completedAt:undefined}, {...source[0],id:'second-current'}, {...source[0],id:'past-partial',startedAt:'2020-01-07Z',completedAt:undefined}]
  const weeks=[...new Set(local.map(s=>week(s.completedAt ?? s.startedAt)))]
  const r=await overview(excluded,weeks)
  expect(r.weekProbes.length).toBeLessThanOrEqual(2*weeks.length+1)
  expect(mergeOverview(r,local)).toEqual(fullOverview(effective(source,excluded,local)))
  expect(mergeOverview(r,local).streakWeeks).toBe(7)
})

it('paginación: exclusión antes de filtros/conteos; mezcla sin perder filas y búsqueda independiente',async()=>{
  const source=await all(), local=[{...source[0],id:'new',startedAt:'2026-09-08Z',completedAt:'2026-09-08Z'}, {...source.find(s=>s.id==='s-1')!,startedAt:'2026-09-09Z',completedAt:'2026-09-09Z'}]
  const excluded=['new','s-1','s-12'], expected=effective(source,excluded,local)
  const output: WorkoutSession[]=[], pending=[...local].sort(order); let cursor:unknown=null, more=true, buffer:WorkoutSession[]=[]
  while(more||buffer.length||pending.length) {
    if(!buffer.length&&more) { const p=await page(excluded,cursor,3);expect(p.totalCount+local.length).toBe(expected.length);expect(p.filteredCount).toBe(10); buffer=p.items;cursor=p.nextCursor;more=p.hasMore }
    if(pending.length && (!buffer.length||order(pending[0],buffer[0])<0)) output.push(pending.shift()!)
    else if(buffer.length) output.push(buffer.shift()!)
  }
  expect(output.map(s=>s.id)).toEqual(expected.map(s=>s.id));expect(new Set(output.map(s=>s.id)).size).toBe(expected.length)
  await db.query(`insert into public.exercise_logs(user_id,client_id,session_id,exercise_id,position)
    select $1,'row-log',s.id,e.id,2 from public.workout_sessions s cross join public.exercises e where s.client_id='s-7' and e.stable_key='row'`,[owner])
  const filtered=await page([],null,3,['press'],['row'])
  const oracle=filterSessions({sessions:(await all()).filter(real),exercises:[{id:'press',name:'Press',muscleGroup:'Pecho',active:true},{id:'row',name:'Remo',muscleGroup:'Espalda',active:true}],templates:[],canonicalExerciseIds:new Map(),filterExerciseId:'press',filterDay:'all',rangeFilter:'all',search:'remo'})
  expect(filtered.items.map(s=>s.id)).toEqual(oracle.map(s=>s.id));expect(filtered.filteredCount).toBe(1)
  expect((await page(['s-7'],null,3,['press'],['row'])).filteredCount).toBe(0)
})

it('convergencia tras confirmar delete/save: los agregados coinciden sin exclusiones',async()=>{
  const source=await all(), excluded=['s-12'], changed={...source.find(s=>s.id==='s-12')!,exerciseLogs:source.find(s=>s.id==='s-12')!.exerciseLogs.map(l=>({...l,sets:l.sets.map(s=>({...s,weightKg:40}))}))}
  const r=await progress(excluded), local=localProgress([changed])
  await db.query("update public.set_logs set weight_kg=40 where client_id='set-log-s-12'")
  expect(await progress()).toMatchObject({sessionCount:r.sessionCount+local.sessionCount,bestWeight:Math.max(r.bestWeight,local.bestWeight),accumulatedVolume:r.accumulatedVolume+local.accumulatedVolume})
  const beforeDelete=await progress(excluded)
  await db.query("delete from public.workout_sessions where client_id='s-12'")
  expect(await progress()).toEqual(beforeDelete)
  // Altas ya confirmadas pero cuyo ACK aún no llegó: excluir siempre su ID.
  const confirmed=await all(), one=confirmed[0], base=await overview([one.id],[week(one.completedAt!)])
  expect(mergeOverview(base,[one])).toEqual(fullOverview(confirmed))
})

it('validación, aislamiento, permisos y exclusión total',async()=>{
  await expect(progress(null as unknown as string[])).rejects.toThrow('Exclusiones no válidas')
  await expect(progress([null as unknown as string])).rejects.toThrow('Exclusiones no válidas')
  await expect(overview([],['2026-09-08'])).rejects.toThrow('Semanas locales no válidas')
  const ids=(await all()).map(s=>s.id)
  expect(await progress(ids)).toMatchObject({sessionCount:0,bestWeight:0,entries:[],latest:null})
  expect(await last(ids)).toBeNull();expect(await page(ids)).toMatchObject({totalCount:0,filteredCount:0,items:[],hasMore:false})
  expect(await overview(ids)).toMatchObject({sessionCount:0,activeWeeks:0,streakWeeks:0,totalVolume:0})
  expect(await progress(['foreign','foreign'])).toEqual(await progress())
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other])
  await expect(progress()).rejects.toThrow('Cuenta incorrecta')
  expect(await rpc('lifttrack_read_exercise_progress_v2',[other,['press'],8,[]])).toMatchObject({sessionCount:0})
  const permissions=(await db.query<{ invoker:boolean; anon:boolean; allowed:boolean }>(`select not prosecdef invoker,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') allowed from pg_proc where proname in ('lifttrack_read_history_overview_v2','lifttrack_read_sessions_page_v3','lifttrack_read_exercise_progress_v2','lifttrack_read_last_performance_v2')`)).rows
  expect(permissions).toHaveLength(4); for(const p of permissions) expect(p).toEqual({invoker:true,anon:false,allowed:true})
})

it('último rendimiento: candidato antiguo fuera de recientes, semillas y calentamientos',async()=>{
  await db.query(`insert into public.workout_sessions(user_id,client_id,name,day_of_week,started_at,completed_at)
    values($1,'initial-seed','Semilla',1,'2040-01-01Z','2040-01-01Z')`,[owner])
  await db.query(`insert into public.exercise_logs(user_id,client_id,session_id,exercise_id,position)
    select $1,'seed-log',s.id,e.id,1 from public.workout_sessions s cross join public.exercises e where s.client_id='initial-seed' and e.stable_key='press'`,[owner])
  await db.query(`insert into public.set_logs(user_id,client_id,exercise_log_id,set_number,reps,weight_kg,completed)
    select $1,'seed-set',id,1,5,500,true from public.exercise_logs where client_id='seed-log'`,[owner])
  expect((await last())?.sessionId).toBe('s-12')
  const recent=(await progress()).entries.map(e=>e.sessionId)
  expect(recent).not.toContain('s-4')
  expect((await last(recent))?.sessionId).toBe('s-4')
  await db.query("update public.set_logs set is_warmup=true where client_id='set-log-s-4'")
  expect((await last(recent))?.sessionId).toBe('s-3')
  const ids=(await all()).filter(real).map(s=>s.id)
  expect((await last(ids))?.sessionId).toBe('initial-seed')
  expect(await last([...ids,'initial-seed'])).toBeNull()
  expect((await progress(ids)).sessionCount).toBe(0)
})

it('probes de semanas usan la zona IANA, incluido el cambio de hora',async()=>{
  await db.query(`insert into public.workout_sessions(user_id,client_id,name,day_of_week,started_at,completed_at)
    values($1,'dst','DST',1,'2026-03-29T22:30:00Z','2026-03-29T22:30:00Z')`,[owner])
  const args=[owner,'Europe/Madrid','2026-03-30T12:00:00Z',[],['2026-03-30']]
  const local=await rpc<Overview>('lifttrack_read_history_overview_v2',args)
  expect(local.weekProbes.find(p=>p.weekStart==='2026-03-30')).toEqual({weekStart:'2026-03-30',active:true,completedRunStart:'2026-03-30'})
  const utc=await rpc<Overview>('lifttrack_read_history_overview_v2',[owner,'UTC',args[2],[],args[4]])
  expect(utc.weekProbes.find(p=>p.weekStart==='2026-03-30')?.active).toBe(false)
  const excluded=await rpc<Overview>('lifttrack_read_history_overview_v2',[owner,args[1],args[2],['dst'],args[4]])
  expect(excluded.weekProbes.find(p=>p.weekStart==='2026-03-30')).toEqual({weekStart:'2026-03-30',active:false,completedRunStart:null})
})

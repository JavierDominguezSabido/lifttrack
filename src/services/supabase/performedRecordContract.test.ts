import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

const owner='11111111-1111-4111-8111-111111111111'
let db:PGlite
type Result={bestWeight:number;sessionCount:number;entries:{sessionId:string;weightKg:number}[];[key:string]:unknown}
const read=async(excluded:string[]=[],ids=['press'],version=3)=>(await db.query<{r:Result}>(`select public.lifttrack_read_exercise_progress_v${version}($1,$2,8,$3) r`,[owner,ids,excluded])).rows[0].r
async function snapshot(){return (await db.query(`select 'sessions' kind,to_jsonb(s) data from workout_sessions s union all select 'logs',to_jsonb(l) from exercise_logs l union all select 'sets',to_jsonb(z) from set_logs z union all select 'exercises',to_jsonb(e) from exercises e order by kind,data`)).rows}
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;`)
  await db.exec(readFileSync('docs/supabase-schema.sql','utf8').replace('create extension if not exists pgcrypto;',''))
  for(const file of ['atomic-workout-sessions','persistent-sync','workout-history-read-api','workout-history-pagination-v2','workout-history-outbox-reads'])await db.exec(readFileSync(`docs/migrations/${file}.sql`,'utf8'))
  await db.query('insert into auth.users(id) values($1)',[owner])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  await db.query("insert into exercises(user_id,stable_key,name,muscle_group) values($1,'press','Press','Pecho')",[owner])
  const functions=(await db.query("select oid,prosrc,proacl,prosecdef from pg_proc where pronamespace='public'::regnamespace order by oid")).rows
  const data=await snapshot()
  await db.exec(readFileSync('docs/migrations/workout-exercise-performed-record-v3.sql','utf8'))
  expect(await snapshot()).toEqual(data)
  expect((await db.query("select oid,prosrc,proacl,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname<>'lifttrack_read_exercise_progress_v3' order by oid")).rows).toEqual(functions)
},30000)
beforeEach(async()=>{
  await db.exec('reset role; truncate workout_sessions cascade')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  await db.exec('set role authenticated')
})
afterAll(async()=>{await db?.close()})
async function add(id:string,weight:number,{base,override,completed=true,warmup=false,partial=false,exercise='press',date='2026-09-01',position=1}:{base?:number;override?:number;completed?:boolean;warmup?:boolean;partial?:boolean;exercise?:string;date?:string;position?:number}={}){
  await db.query(`insert into workout_sessions(user_id,client_id,name,day_of_week,started_at,completed_at) values($1,$2,'Test',1,$3,$4) on conflict do nothing`,[owner,id,date,partial?null:date])
  await db.query(`insert into exercise_logs(user_id,client_id,session_id,exercise_id,position,working_weight_kg) select $1,$2,s.id,e.id,$3,$4 from workout_sessions s cross join exercises e where s.client_id=$5 and e.stable_key=$6`,[owner,id+'-'+exercise,position,base??null,id,exercise])
  await db.query(`insert into set_logs(user_id,client_id,exercise_log_id,set_number,reps,weight_kg,weight_override_kg,completed,is_warmup) select $1,$2,id,1,8,$3,$4,$5,$6 from exercise_logs where client_id=$2`,[owner,id+'-'+exercise,weight,override??null,completed,warmup])
}
it('vacío, base alta sin serie válida y calentamiento no producen récord',async()=>{
  expect((await read()).bestWeight).toBe(0)
  await add('incomplete',200,{base:250,completed:false})
  await add('warmup',180,{warmup:true})
  await add('valid',60)
  const current=await read(),previous=await read([],['press'],2)
  expect(current.bestWeight).toBe(60)
  expect(previous.bestWeight).toBe(250)
  const rest={...current,bestWeight:undefined}
  const oldRest={...previous,bestWeight:undefined}
  expect(rest).toEqual(oldRest)
  expect(current.entries.find(e=>e.sessionId==='incomplete')?.weightKg).toBe(250)
})
it('override efectivo, incluido cero, y sesión parcial con serie válida',async()=>{
  await add('partial',50,{override:85,partial:true,base:200})
  await add('zero',300,{override:0})
  expect((await read()).bestWeight).toBe(85)
  expect((await read(['partial'])).bestWeight).toBe(0)
})
it('outbox: borrar/reducir récord descubre el siguiente fuera de recientes y converge',async()=>{
  await add('old',95,{date:'2020-01-01'})
  for(let i=1;i<=10;i++)await add('recent'+i,60,{date:`2026-08-${String(i).padStart(2,'0')}`})
  await add('record',100)
  expect((await read()).bestWeight).toBe(100)
  const remainder=await read(['record'])
  expect(remainder.bestWeight).toBe(95)
  expect(remainder.entries.map(e=>e.sessionId)).not.toContain('old')
  // Oráculo del nuevo contrato local, sin adaptar el frontend todavía.
  const local=[{completed:true,isWarmup:false,weightKg:100,weightOverrideKg:40}]
  const merged=Math.max(remainder.bestWeight,...local.filter(s=>s.completed&&!s.isWarmup).map(s=>s.weightOverrideKg??s.weightKg))
  expect(merged).toBe(95)
  await db.exec("update set_logs set weight_override_kg=40 where client_id='record-press'")
  expect((await read()).bestWeight).toBe(merged)
  await db.exec("delete from workout_sessions where client_id='record'")
  expect((await read()).bestWeight).toBe(remainder.bestWeight)
})
it('equivalentes explícitos: primer log por sesión, sin duplicación; excluye initial-',async()=>{
  await db.query("insert into exercises(user_id,stable_key,name,muscle_group) values($1,'alias','Alias','Pecho')",[owner])
  await add('first',70)
  await add('second',80,{exercise:'alias'})
  await add('first',150,{exercise:'alias',position:2})
  await add('initial-seed',500)
  const result=await read([],['press','alias'])
  expect(result.sessionCount).toBe(2)
  expect(result.bestWeight).toBe(80)
  expect(new Set(result.entries.map(e=>e.sessionId)).size).toBe(2)
})
it('invoker, permisos y aislamiento conservados; lecturas no modifican datos',async()=>{
  await add('record',70)
  const data=await snapshot()
  await read()
  expect(await snapshot()).toEqual(data)
  expect((await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where proname='lifttrack_read_exercise_progress_v3'")).rows[0].prosecdef).toBe(false)
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.lifttrack_read_exercise_progress_v3(uuid,text[],integer,text[])','EXECUTE') allowed")).rows[0].allowed).toBe(false)
  await db.query("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)")
  await expect(read()).rejects.toThrow('Cuenta incorrecta')
})


it('diagnóstico bloque 9: volumen almacenado y volumen por ejercicio pueden discrepar',async()=>{
  await add('legacy-volume',60)
  await db.exec("update workout_sessions set volume_kg=999 where client_id='legacy-volume'")
  const overview=(await db.query<{r:{totalVolume:number}}>("select lifttrack_read_history_overview_v2($1,'UTC') r",[owner])).rows[0].r
  const exercise=await read()
  expect(overview.totalVolume).toBe(999)
  expect(exercise.accumulatedVolume).toBe(480)
  // No hay datos de todas las sesiones en el resumen para corregirlo en cliente.
  expect(overview.totalVolume).not.toBe(exercise.accumulatedVolume)
})

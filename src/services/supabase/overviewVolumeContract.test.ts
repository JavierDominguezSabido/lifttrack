import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

const owner='11111111-1111-4111-8111-111111111111'
let db:PGlite
type Result={totalVolume:number;sessionCount:number;[key:string]:unknown}
const read=async(excluded:string[]=[],version=3)=>(await db.query<{r:Result}>(`select public.lifttrack_read_history_overview_v${version}($1,'Europe/Madrid','2026-09-07T12:00:00Z',$2,ARRAY['2026-09-07'::date]) r`,[owner,excluded])).rows[0].r
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
  await db.exec(readFileSync('docs/migrations/workout-history-series-volume-v3.sql','utf8'))
  expect(await snapshot()).toEqual(data)
  expect((await db.query("select oid,prosrc,proacl,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname<>'lifttrack_read_history_overview_v3' order by oid")).rows).toEqual(functions)
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

it('ignora volumen almacenado; resto del contrato idéntico a v2',async()=>{
  await add('stale',60)
  await db.exec("update workout_sessions set volume_kg=999 where client_id='stale'")
  const before=await snapshot(),current=await read(),old=await read([],2)
  expect(current.totalVolume).toBe(480)
  expect(old.totalVolume).toBe(999)
  expect({...current,totalVolume:undefined}).toEqual({...old,totalVolume:undefined})
  expect(await snapshot()).toEqual(before)
})
it('vacío, calentamientos, incompletas, overrides cero y sesión parcial',async()=>{
  expect((await read()).totalVolume).toBe(0)
  await add('warm',20,{warmup:true})
  await add('incomplete',500,{completed:false})
  await add('override',50,{override:75})
  await add('zero',100,{override:0})
  await add('partial',40,{partial:true})
  await add('initial-seed',900)
  expect((await read()).totalVolume).toBe(8*(20+75+40))
})
it('outbox: edición/borrado, exclusión antes de sumar y convergencia',async()=>{
  await add('edit',60)
  await add('delete',100)
  await add('retained',20,{warmup:true})
  const remote=await read(['edit','delete'])
  expect(remote.totalVolume).toBe(160)
  const local=[{reps:5,weightKg:60,weightOverrideKg:40,completed:true},{reps:2,weightKg:20,completed:true},{reps:9,weightKg:999,completed:false}]
  const effective=remote.totalVolume+local.reduce((sum,s)=>sum+(s.completed?s.reps*(s.weightOverrideKg??s.weightKg):0),0)
  expect(effective).toBe(400)
  await db.exec("update set_logs set reps=5,weight_override_kg=40 where client_id='edit-press'; delete from workout_sessions where client_id='delete'")
  await db.query(`insert into set_logs(user_id,client_id,exercise_log_id,set_number,reps,weight_kg,completed,is_warmup) select $1,'extra',id,2,2,20,true,true from exercise_logs where client_id='edit-press'`,[owner])
  expect((await read()).totalVolume).toBe(effective)
  expect({...await read(['edit','edit']),totalVolume:undefined}).toEqual({...await read(['edit']),totalVolume:undefined})
})
it('RLS e invoker; permisos limitados y cuenta ajena rechazada',async()=>{
  await add('own',10)
  await db.exec('reset role')
  const other='22222222-2222-4222-8222-222222222222'
  await db.query('insert into auth.users(id) values($1)',[other])
  await db.query("insert into workout_sessions(user_id,client_id,name,day_of_week,started_at) values($1,'foreign','Foreign',1,now())",[other])
  await db.exec('set role authenticated')
  expect((await read()).sessionCount).toBe(1)
  expect((await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where proname='lifttrack_read_history_overview_v3'")).rows[0].prosecdef).toBe(false)
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.lifttrack_read_history_overview_v3(uuid,text,timestamptz,text[],date[])','EXECUTE') allowed")).rows[0].allowed).toBe(false)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other])
  await expect(read()).rejects.toThrow('Cuenta incorrecta')
})

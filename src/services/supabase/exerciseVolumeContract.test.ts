import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

const owner='11111111-1111-4111-8111-111111111111'
let db:PGlite
type Result={accumulatedVolume:number;bestWeight:number;sessionCount:number;entries:{sessionId:string;weightKg:number;volumeKg:number}[];[key:string]:unknown}
const read=async(excluded:string[]=[],ids=['press'],version=4)=>(await db.query<{r:Result}>(`select public.lifttrack_read_exercise_progress_v${version}($1,$2,8,$3) r`,[owner,ids,excluded])).rows[0].r
async function snapshot(){return (await db.query(`select 'sessions' kind,to_jsonb(s) data from workout_sessions s union all select 'logs',to_jsonb(l) from exercise_logs l union all select 'sets',to_jsonb(z) from set_logs z union all select 'exercises',to_jsonb(e) from exercises e order by kind,data`)).rows}
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;`)
  await db.exec(readFileSync('docs/supabase-schema.sql','utf8').replace('create extension if not exists pgcrypto;',''))
  for(const file of ['atomic-workout-sessions','persistent-sync','workout-history-read-api','workout-history-pagination-v2','workout-history-outbox-reads','workout-exercise-performed-record-v3','workout-history-series-volume-v3'])await db.exec(readFileSync(`docs/migrations/${file}.sql`,'utf8'))
  await db.query('insert into auth.users(id) values($1)',[owner])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  await db.query("insert into exercises(user_id,stable_key,name,muscle_group) values($1,'press','Press','Pecho')",[owner])
  const functions=(await db.query("select oid,prosrc,proacl,prosecdef from pg_proc where pronamespace='public'::regnamespace order by oid")).rows
  const data=await snapshot()
  await db.exec(readFileSync('docs/migrations/workout-exercise-volume-v4.sql','utf8'))
  expect(await snapshot()).toEqual(data)
  expect((await db.query("select oid,prosrc,proacl,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname<>'lifttrack_read_exercise_progress_v4' order by oid")).rows).toEqual(functions)
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

const overview=async(excluded:string[]=[])=>(await db.query<{r:{totalVolume:number}}>("select lifttrack_read_history_overview_v3($1,'UTC',now(),$2) r",[owner,excluded])).rows[0].r.totalVolume
it('normal, override, cero, warmup, incompleta y parcial coinciden con overview v3',async()=>{
  expect((await read()).accumulatedVolume).toBe(0)
  for(const [id,weight,options,expected] of [
    ['normal',60,{},480],['override',50,{override:75},600],['zero',300,{override:0},0],
    ['warm',100,{warmup:true,override:120},960],['incomplete',500,{completed:false},0],
    ['partial',40,{partial:true},320]
  ] as [string,number,Parameters<typeof add>[2],number][]){
    await add(id,weight,options)
    expect((await read()).entries.find(e=>e.sessionId===id)?.volumeKg).toBe(expected)
    expect((await read()).accumulatedVolume).toBe(await overview())
  }
  expect((await read()).accumulatedVolume).toBe(2360)
  expect((await read()).bestWeight).toBe(75)
  const current=await read(),old=await read([],['press'],3)
  const withoutVolume=(r:Result)=>({...r,accumulatedVolume:undefined,entries:r.entries.map(e=>({...e,volumeKg:undefined}))})
  expect(withoutVolume(current)).toEqual(withoutVolume(old))
})
it('exclusiones outbox, edición/borrado y convergencia sin doble suma',async()=>{
  await add('edit',60);await add('delete',100);await add('keep',20,{warmup:true})
  const remainder=await read(['edit','delete'])
  expect(remainder.accumulatedVolume).toBe(160)
  expect(remainder.accumulatedVolume).toBe(await overview(['edit','delete']))
  const localVolume=8*40
  const effective=remainder.accumulatedVolume+localVolume
  await db.exec("update set_logs set weight_override_kg=40 where client_id='edit-press'; delete from workout_sessions where client_id='delete'")
  expect((await read()).accumulatedVolume).toBe(effective)
  expect(await overview()).toBe(effective)
  expect(await read(['edit','edit'])).toEqual(await read(['edit']))
})
it('agregado sobre todo el historial, no solo recientes; primer equivalente y semillas intactos',async()=>{
  await add('old',20,{override:80,date:'2020-01-01'})
  for(let i=1;i<=10;i++)await add('recent'+i,10,{date:`2026-08-${String(i).padStart(2,'0')}`})
  await add('initial-seed',500)
  const result=await read()
  expect(result.entries).toHaveLength(8)
  expect(result.entries.map(e=>e.sessionId)).not.toContain('old')
  expect(result.accumulatedVolume).toBe(1440)
  expect(result.accumulatedVolume).toBe(await overview())
  await db.query("insert into exercises(user_id,stable_key,name,muscle_group) values($1,'alias','Alias','Pecho')",[owner])
  await add('old',500,{exercise:'alias',position:2})
  expect(await read([],['press','alias'])).toEqual(result)
  // Overview suma todos los logs; progreso mantiene el primer equivalente.
  expect(await overview()).toBe(result.accumulatedVolume+4000)
})
it('no modifica datos; conserva invoker y rechazo de cuenta ajena y permisos anon',async()=>{
  await add('own',50)
  const data=await snapshot();await read();expect(await snapshot()).toEqual(data)
  expect((await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where proname='lifttrack_read_exercise_progress_v4'")).rows[0].prosecdef).toBe(false)
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.lifttrack_read_exercise_progress_v4(uuid,text[],integer,text[])','EXECUTE') allowed")).rows[0].allowed).toBe(false)
  await db.query("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)")
  await expect(read()).rejects.toThrow('Cuenta incorrecta')
})

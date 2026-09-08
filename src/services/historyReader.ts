import { supabase } from './supabase/supabaseClient'
import type { Json } from '../types/database'
import type { WorkoutSession } from '../types'
import { pendingOperations } from './syncOutbox'
import { HistoryPager, pendingHistory, reconcileOverview, reconcilePerformance, reconcileProgress, sessionWeek, type HistoryOverview, type HistoryPageResult, type ReadPerformance, type ReadProgress, type SessionFilters } from './historyReads'

type ReadName='lifttrack_read_session_v1'|'lifttrack_read_history_overview_v3'|'lifttrack_read_sessions_page_v3'|'lifttrack_read_exercise_progress_v4'|'lifttrack_read_last_performance_v2'
export class ReadContractError extends Error {}
export class StaleHistoryRead extends Error {}
function normalize(value:unknown):unknown {
  if(value===null)return undefined
  if(Array.isArray(value))return value.map(normalize)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]))
  return value
}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}
function validSession(value:unknown):boolean {
  return object(value)&&typeof value.id==='string'&&typeof value.startedAt==='string'&&Number.isFinite(Date.parse(value.startedAt))&&Array.isArray(value.exerciseLogs)&&value.exerciseLogs.every(l=>object(l)&&typeof l.exerciseId==='string'&&Array.isArray(l.sets))
}
export function validateRead(name:ReadName,value:unknown) {
  const numeric=(o:Record<string,unknown>,keys:string[])=>keys.every(k=>typeof o[k]==='number'&&Number.isFinite(o[k]))
  const valid=name==='lifttrack_read_session_v1' ? value===null||validSession(value)
    :name==='lifttrack_read_last_performance_v2' ? value===null || object(value)&&typeof value.sessionId==='string'&&typeof value.startedAt==='string'&&typeof value.performedAt==='string'&&numeric(value,['weightKg'])&&Array.isArray(value.reps)
    :name==='lifttrack_read_history_overview_v3' ? object(value)&&numeric(value,['sessionCount','totalVolume','activeWeeks','streakWeeks'])&&object(value.exerciseLogCounts)&&Array.isArray(value.weekProbes)&&Array.isArray(value.currentWeekCompletedDays)&&(value.latestSession===null||validSession(value.latestSession))
    :name==='lifttrack_read_sessions_page_v3' ? object(value)&&numeric(value,['totalCount','filteredCount'])&&Array.isArray(value.items)&&value.items.every(validSession)&&typeof value.hasMore==='boolean'&&(!value.hasMore||object(value.nextCursor))
    :object(value)&&numeric(value,['sessionCount','bestWeight','accumulatedVolume'])&&Array.isArray(value.entries)&&value.entries.every(e=>object(e)&&typeof e.sessionId==='string'&&typeof e.startedAt==='string'&&typeof e.date==='string'&&numeric(e,['weightKg','volumeKg'])&&Array.isArray(e.reps))
  if(!valid)throw new ReadContractError(`${name}: respuesta incompatible con docs/read-outbox-contract.md`)
}
/** One instance per account provider. Requests and cached results never cross accounts. */
export class HistoryReader {
  generation=0
  private listeners=new Set<()=>void>()
  private cache=new Map<string,unknown>()
  private requests=new Map<string,Promise<unknown>>()
  private disposed=false
  private lastInvalidated=Date.now()
  constructor(readonly owner:string) {}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  version=()=>this.generation
  invalidate=()=>{
    this.generation++;this.lastInvalidated=Date.now();this.cache.clear();this.requests.clear()
    try{localStorage.removeItem(this.storageKey)}catch{/* Reads still work without cache. */}
    for(const fn of this.listeners)fn()
  }
  refreshIfStale=()=>{if(Date.now()-this.lastInvalidated>60000)this.invalidate()}
  dispose=()=>{this.disposed=true;this.generation++;this.listeners.clear();this.requests.clear()}
  private get storageKey(){return `lifttrack:history-reads:v1:${this.owner}`}
  snapshot() {return pendingHistory(pendingOperations(this.owner))}
  private async raw<T>(name:ReadName,args:Record<string,Json>,pendingKey:string):Promise<T> {
    const generation=this.generation
    const current=()=>!this.disposed&&generation===this.generation&&pendingKey===this.snapshot().key
    const key=JSON.stringify([name,args,pendingKey])
    if(!current())throw new StaleHistoryRead()
    if(this.cache.has(key))return this.cache.get(key) as T
    const existing=this.requests.get(key);if(existing)return existing as Promise<T>
    const promise=(async()=>{
      if(typeof navigator!=='undefined'&&!navigator.onLine) {
        try {const saved=JSON.parse(localStorage.getItem(this.storageKey)??'{}') as Record<string,unknown>;if(key in saved){validateRead(name,saved[key]);return saved[key] as T}}catch(e){if(e instanceof ReadContractError)throw e}
        throw new Error('Sin conexión: esta lectura necesita una base actualizada. Los cambios locales se conservan.')
      }
      if(!supabase)throw new Error('Supabase no está configurado.')
      const {data,error}=await supabase.rpc(name,args)
      if(!current())throw new StaleHistoryRead()
      if(error)throw new ReadContractError(`${name}: ${error.message} (${error.code})`)
      validateRead(name,data)
      this.cache.set(key,data)
      try {localStorage.setItem(this.storageKey,JSON.stringify(Object.fromEntries([...this.cache].slice(-60))))}catch{/* Local workout persistence is independent. */}
      return data as T
    })()
    this.requests.set(key,promise)
    try{return await promise}finally{if(this.requests.get(key)===promise)this.requests.delete(key)}
  }
  async overview() {
    const p=this.snapshot(),now=new Date()
    const raw=await this.raw<HistoryOverview>('lifttrack_read_history_overview_v3',{p_user_id:this.owner,p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,p_excluded_session_ids:p.excluded,p_local_week_starts:[...new Set(p.local.filter(s=>!s.id.startsWith('initial-')).map(sessionWeek))],p_now:new Date(now.getFullYear(),now.getMonth(),now.getDate(),12).toISOString()},p.key)
    return reconcileOverview({...raw,latestSession:normalize(raw.latestSession) as WorkoutSession|undefined},p.local,now)
  }
  pager(filters:SessionFilters,size=10,signal?:AbortSignal) {
    const p=this.snapshot(),generation=this.generation
    return new HistoryPager(async cursor=>{
      if(signal?.aborted||generation!==this.generation||p.key!==this.snapshot().key)throw new StaleHistoryRead()
      const raw=await this.raw<HistoryPageResult>('lifttrack_read_sessions_page_v3',{p_user_id:this.owner,p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,p_template_days:filters.templateDays,p_limit:size,p_cursor:cursor as Json,p_exercise_ids:filters.exerciseIds,p_search_exercise_ids:filters.searchIds,p_day_of_week:filters.day,p_from:filters.from,p_to:filters.to,p_include_initial:filters.includeInitial??false,p_excluded_session_ids:p.excluded},p.key)
      return {...raw,items:normalize(raw.items) as WorkoutSession[]}
    },p.local,filters)
  }
  async session(id:string) {
    const p=this.snapshot()
    if(p.excluded.includes(id))return p.local.find(s=>s.id===id)??null
    const raw=await this.raw<WorkoutSession|null>('lifttrack_read_session_v1',{p_user_id:this.owner,p_session_id:id},p.key)
    return raw===null?null:normalize(raw) as WorkoutSession
  }
  async progress(ids:string[],limit=8) {
    const p=this.snapshot()
    const r=await this.raw<ReadProgress>('lifttrack_read_exercise_progress_v4',{p_user_id:this.owner,p_exercise_ids:ids,p_limit:limit,p_excluded_session_ids:p.excluded},p.key)
    return reconcileProgress(r,p.local,ids,limit)
  }
  async performance(id:string,ids:string[]) {
    const p=this.snapshot()
    const r=await this.raw<ReadPerformance|null>('lifttrack_read_last_performance_v2',{p_user_id:this.owner,p_exercise_ids:ids,p_excluded_session_ids:p.excluded},p.key)
    return reconcilePerformance(r&&{...r,exerciseId:id},p.local,id,ids)
  }
}

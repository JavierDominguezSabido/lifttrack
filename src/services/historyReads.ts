import type { Exercise, LastExercisePerformance, WorkoutSession, WorkoutTemplate } from '../types'
import type { SyncOperation } from './syncOutbox'
import { getSessionDate, getWeekStart, toLocalDateKey } from '../utils/date'
import { getSessionVolume, getPerformedWeight } from '../utils/workout'
import { getLastExercisePerformanceFromSessions } from '../utils/workoutHistory'
import { getSessionRoutineIdentity } from '../utils/historySession'

export interface PendingHistory { excluded: string[]; local: WorkoutSession[]; key: string }
export function pendingHistory(operations: SyncOperation[]): PendingHistory {
  const latest = new Map<string, SyncOperation>()
  for (const op of [...operations].sort((a,b)=>a.sequence-b.sequence || a.id.localeCompare(b.id))) {
    if (op.status !== 'done' && op.resource.startsWith('session:')) latest.set(op.resource.slice(8), op)
  }
  return { excluded: [...latest.keys()].sort(), local: [...latest.values()].flatMap(op=>op.payload.action === 'save' && op.payload.session ? [{...op.payload.session,syncRevision:`operation:${op.id}`}] : []), key: JSON.stringify([...latest.values()]) }
}
const bytes = new TextEncoder()
export function compareIds(a: string, b: string) {
  const x=bytes.encode(a), y=bytes.encode(b)
  for(let i=0;i<Math.min(x.length,y.length);i++) if(x[i]!==y[i]) return x[i]-y[i]
  return x.length-y.length
}
export function compareSessions(a: Pick<WorkoutSession,'id'|'startedAt'|'completedAt'>, b: Pick<WorkoutSession,'id'|'startedAt'|'completedAt'>) {
  return Date.parse(b.completedAt ?? b.startedAt)-Date.parse(a.completedAt ?? a.startedAt) || Date.parse(b.startedAt)-Date.parse(a.startedAt) || compareIds(b.id,a.id)
}
export const realSession = (s: Pick<WorkoutSession,'id'>) => !s.id.startsWith('initial-')
export const sessionWeek = (s: WorkoutSession) => toLocalDateKey(getWeekStart(new Date(getSessionDate(s))))
export interface HistoryOverview {
  sessionCount: number; totalVolume: number; activeWeeks: number; streakWeeks: number
  latestSession?: WorkoutSession; exerciseLogCounts: Record<string,number>; currentWeekCompletedDays: number[]
  weekProbes: {weekStart: string; active: boolean; completedRunStart: string | null}[]
}
export function reconcileOverview(remote: HistoryOverview, local: WorkoutSession[], now=new Date()): HistoryOverview {
  const sessions=local.filter(realSession), weeks=new Set(sessions.map(sessionWeek))
  const completed=new Set(sessions.filter(s=>s.completedAt).map(sessionWeek))
  const probes=new Map(remote.weekProbes.map(p=>[p.weekStart,p]))
  const earlier=(key:string)=>{const [y,m,d]=key.split('-').map(Number);return toLocalDateKey(new Date(y,m-1,d-7))}
  let cursor=toLocalDateKey(getWeekStart(now)), streak=0
  while(true) {
    if(completed.has(cursor)) {streak++;cursor=earlier(cursor);continue}
    const start=probes.get(cursor)?.completedRunStart
    if(!start) break
    // Calendar dates, independent of daylight saving transitions.
    streak+=(Date.parse(cursor+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/604800000+1
    cursor=earlier(start)
    if(!completed.has(cursor)) break
  }
  const counts={...remote.exerciseLogCounts}, days=new Set(remote.currentWeekCompletedDays)
  for(const s of sessions) {
    for(const l of s.exerciseLogs) counts[l.exerciseId]=(counts[l.exerciseId]??0)+1
    if(s.completedAt && sessionWeek(s)===toLocalDateKey(getWeekStart(now))) days.add(s.dayOfWeek)
  }
  for(const w of weeks) if(!probes.has(w)) throw new Error(`Overview incompatible: falta weekProbe ${w}`)
  return {...remote,sessionCount:remote.sessionCount+sessions.length,totalVolume:remote.totalVolume+sessions.reduce((n,s)=>n+getSessionVolume(s),0),activeWeeks:remote.activeWeeks+[...weeks].filter(w=>!probes.get(w)!.active).length,streakWeeks:streak,exerciseLogCounts:counts,currentWeekCompletedDays:[...days].sort(),latestSession:[...(remote.latestSession?[remote.latestSession]:[]),...sessions].sort(compareSessions)[0]}
}
export interface SessionFilters { exerciseIds: string[] | null; searchIds: string[] | null; day: number | null; from: string | null; to: string | null; templateDays: Record<string,number>; includeInitial?: boolean }
export function matchesSession(s: WorkoutSession, f: SessionFilters) {
  const time=Date.parse(getSessionDate(s))
  const templates=Object.entries(f.templateDays).map(([id,dayOfWeek])=>({id,dayOfWeek})) as WorkoutTemplate[]
  return (f.includeInitial || realSession(s)) && (!f.from || time>=Date.parse(f.from)) && (!f.to || time<Date.parse(f.to)) && (f.day===null || getSessionRoutineIdentity(s,templates,new Date(time).getDay()).dayOfWeek===f.day) && (f.exerciseIds===null || s.exerciseLogs.some(l=>f.exerciseIds!.includes(l.exerciseId))) && (f.searchIds===null || s.exerciseLogs.some(l=>f.searchIds!.includes(l.exerciseId)))
}
export interface HistoryPageResult { items: WorkoutSession[]; totalCount: number; filteredCount: number; hasMore: boolean; nextCursor: unknown }
/** A remote cursor is advanced only after its buffered rows have been consumed. */
export class HistoryPager {
  private buffer: WorkoutSession[]=[]
  private cursor: unknown=null
  private remoteMore=true
  private local: WorkoutSession[]
  private seen=new Set<string>()
  items: WorkoutSession[]=[]
  totalCount=0
  filteredCount=0
  private busy: Promise<void> | null=null
  constructor(private load:(cursor:unknown)=>Promise<HistoryPageResult>, private pending: WorkoutSession[], private filters:SessionFilters) {this.local=pending.filter(s=>matchesSession(s,filters)).sort(compareSessions)}
  get hasMore(){return this.remoteMore||this.buffer.length>0||this.local.length>0}
  more(size=10,signal?:AbortSignal):Promise<void> {
    if(signal?.aborted)return Promise.reject(new DOMException('Lectura cancelada','AbortError'))
    if(this.busy) {
      const target=this.items.length+size
      return this.busy.catch(error=>{
        if(!(error instanceof DOMException && error.name==='AbortError'))throw error
      }).then(()=>this.more(Math.max(0,target-this.items.length),signal))
    }
    this.busy=this.take(size,signal).finally(()=>{this.busy=null})
    return this.busy
  }
  private async take(size:number,signal?:AbortSignal) {
    const end=this.items.length+size
    while(this.items.length<end && this.hasMore) {
      if(signal?.aborted)throw new DOMException('Lectura cancelada','AbortError')
      if(!this.buffer.length && this.remoteMore) {
        const p=await this.load(this.cursor)
        this.buffer=p.items;this.cursor=p.nextCursor;this.remoteMore=p.hasMore
        this.totalCount=p.totalCount+this.pending.filter(s=>this.filters.includeInitial||realSession(s)).length
        this.filteredCount=p.filteredCount+this.pending.filter(s=>matchesSession(s,this.filters)).length
        if(p.hasMore&&!p.items.length)throw new Error('Página incompatible: hasMore sin filas')
      }
      if(signal?.aborted)throw new DOMException('Lectura cancelada','AbortError')
      const item=this.local.length && (!this.buffer.length||compareSessions(this.local[0],this.buffer[0])<0)?this.local.shift():this.buffer.shift()
      if(item&&!this.seen.has(item.id)){this.seen.add(item.id);this.items=[...this.items,item]}
    }
  }
}
export interface ReadProgressEntry {sessionId:string;logId:string;date:string;startedAt:string;weightKg:number;reps:number[];volumeKg:number}
export interface ReadProgress {sessionCount:number;bestWeight:number;accumulatedVolume:number;latest?:ReadProgressEntry;entries:ReadProgressEntry[];hasMore:boolean}
const entryOrder=(a:ReadProgressEntry,b:ReadProgressEntry)=>compareSessions({id:a.sessionId,startedAt:a.startedAt,completedAt:a.date},{id:b.sessionId,startedAt:b.startedAt,completedAt:b.date})
export function reconcileProgress(remote: ReadProgress, local:WorkoutSession[], ids:string[], limit:number):ReadProgress {
  const entries=local.filter(realSession).flatMap(s=>{
    const log=s.exerciseLogs.find(l=>ids.includes(l.exerciseId));if(!log)return []
    const sets=log.sets.filter(s=>s.completed).sort((a,b)=>a.setNumber-b.setNumber)
    return [{sessionId:s.id,logId:log.id,date:getSessionDate(s),startedAt:s.startedAt,performedWeight:getPerformedWeight(log),weightKg:log.workingWeightKg??sets[0]?.weightKg??0,reps:sets.map(s=>s.reps),volumeKg:getSessionVolume({...s,exerciseLogs:[log]})}]
  })
  const recent=[...remote.entries,...entries].sort(entryOrder).slice(0,limit)
  const count=remote.sessionCount+entries.length
  return {sessionCount:count,bestWeight:Math.max(remote.bestWeight,0,...entries.map(e=>e.performedWeight)),accumulatedVolume:remote.accumulatedVolume+entries.reduce((n,e)=>n+e.volumeKg,0),latest:recent[0],entries:recent,hasMore:count>recent.length}
}
export interface ReadPerformance extends LastExercisePerformance {startedAt:string}
export function reconcilePerformance(remote:ReadPerformance|null,local:WorkoutSession[],id:string,ids:string[]) {
  const candidate=getLastExercisePerformanceFromSessions([...local].sort(compareSessions),id,ids)
  const choices=[...(remote?[remote]:[]),...(candidate?[{...candidate,startedAt:local.find(s=>s.id===candidate.sessionId)!.startedAt}]:[])]
  return choices.sort((a,b)=>Number(a.sessionId.startsWith('initial-'))-Number(b.sessionId.startsWith('initial-'))||compareSessions({id:a.sessionId,startedAt:a.startedAt,completedAt:a.performedAt},{id:b.sessionId,startedAt:b.startedAt,completedAt:b.performedAt}))[0]??null
}
export function searchExerciseIds(exercises:Exercise[],counts:Record<string,number>,text:string) {
  const search=text.trim().toLowerCase();if(!search)return null
  const names=new Map(exercises.map(e=>[e.id,e.name]))
  return [...new Set([...names.keys(),...Object.keys(counts)])].filter(id=>(names.get(id)??id).toLowerCase().includes(search))
}

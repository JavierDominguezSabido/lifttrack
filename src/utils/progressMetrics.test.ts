import { expect, it } from 'vitest'
import { weightChartModel } from './weightChart'
import { getPerformedWeight, getSessionVolume } from './workout'
import { reconcileProgress, compareSessions } from '../services/historyReads'
import type { WorkoutSession } from '../types'
it.each([[],[65],[60,65],[65,60],[65,65,65,65],[60,61,62,63],[0,300],[65,65.1]])('gráfica estable y dominio honesto: %j',(...values:number[])=>{
  const model=weightChartModel(values)
  expect(model.max-model.min).toBeGreaterThanOrEqual(10)
  expect(model.points.every(p=>Number.isFinite(p.y)&&p.y>=10&&p.y<=90)).toBe(true)
  expect(model.points.filter(p=>p.label).length).toBeLessThanOrEqual(2)
  if(values.length && values.every(v=>v===values[0])) expect(new Set(model.points.map(p=>p.y)).size).toBe(1)
})
it('local optimista: volumen efectivo, récord separado, primer equivalente y parcial',()=>{
  const session:WorkoutSession={id:'s',name:'s',dayOfWeek:1,startedAt:'2026-09-07T10:00:00Z',volumeKg:99999,exerciseLogs:[{id:'l',sessionId:'s',exerciseId:'press',order:1,workingWeightKg:300,sets:[
    {id:'a',exerciseLogId:'l',setNumber:1,reps:8,weightKg:50,weightOverrideKg:75,completed:true},
    {id:'b',exerciseLogId:'l',setNumber:2,reps:2,weightKg:150,isWarmup:true,completed:true},
    {id:'c',exerciseLogId:'l',setNumber:3,reps:9,weightKg:500,completed:false},
    {id:'d',exerciseLogId:'l',setNumber:4,reps:8,weightKg:600,weightOverrideKg:0,completed:true}
  ]}]}
  expect(getSessionVolume(session)).toBe(900)
  expect(getPerformedWeight(session.exerciseLogs[0])).toBe(75)
  const remote={sessionCount:10,bestWeight:95,accumulatedVolume:5000,entries:[],hasMore:true}
  const result=reconcileProgress(remote,[session],['press','alias'],8)
  expect(result).toMatchObject({bestWeight:95,accumulatedVolume:5900,sessionCount:11})
  expect(result.latest?.weightKg).toBe(300)
  session.exerciseLogs.push({...session.exerciseLogs[0],id:'other',exerciseId:'alias',order:2})
  expect(reconcileProgress(remote,[session],['press','alias'],8)).toEqual(result)
})
it('ordena instantes con offsets, no texto ISO',()=>{
  const a={id:'a',startedAt:'2026-09-07T00:30:00+02:00'},b={id:'b',startedAt:'2026-09-06T23:00:00Z'}
  expect([a,b].sort(compareSessions).map(s=>s.id)).toEqual(['b','a'])
})


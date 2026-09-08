import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { StaleHistoryRead, type HistoryReader } from './historyReader'

const subscribe=()=>()=>{}
const zero=()=>0
export function useHistoryRead<T>(reader:HistoryReader|undefined,key:string,load:(signal:AbortSignal)=>Promise<T>,retainKey?:string) {
  const generation=useSyncExternalStore(reader?.subscribe??subscribe,reader?.version??zero)
  const activeKey=JSON.stringify([reader?.owner,generation,key])
  const scope=JSON.stringify([reader?.owner,generation,retainKey??key])
  const loader=useRef(load);loader.current=load
  const [state,setState]=useState<{key:string;scope:string;value?:T;error?:string}>({key:'',scope:''})
  useEffect(()=>{
    if(!reader)return
    let active=true
    const controller=new AbortController()
    void loader.current(controller.signal).then(value=>{if(active)setState({key:activeKey,scope,value})}).catch(error=>{
      if(active&&!(error instanceof StaleHistoryRead))setState({key:activeKey,scope,error:error instanceof Error?error.message:String(error)})
    })
    return()=>{active=false;controller.abort()}
  },[reader,activeKey,scope])
  return {key:activeKey,value:state.scope===scope?state.value:undefined,error:state.key===activeKey?state.error:undefined,pending:state.key!==activeKey}
}

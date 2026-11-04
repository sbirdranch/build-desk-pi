'use client';
import {useEffect,useState} from 'react';
import {Printer,RefreshCw} from 'lucide-react';
import type {PrinterView} from '@/core/types';
const stateNames:Record<string,string>={RUNNING:'Printing',PAUSE:'Paused',FINISH:'Finished',IDLE:'Idle',FAILED:'Failed',PREPARE:'Preparing',SLICING:'Slicing'};
const remaining=(minutes:number)=>minutes>=60?`${Math.floor(minutes/60)}h ${Math.round(minutes%60)}m`:`${Math.round(minutes)}m`;
export default function PrinterStatus({buildId,initial,mobile,recordedAt,notice='',noticeError=false,noticeSeconds=15,onDismiss,onReload,reloadDisabled=false}:{buildId:string;initial:PrinterView;mobile:boolean;recordedAt:string;notice?:string;noticeError?:boolean;noticeSeconds?:number;onDismiss:()=>void;onReload:()=>void;reloadDisabled?:boolean}) {
 const [device,setDevice]=useState(initial);
 useEffect(()=>{setDevice(initial)},[buildId,initial]);
 useEffect(()=>{
  if(mobile)return;let stopped=false;const controller=new AbortController();
  async function refresh(){if(document.hidden)return;try {
   const response=await fetch('/api/builds/'+encodeURIComponent(buildId)+'/printer',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error();const data:PrinterView=await response.json();if(!stopped)setDevice(data);
  }catch{if(!stopped)setDevice(old=>({...old,status:old.lastSeen?'stale':'offline',label:'Printer status unavailable'}));}}
  refresh();const timer=setInterval(refresh,10000);document.addEventListener('visibilitychange',refresh);
  return()=>{stopped=true;clearInterval(timer);controller.abort();document.removeEventListener('visibilitychange',refresh)};
 },[buildId,mobile]);
 const live=device.status==='live',state=device.state?(stateNames[device.state]||device.state):'';
 return <footer className={'printer-bar status-dock '+device.status} aria-label="Status bar">
  <div className="printer-device" aria-label="Printer device status">{mobile?<span className="muted">Recorded information only</span>:<><div className="printer-summary"><Printer size={18}/><strong>{device.name}</strong>
   <span className="printer-signal">{live?'● Connected':device.label}</span>
   {state&&<strong>{live?state:'Last reported: '+state}</strong>}
   {device.progress!==undefined&&<span>{device.progress}%</span>}
   {device.remainingMinutes!==undefined&&<span>~{remaining(device.remainingMinutes)} remaining</span>}
   {device.layer!==undefined&&device.totalLayers!==undefined&&<span>Layer {device.layer} / {device.totalLayers}</span>}
   <span className="printer-observed muted">{device.lastSeen?'Observed '+new Date(device.lastSeen).toLocaleTimeString():'Read-only status'}</span>
  </div>
  {device.job&&<div className="printer-job" title={device.job}>Device job: {device.job}</div>}</>}</div>
  <div className="status-reference">
   <div className={'dock-notice'+(noticeError?' error':'')} role={noticeError?'alert':'status'}>
    {notice&&<><span className="dock-message" title={notice}>{notice}</span>{!noticeError&&<small aria-hidden="true">{noticeSeconds}s</small>}<button aria-label="Dismiss message" onClick={onDismiss}>✕</button></>}
   </div>
   <div className="tracker-reference"><span title="Last saved time of the local tracker">Local tracker · saved {new Date(recordedAt).toLocaleString(undefined,{dateStyle:'short',timeStyle:'short'})}</span><button disabled={reloadDisabled} onClick={onReload}><RefreshCw size={12}/>Reload Tracking Data</button></div>
  </div>
 </footer>;
}

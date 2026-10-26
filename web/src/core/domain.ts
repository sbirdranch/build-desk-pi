import {createHash,randomUUID} from 'node:crypto';
import {applyPurchase} from './purchasing';
import type {BuildConfig,Command,Snapshot,Job,JobItem,ResultInput} from './types';
export class DomainError extends Error {constructor(message:string,public status=422){super(message)}}
export const integer=(n:unknown,min=0):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min;
export function requireThat(ok:unknown,message:string):asserts ok {if(!ok)throw new DomainError(message)}
export function stateHash(s:Snapshot){return createHash('sha256').update(JSON.stringify({parts:s.parts,files:s.files,plates:s.plates,jobs:s.jobs,purchasing:s.purchasing})).digest('hex')}
export function status(part:{required:number|null;accepted:number}){return part.required===null?'unconfirmed':part.accepted>=part.required?'completed':part.accepted>0?'partial':'not-printed'}
export function recalculate(s:Snapshot){for(const p of s.parts)p.accepted=p.opening+s.jobs.filter(j=>j.status==='Completed').flatMap(j=>j.items).filter(i=>i.partId===p.id&&integer(i.accepted)&&integer(i.rejected)&&(i.accepted??0)+(i.rejected??0)===i.planned).reduce((n,i)=>n+i.accepted!,0)}
function validateResults(job:Job,results:ResultInput[],complete:boolean){
 requireThat(Array.isArray(results)&&results.length===job.items.length,'Provide a result for every started part.');
 requireThat(new Set(results.map(r=>r.mappingId)).size===results.length,'Duplicate result rows.');
 for(const item of job.items){const r=results.find(r=>r.mappingId===item.mappingId);requireThat(r,'Missing result row.');
  requireThat((r.accepted===null||integer(r.accepted))&&(r.rejected===null||integer(r.rejected)),'Counts must be nonnegative whole numbers.');
  if(complete)requireThat(integer(r.accepted)&&integer(r.rejected)&&r.accepted+r.rejected===item.planned,'Accepted + rejected must equal the quantity recorded at Start.');
  else requireThat((r.accepted??0)+(r.rejected??0)<=item.planned,'Draft counts exceed the started quantity.');
 }
}
export function applyCommand(original:Snapshot,command:Command,config:BuildConfig,sourceHashes:Record<string,string|null>,now=new Date().toISOString()):{state:Snapshot;target:string;summary:string}{
 const s=structuredClone(original);let target='',summary='';
 requireThat(command&&typeof command.type==='string','Choose a valid action.');
 if(command.type==='purchase-review'){requireThat(config.active&&s.purchasing,'Purchasing is read-only or unavailable.');const p=s.purchasing;requireThat(command.eventIds.length>0&&!command.eventIds.some(id=>p.ledger.some(e=>e.eventIds.includes(id))),'These events have already been resolved. Refresh the review.');try{if(!command.dismiss)s.purchasing=applyPurchase(p,{kind:'order',items:command.items},randomUUID(),now);}catch(e){throw new DomainError((e as Error).message);}const current=s.purchasing!;if(!command.dismiss){for(const input of command.items){const item=current.items.find(i=>i.id===input.id)!;item.sources=Array.from(new Set([...item.sources,...input.sources]));item.eventAt=input.eventAt;item.sourceItemId=input.sourceItemId;item.sourceAliases=input.sourceAliases;}}
 current.ledger.push({id:randomUUID(),at:now,kind:command.dismiss?'dismissed':'applied',target:command.items[0]?.orderId||'',reason:command.dismiss?'Dismissed source events':'Approved source events',before:command.dismiss?null:p.items,after:command.dismiss?null:command.items,eventIds:command.eventIds,sourceIds:command.sourceIds,files:command.files});return {state:s,target:command.eventIds.join(','),summary:command.dismiss?'Dismissed order updates':'Applied order updates'};}
 if(command.type==='purchasing'){requireThat(config.active,'Archived builds are read-only.');requireThat(s.purchasing,'Purchasing data unavailable.');try{s.purchasing=applyPurchase(s.purchasing,command.operation,randomUUID(),now);}catch(e){throw new DomainError((e as Error).message);}return {state:s,target:s.purchasing.ledger.at(-1)!.target,summary:'Saved purchasing '+command.operation.kind};}
 if(command.type==='reconcile-file'){
  const file=s.files.find(f=>f.id===command.fileId);requireThat(file,'File not found.');
  requireThat(sourceHashes[file.id]&&sourceHashes[file.id]===command.sourceHash,'The 3MF changed during refresh. Save it and refresh again.');
  requireThat(Array.isArray(command.plates)&&new Set(command.plates.map(p=>p.number)).size===command.plates.length,'Invalid imported plates.');
  const oldPlates=s.plates.filter(p=>p.fileId===file.id),updated=[];
  for(const imported of command.plates){
   requireThat(integer(imported.number,1),'Invalid imported plate number.');
   const existing=oldPlates.find(p=>p.number===imported.number);requireThat(existing||command.registerPlates?.includes(imported.number),'New custom plates require explicit registration.');
   const old=existing||{id:file.id+'-P'+String(imported.number).padStart(2,'0'),fileId:file.id,number:imported.number,name:imported.name,section:file.section,assignments:[]};
   requireThat(new Set(imported.assignments.map(a=>a.partId)).size===imported.assignments.length,'Duplicate imported part rows.');
   const assignments=imported.assignments.map(a=>{requireThat(s.parts.some(p=>p.id===a.partId),'Unknown imported part.');requireThat(a.copies===null||integer(a.copies),'Invalid imported copy count.');return {id:old.assignments.find(x=>x.partId===a.partId)?.id||file.id+'-M-'+randomUUID().slice(0,12),partId:a.partId,copies:a.copies,confirmed:!a.split,note:a.split?'Split STL component(s); confirm complete-unit quantities before printing.':(old.assignments.find(x=>x.partId===a.partId)?.note||'')};});
   const plate={...old,name:String(imported.name).slice(0,200),assignments,unmappedObjects:imported.unmapped.map(n=>String(n).slice(0,250))};
   // Retain a preparation only if neither the source nor membership changed.
   const ordered=(rows:typeof old.assignments)=>JSON.stringify([...rows].sort((a,b)=>a.id.localeCompare(b.id)).map(a=>({id:a.id,partId:a.partId,copies:a.copies,confirmed:a.confirmed,note:a.note||''})));
   if(file.sourceHash!==command.sourceHash||ordered(old.assignments)!==ordered(assignments)||old.name!==plate.name)delete plate.preparation;
   updated.push(plate);
  }
  s.plates=s.plates.filter(p=>p.fileId!==file.id).concat(updated).sort((a,b)=>a.fileId.localeCompare(b.fileId)||a.number-b.number);
  file.sourceHash=command.sourceHash;file.importedAt=now;target=file.id;summary='Reconciled saved plate memberships and invalidated changed preparations';
 }else if(command.type==='update-parts'){
  requireThat(Array.isArray(command.items)&&command.items.length>0&&command.items.length<=200,'Choose parts to update.');
  requireThat(new Set(command.items.map(i=>i.partId)).size===command.items.length,'Duplicate part updates.');
  for(const item of command.items){const p=s.parts.find(p=>p.id===item.partId);requireThat(p,'Part not found.');requireThat(item.required===null||integer(item.required),'Required quantity must be blank or a nonnegative whole number.');requireThat(integer(item.installed)&&item.installed<=p.accepted,'Installed count cannot exceed accepted count.');p.required=item.required;p.installed=item.installed;}
  target=command.items.map(i=>i.partId).join(',');summary='Saved quantities for '+command.items.length+' part(s)';
 }else if(command.type==='save-preparation'){
  const plate=s.plates.find(p=>p.id===command.plateId);requireThat(plate,'Plate not found.');const prep=command.preparation;
  requireThat(integer(prep.runs,1)&&prep.runs<=100,'Plate runs must be between 1 and 100.');
  requireThat(config.workflow.materials.includes(prep.material),'Choose a configured material.');const file=s.files.find(f=>f.id===plate.fileId)!;requireThat(file.material.includes('TPU')===prep.material.includes('TPU'),'Choose a material compatible with this project: '+file.material+'.');requireThat(typeof prep.profile==='string'&&prep.profile.trim(),'Enter a print profile.');
  requireThat(typeof prep.layoutConfirmed==='boolean','Confirm whether the layout was reviewed.');
  requireThat(sourceHashes[plate.fileId]&&prep.sourceHash===sourceHashes[plate.fileId],'The source file changed or cannot be read. Refresh it before saving.');
  requireThat(Array.isArray(prep.items)&&prep.items.length===plate.assignments.length,'The plate membership changed. Refresh it.');
  requireThat(new Set(prep.items.map(i=>i.mappingId)).size===prep.items.length,'Duplicate preparation items.');
  for(const a of plate.assignments){const item=prep.items.find(i=>i.mappingId===a.id);requireThat(item,'A mapped part is missing.');requireThat(typeof item.included==='boolean','Invalid include flag.');requireThat(item.copies===null||integer(item.copies),'Copies must be whole numbers.');requireThat(item.planned===null||integer(item.planned),'Planned quantity must be a whole number.');if(item.included&&prep.layoutConfirmed)requireThat(integer(item.copies,1)&&integer(item.planned,1),'Confirm enabled copies and planned quantities for included parts.');}
  plate.preparation={...prep,notes:String(prep.notes||'').slice(0,4000),profile:prep.profile.slice(0,200),savedAt:now};target=plate.id;summary='Saved plate preparation';
 }else if(command.type==='start'){
  const plate=s.plates.find(p=>p.id===command.plateId);requireThat(plate,'Plate not found.');const prep=plate.preparation;requireThat(prep?.layoutConfirmed,'Save a confirmed layout before starting.');requireThat(!plate.unmappedObjects?.length,'Match the unknown plate objects before starting.');
  requireThat(sourceHashes[plate.fileId]&&prep.sourceHash===sourceHashes[plate.fileId],'The saved preparation is stale. Review the changed source file.');
  requireThat(integer(prep.runs,1)&&config.workflow.materials.includes(prep.material),'Review the saved runs and material.');const sourceFile=s.files.find(f=>f.id===plate.fileId)!;requireThat(sourceFile.material.includes('TPU')===prep.material.includes('TPU'),'The saved material is incompatible with this file.');
  requireThat(s.jobs.filter(j=>j.status==='Printing').length<config.workflow.maxPrintingJobs,'The printer already has an active tracked print.');
  const file=s.files.find(f=>f.id===plate.fileId)!;const included=prep.items.filter(i=>i.included);requireThat(included.length,'Include at least one part.');
  const seen=new Set<string>();const items:JobItem[]=included.map(i=>{const a=plate.assignments.find(a=>a.id===i.mappingId);requireThat(a,'Mapping no longer exists.');requireThat(!seen.has(a.partId),'Combine duplicate part mappings before starting.');seen.add(a.partId);requireThat(integer(i.planned,1),'Each included part needs a positive planned quantity.');return {partId:a.partId,mappingId:a.id,fileId:file.id,fileRevision:file.revision,filename:file.filename,plateNumber:plate.number,plateName:plate.name,runs:prep.runs,planned:i.planned,accepted:null,rejected:null,profile:prep.profile,material:prep.material,notes:prep.notes};});
  target=`${config.id}-J-${now.slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8)}`;
  s.jobs.push({id:target,kind:'plate',status:'Printing',startedAt:now,finishedAt:'',items});summary='Started tracked print; printer execution remains in Bambu Studio';
 }else if(command.type==='manual-results'){
  requireThat(Array.isArray(command.items)&&command.items.length>0&&command.items.length<=200,'Select one or more parts.');
  requireThat(new Set(command.items.map(i=>i.mappingId)).size===command.items.length,'Duplicate manual result rows.');
  const items:JobItem[]=command.items.map(i=>{const plate=s.plates.find(p=>p.assignments.some(a=>a.id===i.mappingId));requireThat(plate,'Original part-to-plate mapping not found.');const a=plate.assignments.find(a=>a.id===i.mappingId)!;const file=s.files.find(f=>f.id===plate.fileId)!;requireThat(integer(i.planned,1)&&integer(i.accepted)&&integer(i.rejected)&&i.accepted+i.rejected===i.planned,'Manual accepted + rejected must equal planned, using whole numbers.');return {partId:a.partId,mappingId:a.id,fileId:file.id,fileRevision:file.revision,filename:file.filename,plateNumber:plate.number,plateName:plate.name,runs:0,planned:i.planned,accepted:i.accepted,rejected:i.rejected,profile:'Manual reprint',material:'Manual',notes:'[Manual reprint] '+String(command.notes||'').slice(0,4000)};});
  target=`${config.id}-M-${randomUUID().slice(0,12)}`;s.jobs.push({id:target,kind:'manual',status:'Completed',startedAt:now,finishedAt:now,items});summary=`Manual reprint: ${items.reduce((n,i)=>n+i.accepted!,0)} accepted; original plates credited without recording plate runs`;
 }else if(command.type==='update-part'){
  const p=s.parts.find(p=>p.id===command.partId);requireThat(p,'Part not found.');requireThat(command.required===null||integer(command.required),'Required quantity must be blank or a nonnegative whole number.');requireThat(integer(command.installed)&&command.installed<=p.accepted,'Installed count cannot exceed accepted count.');
  p.required=command.required;p.installed=command.installed;p.notes=String(command.notes||'').slice(0,4000);target=p.id;summary='Updated part requirements, installation count and notes';
 }else{
  const job=s.jobs.find(j=>j.id===('jobId'in command?command.jobId:''));requireThat(job,'Job not found.');target=job.id;
  if(command.type==='await-inspection'){requireThat(job.status==='Printing','Only a printing job can move to inspection.');job.status='Awaiting inspection';summary='Print reported finished; no parts accepted yet';}
  else if(command.type==='save-results'||command.type==='finish'){
   requireThat(job.status==='Printing'||job.status==='Awaiting inspection','This job is already closed.');const results=command.type==='finish'&&Array.isArray(command.results)?command.results.map(r=>({...r,accepted:r.accepted===null?0:r.accepted,rejected:r.rejected===null?0:r.rejected})):command.results;validateResults(job,results,command.type==='finish');job.draft=results;
   if(command.type==='finish'){for(const i of job.items){const r=results.find(r=>r.mappingId===i.mappingId)!;i.accepted=r.accepted;i.rejected=r.rejected;}job.status='Completed';job.finishedAt=now;summary=`Completed print: ${job.items.reduce((n,i)=>n+i.accepted!,0)} accepted`;}
   else summary='Saved inspection draft; completion counts unchanged';
  }else if(command.type==='cancel'){requireThat(job.status==='Printing'||job.status==='Awaiting inspection','This job is already closed.');requireThat(!job.draft?.some(r=>(r.accepted??0)>0),'Accepted parts are drafted. Finish the job or clear the draft before cancelling.');job.status='Cancelled';job.finishedAt=now;summary='Cancelled print; no completion credited';}
  else throw new DomainError('Unknown action.');
 }
 recalculate(s);return {state:s,target,summary};
}

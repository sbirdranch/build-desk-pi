import ExcelJS from 'exceljs';
import {preparationData} from '../core/preparation';
import {decodePurchasing} from './purchasing-store';
import {readFile,writeFile,copyFile,rename,unlink,mkdir,open,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {BuildConfig,Snapshot,Part,ModelFile,Plate,Job,JobItem,Audit,Command,Preparation} from '../core/types';
import {applyCommand,DomainError,recalculate,stateHash} from '../core/domain';
import {workbookPath} from './registry';
const sheets={parts:'Printed Parts Checklist',files:'3MF Project Register',maps:'Part-to-Plate Mapping',history:'Print Job History',preps:'Build Desk Preparations',drafts:'Build Desk Result Drafts',audit:'Build Desk Change Log'};
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const text=(v:unknown)=>v===null||v===undefined?'':String(v);
const count=(v:unknown):number|null=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
function value(v:ExcelJS.CellValue):unknown{if(v&&typeof v==='object'){if('result'in v)return v.result??null;if('richText'in v)return v.richText.map(r=>r.text).join('');if('text'in v)return v.text;if(v instanceof Date)return v.toISOString().replace(/Z$/,'');}return v??null;}
function rows(sheet:ExcelJS.Worksheet,width:number){const result:unknown[][]=[];sheet.eachRow({includeEmpty:false},(row,n)=>{if(n>1&&value(row.getCell(1).value))result.push(Array.from({length:width},(_,i)=>value(row.getCell(i+1).value)));});return result;}
function safeJSON<T>(v:unknown):T|undefined{try{return JSON.parse(text(v)) as T;}catch{return undefined}}
function key(fileId:string,number:number){return `${fileId}-P${String(number).padStart(2,'0')}`}
function sheet(wb:ExcelJS.Workbook,name:string){const found=wb.getWorksheet(name);if(!found)throw new DomainError('Workbook is missing the '+name+' tab.');return found;}
export function decode(wb:ExcelJS.Workbook,config:BuildConfig,revision:string,recordedAt:string):Snapshot{
 const parts:Part[]=rows(sheet(wb,sheets.parts),18).map(r=>({id:text(r[0]),section:text(r[1]),name:text(r[2]),source:text(r[3]),material:text(r[4]),required:count(r[5]),opening:count(r[6])??0,accepted:0,installed:count(r[16])??0,notes:text(r[17])}));
 const files:ModelFile[]=rows(sheet(wb,sheets.files),10).filter(r=>!text(r[7]).toLowerCase().includes('obsolete')&&!text(r[7]).toLowerCase().includes('deleted')).map(r=>({id:text(r[0]),filename:text(r[1]),revision:text(r[3]),material:text(r[4]),profile:text(r[5]),section:''}));
 const plates:Plate[]=[];
 for(const r of rows(sheet(wb,sheets.maps),10)){
  if(text(r[6])==='Obsolete')continue;const f=files.find(f=>f.id===r[2]);const part=parts.find(p=>p.id===r[1]);if(!f||!part)continue;const number=Number(r[3]);if(!Number.isInteger(number)||number<1)continue;
  if(!f.section)f.section=part.section;const id=key(f.id,number);let plate=plates.find(p=>p.id===id);if(!plate){plate={id,fileId:f.id,number,name:text(r[4])||`Plate ${number}`,section:f.section,assignments:[]};plates.push(plate);}
  plate.assignments.push({id:text(r[0]),partId:part.id,copies:count(r[5]),confirmed:text(r[6])==='Confirmed',note:text(r[9])});
 }
 const imports=wb.getWorksheet('Build Desk File Imports');if(imports)for(const row of rows(imports,5)){
  const f=files.find(f=>f.id===row[0]);if(!f)continue;f.sourceHash=text(row[1]);f.importedAt=text(row[2]);if(!f.section)f.section=text(row[4]);
  const data=safeJSON<{number:number;name?:string;unmapped:string[]}[]>(row[3]);for(const item of data||[]){let p=plates.find(p=>p.fileId===f.id&&p.number===item.number);if(!p){p={id:key(f.id,item.number),fileId:f.id,number:item.number,name:item.name||`Plate ${item.number}`,section:f.section,assignments:[]};plates.push(p);}p.unmappedObjects=item.unmapped;}
 }

 const jobs:Job[]=[];
 for(const r of rows(sheet(wb,sheets.history),20)){
  const id=text(r[0]);let job=jobs.find(j=>j.id===id);const status=text(r[11]);if(!['Printing','Awaiting inspection','Completed','Cancelled'].includes(status))continue;
  if(!job){job={id,kind:text(r[14]).startsWith('[Manual reprint]')?'manual':'plate',status:status as Job['status'],startedAt:text(r[18]||r[1]),finishedAt:text(r[19]),items:[]};jobs.push(job);}
  if(job.status!==status)throw new DomainError('History job '+id+' has inconsistent row statuses; resolve it before continuing.');
  job.items.push({partId:text(r[2]),mappingId:text(r[3]),fileId:text(r[4]),fileRevision:text(r[5]),plateName:text(r[6]),runs:Number(r[7]||0),planned:Number(r[8]||0),accepted:count(r[9]),rejected:count(r[10]),profile:text(r[12]),material:text(r[13]),notes:text(r[14]),filename:text(r[16]),plateNumber:Number(r[17]||0)});
 }
 const pSheet=wb.getWorksheet(sheets.preps);if(pSheet)for(const r of rows(pSheet,4)){const p=plates.find(p=>p.id===r[0]);if(p){const prep=safeJSON<Preparation>(r[1]);p.preparation=prep?preparationData(prep):undefined;}}
 const dSheet=wb.getWorksheet(sheets.drafts);if(dSheet)for(const r of rows(dSheet,3)){const j=jobs.find(j=>j.id===r[0]);if(j)j.draft=safeJSON<Job['draft']>(r[1]);}
 const audit:Audit[]=wb.getWorksheet(sheets.audit)?rows(wb.getWorksheet(sheets.audit)!,8).map(r=>({requestId:text(r[0]),at:text(r[1]),action:text(r[2]),target:text(r[3]),before:text(r[4]),after:text(r[5]),summary:text(r[6])})):[];
 const snapshot:Snapshot={build:{id:config.id,name:config.name},revision,recordedAt,parts,files,plates,jobs,audit,purchasing:decodePurchasing(wb)};recalculate(snapshot);return snapshot;
}
function ownedSheet(wb:ExcelJS.Workbook,name:string,headers:string[]){let s=wb.getWorksheet(name);if(!s){s=wb.addWorksheet(name);s.addRow(headers);s.views=[{state:'frozen',ySplit:1}];s.getRow(1).font={bold:true};s.columns.forEach(c=>c.width=24);}return s;}
function findRow(s:ExcelJS.Worksheet,id:string){let empty=0;for(let i=2;i<=s.rowCount;i++){const key=text(value(s.getCell(i,1).value));if(key===id)return i;if(!key&&!empty)empty=i;}return empty||Math.max(2,s.rowCount+1);}
function persist(wb:ExcelJS.Workbook,before:Snapshot,after:Snapshot,requestId:string,command:Command,target:string,summary:string){
 // Google exports share formulas across many blank rows. Expand every follower
 // before updating its master; otherwise unrelated rows can become invalid.
 const formulas:{cell:ExcelJS.Cell;formula:string;result:ExcelJS.CellFormulaValue['result']}[]=[];
 wb.eachSheet(s=>s.eachRow(r=>r.eachCell(cell=>{if(cell.type===ExcelJS.ValueType.Formula&&cell.formula)formulas.push({cell,formula:cell.formula,result:cell.result})})));
 for(const f of formulas)f.cell.value={formula:f.formula,result:f.result};
 const parts=sheet(wb,sheets.parts);
 for(const p of after.parts){const old=before.parts.find(o=>o.id===p.id)!;const row=findRow(parts,p.id);if(old.required!==p.required)parts.getCell(row,6).value=p.required;if(old.installed!==p.installed)parts.getCell(row,17).value=p.installed;if(old.notes!==p.notes)parts.getCell(row,18).value=p.notes;
  // Cached values make audits readable without requiring an Excel calculation engine.
  parts.getCell(row,8).value={formula:`IF(A${row}="","",SUMIFS('Print Job History'!$J$2:$J$10001,'Print Job History'!$C$2:$C$10001,A${row},'Print Job History'!$L$2:$L$10001,"Completed",'Print Job History'!$P$2:$P$10001,"OK"))`,result:p.accepted-p.opening};
  parts.getCell(row,9).value={formula:`IF(A${row}="","",N(G${row})+N(H${row}))`,result:p.accepted};
  parts.getCell(row,10).value={formula:`IF(OR(A${row}="",F${row}=""),"",MAX(0,F${row}-I${row}))`,result:p.required===null?'':Math.max(0,p.required-p.accepted)};
  parts.getCell(row,16).value=p.required===null?'Confirm required qty':p.accepted>=p.required?'Completed':p.accepted>0?'Partial complete':'Not printed';
 }
 if(command.type==='reconcile-file'){
  const maps=sheet(wb,sheets.maps);const file=after.files.find(f=>f.id===command.fileId)!;
  const active=after.plates.filter(p=>p.fileId===file.id).flatMap(p=>p.assignments.map(a=>({p,a})));
  maps.eachRow((row,n)=>{if(n>1&&text(value(row.getCell(3).value))===file.id&&!active.some(x=>x.a.id===text(value(row.getCell(1).value))))row.getCell(7).value='Obsolete';});
  for(const {p,a} of active){const row=findRow(maps,a.id);[a.id,a.partId,file.id,p.number,p.name,a.copies,a.confirmed?'Confirmed':'Review needed',file.filename,file.filename+' / '+p.name,a.note||''].forEach((v,i)=>maps.getCell(row,i+1).value=v);}
  // Google-export DUMMYFUNCTION fallbacks cannot recalculate these locations in Excel.
  // Materialize current locations for affected parts so workbook audits match the app.
  const affected=new Set([...before.plates,...after.plates].filter(p=>p.fileId===file.id).flatMap(p=>p.assignments.map(a=>a.partId)));
  const unique=(values:string[])=>[...new Set(values)].join('\n')||'Unmapped';
  for(const id of affected){const row=findRow(parts,id),locations=after.plates.flatMap(p=>p.assignments.filter(a=>a.partId===id).map(a=>({p,a,f:after.files.find(f=>f.id===p.fileId)!})));
   parts.getCell(row,11).value=unique(locations.map(x=>x.f.filename));parts.getCell(row,12).value=unique(locations.map(x=>x.p.name));parts.getCell(row,13).value=unique(locations.map(x=>x.a.confirmed?'Confirmed':'Review needed'));parts.getCell(row,15).value=unique(locations.map(x=>x.f.filename+' / '+x.p.name+' ['+(x.a.confirmed?'Confirmed':'Review needed')+']'));
  }
  const imports=ownedSheet(wb,'Build Desk File Imports',['Project ID','Reconciled source SHA-256','Reconciled at UTC','Plate review JSON','Section']);if(!imports.getCell(1,5).value)imports.getCell(1,5).value='Section';imports.getRow(findRow(imports,file.id)).values=[file.id,file.sourceHash,file.importedAt,JSON.stringify(command.plates.map(p=>({number:p.number,name:p.name,unmapped:p.unmapped}))),file.section];
 }
 const history=sheet(wb,sheets.history);let next=2;history.eachRow((r,n)=>{if(n>1&&value(r.getCell(1).value))next=Math.max(next,n+1)});
 for(const j of after.jobs){const old=before.jobs.find(o=>o.id===j.id);if(old&&JSON.stringify(old)===JSON.stringify(j))continue;
  for(const item of j.items){let row=0;if(old)history.eachRow((r,n)=>{if(n>1&&text(value(r.getCell(1).value))===j.id&&text(value(r.getCell(4).value))===item.mappingId)row=n});if(!row)row=next++;
   const data=[j.id,j.startedAt,item.partId,item.mappingId,item.fileId,item.fileRevision,item.plateName,item.runs,item.planned,item.accepted,item.rejected,j.status,item.profile,item.material,item.notes,'',item.filename,item.plateNumber,j.startedAt,j.finishedAt];
   data.forEach((v,i)=>history.getCell(row,i+1).value=v);
   const valid=item.accepted!==null&&item.rejected!==null&&item.accepted+item.rejected===item.planned;
   history.getCell(row,16).value={formula:`IF(A${row}="","",IF(L${row}<>"Completed","Pending / not counted",IF(AND(ISNUMBER(J${row}),ISNUMBER(K${row}),J${row}+K${row}=I${row}),"OK","Check quantities")))`,result:j.status==='Completed'?(valid?'OK':'Check quantities'):'Pending / not counted'};
  }
 }
 const preps=ownedSheet(wb,sheets.preps,['Plate key','Preparation JSON','Saved at','Source SHA-256']);
 for(const p of after.plates)if(p.preparation&&JSON.stringify(p.preparation)!==JSON.stringify(before.plates.find(o=>o.id===p.id)?.preparation))preps.getRow(findRow(preps,p.id)).values=[p.id,JSON.stringify(p.preparation),p.preparation.savedAt,p.preparation.sourceHash];
 for(const p of before.plates)if(p.preparation&&!after.plates.find(x=>x.id===p.id)?.preparation){const row=findRow(preps,p.id);preps.getRow(row).values=[p.id,'','',''];}
 const drafts=ownedSheet(wb,sheets.drafts,['Job ID','Result draft JSON','Saved at']);
 for(const j of after.jobs)if(j.draft&&JSON.stringify(j.draft)!==JSON.stringify(before.jobs.find(o=>o.id===j.id)?.draft))drafts.getRow(findRow(drafts,j.id)).values=[j.id,JSON.stringify(j.draft),new Date().toISOString()];
 ownedSheet(wb,sheets.audit,['Request ID','Timestamp UTC','Action','Target ID','Before state SHA-256','After state SHA-256','Summary','Actor']).addRow([requestId,new Date().toISOString(),command.type,target,stateHash(before),stateHash(after),summary,'Local desktop user']);
 wb.calcProperties.fullCalcOnLoad=true;
}
export interface DataStore {load():Promise<Snapshot>;commit(expected:string,requestId:string,command:Command,sourceHashes:Record<string,string|null>):Promise<{snapshot:Snapshot;summary:string;replayed:boolean}>}
export function createStore(config:BuildConfig):DataStore {if(config.store.kind==='excel'&&config.store.schema==='master-tracker-v1')return new ExcelStore(config);throw new DomainError('No compatible data-store adapter is registered for this build.');}
export class ExcelStore implements DataStore{
 constructor(public config:BuildConfig){}
 async read(){const file=workbookPath(this.config);const bytes=await readFile(file);const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes as never);return {file,bytes,wb,snapshot:decode(wb,this.config,hash(bytes),(await stat(file)).mtime.toISOString())};}
 async load(){return (await this.read()).snapshot}
 async commit(expected:string,requestId:string,command:Command,sourceHashes:Record<string,string|null>){
  if(command.type==='save-acquisition')throw new DomainError('Purchasing requires the SQLite datastore.');
  if(!/^[a-zA-Z0-9-]{12,100}$/.test(requestId))throw new DomainError('Invalid request ID.');
  const file=workbookPath(this.config),lockFile=file+'.builddesk.lock';let lock;
  try{lock=await open(lockFile,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));}catch{throw new DomainError('Another save is in progress. Retry after it finishes.',409)}
  let temp='';try{
   const excelLock=path.join(path.dirname(file),'~$'+path.basename(file));try{await stat(excelLock);throw new DomainError('Close this workbook in Excel before saving in Build Desk.',409);}catch(e){if(e instanceof DomainError)throw e;}
   const {bytes,wb,snapshot}=await this.read();const previous=snapshot.audit.find(a=>a.requestId===requestId);if(previous)return {snapshot,summary:previous.summary,replayed:true};
   if(snapshot.revision!==expected)throw new DomainError('The workbook changed since this screen loaded. Refresh before saving.',409);
   const changed=applyCommand(snapshot,command,this.config,sourceHashes);
   persist(wb,snapshot,changed.state,requestId,command,changed.target,changed.summary);
   const output=Buffer.from(await wb.xlsx.writeBuffer());
   // Serialize completely before touching the authoritative file.
   const verify=new ExcelJS.Workbook();await verify.xlsx.load(output as never);const checked=decode(verify,this.config,hash(output),new Date().toISOString());
   if(checked.parts.length!==snapshot.parts.length||verify.worksheets.length<wb.worksheets.length)throw Error('Workbook verification failed before save.');
   if(hash(await readFile(file))!==hash(bytes))throw new DomainError('An outside edit occurred while saving. Refresh and retry.',409);
   const backupDir=path.join(path.dirname(file),'backups');await mkdir(backupDir,{recursive:true});await copyFile(file,path.join(backupDir,`${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.xlsx`));
   temp=path.join(path.dirname(file),`.builddesk-${randomUUID()}.xlsx`);await writeFile(temp,output,{flag:'wx'});await rename(temp,file);temp='';
   return {snapshot:checked,summary:changed.summary,replayed:false};
  }finally{if(temp)await unlink(temp).catch(()=>{});await lock.close();await unlink(lockFile).catch(()=>{});}
 }
}

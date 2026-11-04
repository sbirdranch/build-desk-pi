// Transactional runtime store; Phase 1 retains current Purchasing behavior until WP-02.
import {DatabaseSync} from 'node:sqlite';
import {stateHash} from '../core/domain';
import {existsSync} from 'node:fs';
import {backupSQLite} from './sqlite-backup';
import {SCHEMA_VERSION} from './sqlite-schema.mjs';
import type {BuildConfig,Command,Snapshot} from '../core/types';
import {applyCommand,DomainError} from '../core/domain';
import {readSQLiteSnapshot} from './sqlite-read';

const insert=(db:DatabaseSync,sql:string,values:unknown[][])=>{
 const stmt=db.prepare(sql);
 for(const row of values)stmt.run(...row as (string|number|bigint|null)[]);
};
function replacePrinting(db:DatabaseSync,id:string,s:Snapshot) {
 // A small (single-user, Pi-hosted) dataset allows atomic replacement of one build's
 // mutable Printing projection. This never deletes the other build's records or purchases.
 for(const table of ['inspection_drafts','print_job_items','print_jobs','preparation_items',
   'plate_preparations','plate_assignments','plates','model_files','print_parts']) {
   db.prepare('DELETE FROM '+table+' WHERE build_id=?').run(id);
 }
 insert(db,'INSERT INTO print_parts(build_id,id,name,section,source,material,required_qty,opening_qty,installed_qty,notes) VALUES(?,?,?,?,?,?,?,?,?,?)',
   s.parts.map(p=>[id,p.id,p.name,p.section,p.source,p.material,p.required,p.opening,p.installed,p.notes]));
 insert(db,'INSERT INTO model_files(build_id,id,filename,revision_label,profile,material,section,source_hash,imported_at) VALUES(?,?,?,?,?,?,?,?,?)',
   s.files.map(f=>[id,f.id,f.filename,f.revision,f.profile,f.material,f.section,f.sourceHash||null,f.importedAt||null]));
 insert(db,'INSERT INTO plates(build_id,id,file_id,plate_number,name,section,unmapped_json) VALUES(?,?,?,?,?,?,?)',
   s.plates.map(p=>[id,p.id,p.fileId,p.number,p.name,p.section,JSON.stringify(p.unmappedObjects||[])]));
 insert(db,'INSERT INTO plate_assignments(build_id,id,plate_id,part_id,copies,confirmed,note) VALUES(?,?,?,?,?,?,?)',
   s.plates.flatMap(p=>p.assignments.map(a=>[id,a.id,p.id,a.partId,a.copies,Number(a.confirmed),a.note||''])));
 insert(db,'INSERT INTO plate_preparations(build_id,plate_id,runs,material,profile,source_hash,notes,saved_at) VALUES(?,?,?,?,?,?,?,?)',
   s.plates.filter(p=>p.preparation).map(p=>[id,p.id,p.preparation!.runs,p.preparation!.material,p.preparation!.profile,
     p.preparation!.sourceHash,p.preparation!.notes,p.preparation!.savedAt]));
 insert(db,'INSERT INTO preparation_items(build_id,plate_id,mapping_id,included,copies,planned_qty) VALUES(?,?,?,?,?,?)',
   s.plates.filter(p=>p.preparation).flatMap(p=>p.preparation!.items.map(i=>[id,p.id,i.mappingId,Number(i.included),i.copies,i.planned])));
 insert(db,'INSERT INTO print_jobs(build_id,id,kind,status,started_at,finished_at) VALUES(?,?,?,?,?,?)',
   s.jobs.map(j=>[id,j.id,j.kind,j.status,j.startedAt,j.finishedAt||null]));
 insert(db,'INSERT INTO print_job_items(build_id,job_id,line_no,part_id,mapping_id,file_id,file_revision,filename,plate_number,plate_name,runs,planned_qty,accepted_qty,rejected_qty,profile,material,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   s.jobs.flatMap(j=>j.items.map((i,n)=>[id,j.id,n,i.partId,i.mappingId,i.fileId,i.fileRevision,i.filename,
     i.plateNumber,i.plateName,i.runs,i.planned,i.accepted,i.rejected,i.profile,i.material,i.notes])));
 insert(db,'INSERT INTO inspection_drafts(build_id,job_id,mapping_id,accepted_qty,rejected_qty) VALUES(?,?,?,?,?)',
   s.jobs.flatMap(j=>(j.draft||[]).map(d=>[id,j.id,d.mappingId,d.accepted,d.rejected])));
}
export class SQLiteStore {
 constructor(readonly config:BuildConfig,readonly databasePath:string){}
 private open(){
  if(!existsSync(this.databasePath))throw Error('SQLite database not found; migrate before startup.');
  const db=new DatabaseSync(this.databasePath,{readOnly:false});
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const version=db.prepare('SELECT MAX(version) version FROM schema_migrations').get()?.version;
  if(version!==SCHEMA_VERSION){db.close();throw Error('Unsupported SQLite schema; migrate before startup.');}
  return db;
 }
 async load():Promise<Snapshot>{
  const db=this.open();
  try{db.exec('BEGIN');const snapshot=readSQLiteSnapshot(db,this.config.id);db.exec('COMMIT');return snapshot}finally{db.close()}
 }
 async commit(expected:string,requestId:string,command:Command,sourceHashes:Record<string,string|null>):
   Promise<{snapshot:Snapshot;summary:string;replayed:boolean}>{
  if(!this.config.active)throw new DomainError('Archived builds are read-only.',403);
  if(!/^[a-zA-Z0-9-]{12,100}$/.test(requestId))throw new DomainError('Invalid request ID.');
  await backupSQLite(this.databasePath);
  const db=this.open();
  try{
   db.exec('BEGIN IMMEDIATE');
   try{
    const previous=db.prepare('SELECT summary FROM write_requests WHERE build_id=? AND request_id=?').get(this.config.id,requestId) as {summary:string}|undefined;
    if(previous){const snapshot=readSQLiteSnapshot(db,this.config.id);db.exec('COMMIT');return {snapshot,summary:previous.summary,replayed:true}}
    const current=readSQLiteSnapshot(db,this.config.id);
    if(current.revision!==expected)throw new DomainError('Tracking data changed since this screen loaded. Refresh before saving.',409);
    if(command.type==='start'){
     const printer=this.config.printer?.id||'build-'+this.config.id;
     const owner=db.prepare('SELECT printer_id,active FROM builds WHERE id=?').get(this.config.id);
     if(owner?.printer_id!==printer)throw new DomainError('Printer configuration differs from database. Reconcile before starting.',409);
     const occupied=db.prepare("SELECT b.name FROM print_jobs j JOIN builds b ON b.id=j.build_id WHERE b.printer_id=? AND j.status='Printing' AND j.build_id<>? LIMIT 1").get(printer,this.config.id);
     if(occupied)throw new DomainError('This printer already has a tracked print in '+occupied.name+'.',409);
    }
    const changed=applyCommand(current,command,this.config,sourceHashes);
    if(command.type!=='purchasing'&&command.type!=='purchase-review')replacePrinting(db,this.config.id,changed.state);
    changed.state.audit.push({requestId,at:new Date().toISOString(),action:command.type,target:changed.target,summary:changed.summary,before:stateHash(current),after:stateHash(changed.state)});
    db.prepare('INSERT INTO runtime_compatibility VALUES(?,?,?,?) ON CONFLICT(build_id) DO UPDATE SET purchasing_json=excluded.purchasing_json,audit_json=excluded.audit_json,preparations_json=excluded.preparations_json').run(this.config.id,JSON.stringify(changed.state.purchasing||{parts:[],items:[],ledger:[]}),JSON.stringify(changed.state.audit),JSON.stringify(Object.fromEntries(changed.state.plates.filter(p=>p.preparation).map(p=>[p.id,p.preparation]))));
    const now=new Date().toISOString(),revision=Number(expected)+1;
    db.prepare('UPDATE build_revisions SET revision=?,updated_at=? WHERE build_id=?').run(revision,now,this.config.id);
    db.prepare('INSERT INTO write_requests(build_id,request_id,command_type,summary,committed_at,revision) VALUES(?,?,?,?,?,?)')
      .run(this.config.id,requestId,command.type,changed.summary,now,revision);
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQLite foreign key validation failed during save');
    const snapshot=readSQLiteSnapshot(db,this.config.id);
    db.exec('COMMIT');
    return {snapshot,summary:changed.summary,replayed:false};
   }catch(e){db.exec('ROLLBACK');throw e}
  }finally{db.close()}
 }
}

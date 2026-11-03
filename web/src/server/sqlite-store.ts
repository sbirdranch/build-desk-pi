// Transactional Printing DataStore for Build Desk's future SQLite runtime.
// Deliberately not wired to the production registry until migration and WP-02 are accepted.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
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
  const db=new DatabaseSync(this.databasePath,{readOnly:false});
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  return db;
 }
 async load():Promise<Snapshot>{
  const db=this.open();
  try{return readSQLiteSnapshot(db,this.config.id)}finally{db.close()}
 }
 async commit(expected:string,requestId:string,command:Command,sourceHashes:Record<string,string|null>):
   Promise<{snapshot:Snapshot;summary:string;replayed:boolean}>{
  if(!this.config.active)throw new DomainError('Archived builds are read-only.',403);
  if(command.type==='purchasing'||command.type==='purchase-review')
   throw new DomainError('Purchasing is not yet supported by the SQLite runtime adapter.',422);
  if(!/^[a-zA-Z0-9-]{12,100}$/.test(requestId))throw new DomainError('Invalid request ID.');
  const db=this.open();
  try{
   db.exec('BEGIN IMMEDIATE');
   try{
    const previous=db.prepare('SELECT summary FROM write_requests WHERE build_id=? AND request_id=?').get(this.config.id,requestId) as {summary:string}|undefined;
    if(previous){db.exec('COMMIT');return {snapshot:readSQLiteSnapshot(db,this.config.id),summary:previous.summary,replayed:true}}
    const current=readSQLiteSnapshot(db,this.config.id);
    if(current.revision!==expected)throw new DomainError('Tracking data changed since this screen loaded. Refresh before saving.',409);
    const changed=applyCommand(current,command,this.config,sourceHashes);
    replacePrinting(db,this.config.id,changed.state);
    const now=new Date().toISOString(),revision=Number(expected)+1;
    db.prepare('UPDATE build_revisions SET revision=?,updated_at=? WHERE build_id=?').run(revision,now,this.config.id);
    db.prepare('INSERT INTO write_requests(build_id,request_id,command_type,summary,committed_at,revision) VALUES(?,?,?,?,?,?)')
      .run(this.config.id,requestId,command.type,changed.summary,now,revision);
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQLite foreign key validation failed during save');
    db.exec('COMMIT');
    return {snapshot:readSQLiteSnapshot(db,this.config.id),summary:changed.summary,replayed:false};
   }catch(e){db.exec('ROLLBACK');throw e}
  }finally{db.close()}
 }
}

import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {SQLiteStore} from '../src/server/sqlite-store';
import {backupSQLite} from '../src/server/sqlite-backup';
import {acquisitionReport} from '../src/server/acquisition-report';
import {readSQLiteSnapshot} from '../src/server/sqlite-read';
import {validDate,validProductURL,vendorKey} from '../src/core/acquisition';
import type {BuildConfig} from '../src/core/types';
import type {Purchasing} from '../src/core/purchasing';
const a=Object.fromEntries(process.argv.slice(2).reduce<string[][]>((r,v,i,all)=>{if(v.startsWith('--'))r.push([v.slice(2),all[i+1]]);return r},[]));
if(!a.database)throw Error('Usage: tsx scripts/validate-acquisition.ts --database new.db [--baseline old.db] [--reports existing-directory]');
const file=path.resolve(a.database),db=new DatabaseSync(file,{readOnly:true}),dir=await mkdtemp(path.join(tmpdir(),'builddesk-acquisition-'));
try{
 assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 if(a.baseline){const before=new DatabaseSync(path.resolve(a.baseline),{readOnly:true});try{for(const table of ['print_parts','model_files','plates','plate_assignments','plate_preparations','preparation_items','print_jobs','print_job_items','inspection_drafts','write_requests','build_revisions'])assert.deepEqual(db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),before.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),table+' differs from baseline');assert.deepEqual(db.prepare('SELECT build_id,audit_json,preparations_json FROM runtime_compatibility ORDER BY build_id').all(),before.prepare('SELECT build_id,audit_json,preparations_json FROM runtime_compatibility ORDER BY build_id').all());}finally{before.close()}}
 const copy=await backupSQLite(file,path.join(dir,'restored.db'));
 const results=[];
 for(const row of db.prepare('SELECT * FROM purchasing_archives ORDER BY build_id').all()){
  const id=String(row.build_id),raw=String(row.legacy_json),legacy=JSON.parse(raw) as Purchasing;
  assert.equal(createHash('sha256').update(raw).digest('hex'),row.source_sha256);
  const snapshot=readSQLiteSnapshot(db,id);assert.ok(snapshot.acquisition);assert.equal(snapshot.purchasing,undefined);assert.equal(snapshot.acquisition.parts.length,legacy.parts.length);
  if(a.baseline)for(const p of snapshot.acquisition.parts){const old=legacy.parts.find(x=>x.id===p.id)!;assert.ok(old);assert.equal(p.required,old.needed);assert.equal(p.onHand,old.onHand);assert.equal(p.description,old.name);assert.equal(p.specification,old.specification);assert.equal(p.ordered,false);assert.equal(vendorKey(p.vendor),vendorKey(old.supplier||''));assert.equal(p.url,old.link&&validProductURL(old.link)?old.link:'');assert.equal(p.orderedDate,validDate(old.orderedDate?.slice(0,10)||'')?old.orderedDate.slice(0,10):'');assert.equal(p.notes,(old.notes||'').replace(/[^\x20-\x7e\r\n\t]/g,'').slice(0,200));}
  const config={id,name:snapshot.build.name,active:true,store:{kind:'sqlite',path:copy,schema:'build-desk-v2'}} as BuildConfig;
  const store=new SQLiteStore(config,copy);const p=snapshot.acquisition.parts[0];
  if(p){const request=randomUUID(),fields={onHand:p.onHand,ordered:!p.ordered,vendor:p.vendor,url:p.url,alternateUrl:p.alternateUrl,orderedDate:p.orderedDate,notes:p.notes};const saved=await store.commit(snapshot.revision,request,{type:'save-acquisition',partId:p.id,fields},{});assert.equal(saved.snapshot.acquisition!.parts.find(x=>x.id===p.id)!.ordered,!p.ordered);assert.deepEqual(saved.snapshot.parts,snapshot.parts);assert.deepEqual(saved.snapshot.jobs,snapshot.jobs);assert.deepEqual(saved.snapshot.audit,snapshot.audit);assert.equal((await store.commit(snapshot.revision,request,{type:'save-acquisition',partId:p.id,fields},{})).replayed,true);await assert.rejects(store.commit(snapshot.revision,randomUUID(),{type:'save-acquisition',partId:p.id,fields},{}),/changed since/);const second=await backupSQLite(copy,path.join(dir,id+'-second.db'));assert.deepEqual((await new SQLiteStore(config,second).load()).acquisition,saved.snapshot.acquisition);}
  if(a.reports)for(const kind of ['source','status'] as const)await writeFile(path.join(a.reports,id+'-'+kind+'.pdf'),await acquisitionReport(snapshot.build,snapshot.acquisition,kind));
  results.push({id,parts:snapshot.acquisition.parts.length,archivedItems:legacy.items.length,archivedLedger:legacy.ledger.length,printParts:snapshot.parts.length,jobs:snapshot.jobs.length,accepted:snapshot.parts.reduce((n,p)=>n+p.accepted,0),revision:snapshot.revision});
 }
 console.log(JSON.stringify({passed:true,backupRestore:'passed',writes:'disposable copies only',results},null,2));
}finally{db.close();await rm(dir,{recursive:true,force:true})}

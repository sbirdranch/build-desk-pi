import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initializeSchema} from '../src/server/sqlite-schema.mjs';
import {createStore} from '../src/server/data-store';
import {backupSQLite} from '../src/server/sqlite-backup';
import {assertSnapshotsEqual} from '../src/server/sqlite-validation';
import type {BuildConfig,Command,Preparation} from '../src/core/types';

test('SQLite runtime: shared printer race, inspection, Purchasing, rollback and WAL backup restore',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'builddesk-runtime-')),file=join(dir,'live.db');
 try{
  const db=new DatabaseSync(file);initializeSchema(db);db.exec('PRAGMA journal_mode=WAL');
  for(const id of ['truck','loader']){
   db.prepare('INSERT INTO builds VALUES(?,?,?,?,?)').run(id,id,1,'shared','2026-01-01');
   db.prepare('INSERT INTO build_revisions VALUES(?,?,?)').run(id,0,'2026-01-01');
   db.prepare('INSERT INTO print_parts VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'p','Part','Cab','part.stl','PETG',3,0,0,'note');
   db.prepare('INSERT INTO model_files VALUES(?,?,?,?,?,?,?,?,?)').run(id,'f','File.3mf','v1','Standard','PETG','Cab','hash','2026-01-01');
   db.prepare('INSERT INTO plates VALUES(?,?,?,?,?,?,?)').run(id,'plate','f',1,'Plate','Cab','[]');
   db.prepare('INSERT INTO plate_assignments VALUES(?,?,?,?,?,?,?)').run(id,'m','plate','p',2,1,'');
   const purchasing={parts:[{id:'buy',category:'Hardware',name:'Screw',specification:'M3',requirement:'6',needed:6,onHand:0,onOrder:0,toSource:6,supplier:'Shop',orderedDate:'',receivedDate:'',notes:'preserve full notes',link:'https://example.com',packSize:null,status:'Sourcing'}],items:[],ledger:[]};
   db.prepare('INSERT INTO runtime_compatibility VALUES(?,?,?,?)').run(id,JSON.stringify(purchasing),'[]','{}');
  }
  const config=(id:string):BuildConfig=>({id,name:id,active:true,store:{kind:'sqlite',path:file,schema:'build-desk-v2'},assets:{root:'',catalog:''},models:{directory:''},printer:{id:'shared',name:'Printer'},workflow:{defaultProfile:'Standard',materials:['PETG'],maxPrintingJobs:1},modules:['printing','purchasing']});
  const truck=createStore(config('truck')),loader=createStore(config('loader'));
  const save=async(store:typeof truck,command:Command,hashes={})=>store.commit((await store.load()).revision,randomUUID(),command,hashes);
  const prep:Preparation={runs:1,material:'PETG',profile:'Standard',sourceHash:'hash',layoutConfirmed:false,items:[{mappingId:'m',included:true,copies:2,planned:2}],notes:'',savedAt:''};
  await save(truck,{type:'save-preparation',plateId:'plate',preparation:prep},{f:'hash'});
  await assert.rejects(save(truck,{type:'start',plateId:'plate'},{f:'hash'}),/confirmed/);
  prep.layoutConfirmed=true;
  for(const store of [truck,loader])await save(store,{type:'save-preparation',plateId:'plate',preparation:prep},{f:'hash'});
  const race=await Promise.allSettled([save(truck,{type:'start',plateId:'plate'},{f:'hash'}),save(loader,{type:'start',plateId:'plate'},{f:'hash'})]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
  const winner=(await truck.load()).jobs.length?truck:loader,loser=winner===truck?loader:truck;
  let s=await winner.load(),job=s.jobs[0];
  await save(winner,{type:'await-inspection',jobId:job.id});
  await save(winner,{type:'save-results',jobId:job.id,results:[{mappingId:'m',accepted:1,rejected:null}]});
  assert.equal((await winner.load()).parts[0].accepted,0);
  await assert.rejects(save(winner,{type:'cancel',jobId:job.id}),/Accepted parts/);
  s=await winner.load();const request=randomUUID(),finish:Command={type:'finish',jobId:job.id,results:[{mappingId:'m',accepted:1,rejected:1}]};
  const complete=await winner.commit(s.revision,request,finish,{});
  assert.equal(complete.snapshot.parts[0].accepted,1);
  assert.equal((await winner.commit(s.revision,request,finish,{})).replayed,true);
  await assert.rejects(winner.commit(s.revision,randomUUID(),finish,{}),/changed since/);
  await save(winner,{type:'purchasing',operation:{kind:'part',partId:'buy',needed:6,onHand:2,reason:'Counted stock'}});
  assert.equal((await winner.load()).purchasing?.parts[0].onHand,2);
  assert.equal((await loser.load()).purchasing?.parts[0].onHand,0);
  const before=await winner.load();
  db.exec("CREATE TRIGGER fail_commit BEFORE INSERT ON write_requests BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
  await assert.rejects(save(winner,{type:'update-part',partId:'p',required:9,installed:0,notes:'must roll back'}),/injected failure/);
  assertSnapshotsEqual(before,await winner.load());db.exec('DROP TRIGGER fail_commit');
  const restoredFile=await backupSQLite(file,join(dir,'restore.db'));
  const restored=createStore({...config(before.build.id),store:{kind:'sqlite',path:restoredFile,schema:'build-desk-v2'}});
  assertSnapshotsEqual(before,await restored.load());
  await save(restored,{type:'update-part',partId:'p',required:10,installed:0,notes:'restored writer'});
  assert.equal((await restored.load()).parts[0].required,10);
  assertSnapshotsEqual(before,await winner.load());
  await assert.rejects(backupSQLite(file,restoredFile),/EEXIST/);
  assert.ok((await readdir(join(dir,'backups'))).length>0);
  db.close();
 }finally{await rm(dir,{recursive:true,force:true})}
});

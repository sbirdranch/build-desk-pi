import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initializeSchema} from '../src/server/sqlite-schema.mjs';
import {SQLiteStore} from '../src/server/sqlite-store';
import {assemblyProgress,manual} from '../src/core/assembly';
import type {BuildConfig,Command} from '../src/core/types';

test('manual index includes 98 ordered steps, shared pages, 89b and reference drawings',()=>{
 assert.equal(manual.steps.length,98);
 assert.equal(new Set(manual.steps.map(s=>s.id)).size,98);
 assert.deepEqual(manual.steps.slice(0,2).map(s=>s.page),[2,2]);
 assert.equal(manual.steps.find(s=>s.id==='step-89b')?.page,77);
 assert.deepEqual([1,2,3,4,5].map(p=>assemblyProgress([],p).total),[24,43,12,9,10]);
 assert.equal(assemblyProgress([]).percent,0);
 assert.equal(assemblyProgress(manual.steps.map(s=>({id:s.id,completed:true,notes:'',updatedAt:'',completedAt:''}))).percent,100);
});

test('assembly persists per build, reopens, replays, conflicts, validates, rolls back and preserves production',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'builddesk-assembly-')),file=join(dir,'test.db');
 const db=new DatabaseSync(file);initializeSchema(db);
 try{
  for(const id of ['truck','truck-2']){
   db.prepare('INSERT INTO builds VALUES(?,?,?,?,?)').run(id,id,1,'printer','today');
   db.prepare('INSERT INTO build_revisions VALUES(?,?,?)').run(id,0,'today');
   db.prepare('INSERT INTO print_parts VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'p','Part','Cab','part.stl','PETG',3,2,1,'preserve');
   db.prepare("INSERT INTO purchase_parts(build_id,id,description,on_hand_qty,notes) VALUES(?, 'purchase','Screw',9,'preserve')").run(id);
  }
  const config:BuildConfig={id:'truck',name:'Truck',active:true,store:{kind:'sqlite',path:file,schema:'build-desk-v2'},assets:{root:'',catalog:''},models:{directory:''},workflow:{defaultProfile:'',materials:[],maxPrintingJobs:1},modules:['assembly'],assembly:{manual:manual.id,pdf:''}};
  const store=new SQLiteStore(config,file),other=new SQLiteStore({...config,id:'truck-2'},file);
  const before=await store.load(),request=randomUUID();
  const command:Command={type:'save-assembly',stepId:'step-89b',completed:true,notes:'Align hinge before tightening. 🔧'};
  const result=await store.commit(before.revision,request,command,{});
  assert.deepEqual(result.snapshot.parts,before.parts);
  assert.deepEqual({...db.prepare('SELECT on_hand_qty,notes FROM purchase_parts WHERE build_id=?').get('truck')},{on_hand_qty:9,notes:'preserve'});
  assert.equal(result.snapshot.assembly?.[0].completed,true);
  assert.equal(result.snapshot.audit.at(-1)?.action,'save-assembly');
  assert.equal((await store.commit(before.revision,request,command,{})).replayed,true);
  assert.equal((await other.load()).assembly,undefined);
  await assert.rejects(store.commit(before.revision,randomUUID(),command,{}),/changed since/);
  const reopened=new SQLiteStore(config,file);let state=await reopened.load();
  assert.equal(state.assembly?.[0].notes,command.notes);
  assert.ok(state.assembly?.[0].completedAt);
  for(const invalid of [{...command,stepId:'step-999'},{...command,notes:'x'.repeat(4001)},{...command,completed:'yes'}])await assert.rejects(reopened.commit(state.revision,randomUUID(),invalid as Command,{}));
  await assert.rejects(new SQLiteStore({...config,active:false},file).commit(state.revision,randomUUID(),command,{}),/read-only/);
  await assert.rejects(new SQLiteStore({...config,assembly:undefined},file).commit(state.revision,randomUUID(),command,{}),/unavailable/);
  db.exec("CREATE TRIGGER fail_assembly BEFORE INSERT ON write_requests BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
  await assert.rejects(reopened.commit(state.revision,randomUUID(),{...command,completed:false},{}),/injected failure/);
  assert.deepEqual(await reopened.load(),state);db.exec('DROP TRIGGER fail_assembly');
  state=(await reopened.commit(state.revision,randomUUID(),{...command,completed:false},{})).snapshot;
  assert.equal(state.assembly?.[0].completedAt,'');assert.equal(state.assembly?.[0].notes,command.notes);
  state=(await reopened.commit(state.revision,randomUUID(),{type:'update-part',partId:'p',required:3,installed:1,notes:'printing edit'},{})).snapshot;
  assert.equal(state.assembly?.[0].notes,command.notes);
 }finally{db.close();await rm(dir,{recursive:true,force:true})}
});

test('schema 5 migration adds assembly without altering existing rows',()=>{
 const db=new DatabaseSync(':memory:');initializeSchema(db);
 try{
  db.exec("DROP TABLE assembly_steps; DELETE FROM schema_migrations; INSERT INTO schema_migrations VALUES(5,'previous','today'); INSERT INTO builds VALUES('truck','Truck',1,'p','today'); INSERT INTO build_revisions VALUES('truck',42,'today')");
  const before=db.prepare('SELECT * FROM build_revisions').all();
  initializeSchema(db);initializeSchema(db);
  assert.deepEqual(db.prepare('SELECT * FROM build_revisions').all(),before);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM assembly_steps').get()?.n,0);
  assert.equal(db.prepare('SELECT MAX(version) v FROM schema_migrations').get()?.v,6);
 }finally{db.close()}
});

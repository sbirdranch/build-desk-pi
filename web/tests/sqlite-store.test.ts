import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {initializeSchema} from '../src/server/sqlite-schema.mjs';
import {SQLiteStore} from '../src/server/sqlite-store';
import type {BuildConfig} from '../src/core/types';

test('SQLite Printing store commits atomically, replays requests and isolates builds',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'builddesk-store-')),file=join(dir,'store.db');
 try{
  const db=new DatabaseSync(file);initializeSchema(db);
  for(const id of ['kitten-old','kitten-new']){
   db.prepare('INSERT INTO builds(id,name,active,printer_id,created_at) VALUES(?,?,?,?,?)').run(id,id,1,'shared-h2d','2026-11-03');
   db.prepare('INSERT INTO build_revisions(build_id,revision,updated_at) VALUES(?,?,?)').run(id,0,'2026-11-03');
   db.prepare('INSERT INTO print_parts(build_id,id,name,section,source,material,required_qty,opening_qty,installed_qty,notes) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id,'same-id','Part','Cabin','part.stl','PETG',6,2,0,'original');
  }
  db.close();
  const config=(id:string):BuildConfig=>({id,name:id,active:true,store:{kind:'excel',path:'not-used',schema:'master-tracker-v1'},
   assets:{root:'',catalog:''},models:{directory:''},workflow:{defaultProfile:'',materials:['PETG'],maxPrintingJobs:1},modules:['printing']});
  const old=new SQLiteStore(config('kitten-old'),file),fresh=new SQLiteStore(config('kitten-new'),file);
  const initial=await old.load();
  assert.equal(initial.revision,'0');
  assert.equal(initial.parts[0].accepted,2);
  const command={type:'update-part' as const,partId:'same-id',required:8,installed:1,notes:'updated'};
  const result=await old.commit('0','test-request-0001',command,{});
  assert.equal(result.replayed,false);
  assert.equal(result.snapshot.parts[0].required,8);
  assert.equal(result.snapshot.revision,'1');
  const replay=await old.commit('0','test-request-0001',command,{});
  assert.equal(replay.replayed,true);
  assert.equal(replay.snapshot.revision,'1');
  await assert.rejects(old.commit('0','test-request-0002',command,{}),/changed since/);
  const untouched=await fresh.load();
  assert.equal(untouched.parts[0].required,6);
  assert.equal(untouched.parts[0].notes,'original');
  assert.equal(untouched.revision,'0');
  await assert.rejects(old.commit('1','test-request-0003',{type:'update-part',partId:'same-id',required:-1,installed:0,notes:'invalid'},{}),/nonnegative/);
  assert.equal((await old.load()).revision,'1');
  const verify=new DatabaseSync(file);try{assert.deepEqual(verify.prepare('PRAGMA foreign_key_check').all(),[])}finally{verify.close()}
 }finally{await rm(dir,{recursive:true,force:true})}
});

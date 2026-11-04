import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initializeSchema} from '../src/server/sqlite-schema.mjs';
import {SQLiteStore} from '../src/server/sqlite-store';
import {applyCommand} from '../src/core/domain';
import {buildProgress} from '../src/core/progress';
import type {BuildConfig} from '../src/core/types';

test('fabricated components persist independently, never become print/purchase records, and survive printed edits',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'builddesk-fabrication-')),file=path.join(directory,'data.db');
 try{
  const db=new DatabaseSync(file);initializeSchema(db);
  for(const id of ['truck','loader']){
   db.prepare('INSERT INTO builds VALUES(?,?,?,?,?)').run(id,id,1,'h2d-main','2026-11-04');
   db.prepare('INSERT INTO build_revisions VALUES(?,?,?)').run(id,0,'2026-11-04');
   for(const part of ['metal','printed'])db.prepare('INSERT INTO print_parts VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,part,part,'Parts',part+'.stl',part==='metal'?'Steel 3mm':'PETG',2,0,0,'');
   db.prepare('INSERT INTO fabrication_parts VALUES(?,?,?,?)').run(id,'metal',0,'Unspecified');
   db.prepare('INSERT INTO model_files VALUES(?,?,?,?,?,?,?,?,?)').run(id,'file','test.3mf','v1','profile','PETG','Parts','hash','');
   db.prepare('INSERT INTO plates VALUES(?,?,?,?,?,?,?)').run(id,'plate','file',1,'Plate 1','Parts','[]');
  }
  assert.throws(()=>db.prepare('INSERT INTO plate_assignments VALUES(?,?,?,?,?,?,?)').run('loader','bad','plate','metal',1,1,''),/Fabricated parts/);
  db.close();
  const config=(id:string):BuildConfig=>({id,name:id,active:true,store:{kind:'sqlite',path:file,schema:'build-desk-v2'},assets:{root:'',catalog:''},models:{directory:''},printer:{id:'h2d-main',name:'H2D'},workflow:{defaultProfile:'profile',materials:['PETG'],maxPrintingJobs:1},modules:['printing','purchasing']});
  const loader=new SQLiteStore(config('loader'),file),truck=new SQLiteStore(config('truck'),file),original=await truck.load();
  const initial=await loader.load(),purchases=initial.purchasing;
  const command={type:'update-fabrication' as const,partId:'metal',required:2,installed:1,notes:'Fabricated from designer drawing',fabrication:{completed:2,method:'Outsourced' as const}};
  const saved=await loader.commit('0','fabrication-request-1',command,{});
  assert.equal(saved.snapshot.parts.find(p=>p.id==='metal')?.accepted,2);
  assert.equal(buildProgress(saved.snapshot).parts.complete,1);
  assert.equal(saved.snapshot.jobs.length,0);assert.deepEqual(saved.snapshot.purchasing,purchases);
  assert.deepEqual(await truck.load(),original);
  assert.equal((await loader.commit('0','fabrication-request-1',command,{})).replayed,true);
  await assert.rejects(loader.commit('1','fabrication-request-2',{...command,installed:3},{}),/Installed count/);
  await assert.rejects(loader.commit('1','fabrication-request-3',{...command,partId:'printed'},{}),/Fabricated part not found/);
  assert.throws(()=>applyCommand(saved.snapshot,{type:'reconcile-file',fileId:'file',sourceHash:'hash',plates:[{number:1,name:'Plate 1',assignments:[{partId:'metal',copies:1}],unmapped:[]}]},config('loader'),{file:'hash'}),/Only printed parts/);
  const after=await loader.commit('1','fabrication-request-4',{type:'update-part',partId:'printed',required:3,installed:0,notes:'Printed part only'},{});
  assert.deepEqual(after.snapshot.parts.find(p=>p.id==='metal'),saved.snapshot.parts.find(p=>p.id==='metal'));
  assert.equal((await new SQLiteStore(config('loader'),file).load()).parts.find(p=>p.id==='metal')?.fabrication?.method,'Outsourced');
  assert.deepEqual(await truck.load(),original);
 }finally{await rm(directory,{recursive:true,force:true})}
});

import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {SQLiteStore} from '../src/server/sqlite-store';
import {backupSQLite} from '../src/server/sqlite-backup';
import {assertSnapshotsEqual} from '../src/server/sqlite-validation';
import type {BuildConfig,Snapshot} from '../src/core/types';
const args=Object.fromEntries(process.argv.slice(2).reduce<string[][]>((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]]);return a},[]));
if(!args.database||!args.registry)throw Error('Usage: tsx scripts/validate-sqlite.ts --database <migrated.db> --registry <registry.json>');
const configs=JSON.parse(await readFile(args.registry,'utf8')).builds as BuildConfig[];
const file=path.resolve(args.database),dir=await mkdtemp(path.join(tmpdir(),'builddesk-acceptance-'));
try{
 const db=new DatabaseSync(file,{readOnly:true});
 const ids=db.prepare('SELECT id FROM builds ORDER BY id').all().map(x=>String(x.id));
 assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 const sources=new Map(ids.map(id=>[id,JSON.parse(String(db.prepare('SELECT source_snapshot_json FROM migration_sources WHERE build_id=?').get(id)?.source_snapshot_json)) as Snapshot]));
 db.close();
 const restored=await backupSQLite(file,path.join(dir,'restored.db'));
 const results=[];
 for(const id of ids){
  const config=configs.find(c=>c.id===id);assert.ok(config,'Registry build missing: '+id);
  const store=new SQLiteStore(config,file),copy=new SQLiteStore(config,restored);
  const before=await store.load();assertSnapshotsEqual(sources.get(id)!,before);
  assertSnapshotsEqual(before,await copy.load());
  assert.equal(before.revision,'0','Acceptance must precede production writes');
  const part=before.parts[0];assert.ok(part);
  const command={type:'update-part' as const,partId:part.id,required:part.required,installed:part.installed,notes:part.notes};
  const request=randomUUID();const saved=await copy.commit('0',request,command,{});
  assert.equal(saved.snapshot.revision,'1');assert.equal((await copy.commit('0',request,command,{})).replayed,true);
  await assert.rejects(copy.commit('0',randomUUID(),command,{}),/changed since/);
  const second=await backupSQLite(restored,path.join(dir,id+'-second.db'));
  assertSnapshotsEqual(await copy.load(),await new SQLiteStore(config,second).load());
  assertSnapshotsEqual(before,await store.load());
  results.push({buildId:id,parts:before.parts.length,jobs:before.jobs.length,accepted:before.parts.reduce((n,p)=>n+p.accepted,0),installed:before.parts.reduce((n,p)=>n+p.installed,0),purchasingParts:before.purchasing?.parts.length,purchasingItems:before.purchasing?.items.length,audit:before.audit.length});
 }
 console.log(JSON.stringify({passed:true,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),backupRestore:'passed; writes confined to disposable restored database',results},null,2));
}finally{await rm(dir,{recursive:true,force:true})}

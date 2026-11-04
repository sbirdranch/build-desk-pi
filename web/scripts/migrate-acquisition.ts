import {DatabaseSync} from 'node:sqlite';
import {writeFile} from 'node:fs/promises';
import {backupSQLite} from '../src/server/sqlite-backup';
import {initializeSchema} from '../src/server/sqlite-schema.mjs';
import {activateAcquisition} from '../src/server/acquisition-migration';
import {readSQLiteSnapshot} from '../src/server/sqlite-read';
import assert from 'node:assert/strict';
const args=Object.fromEntries(process.argv.slice(2).reduce<string[][]>((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]]);return a},[]));
if(!args.source||!args.output)throw Error('Usage: tsx scripts/migrate-acquisition.ts --source <old.db> --output <new.db>');
await backupSQLite(args.source,args.output);
const db=new DatabaseSync(args.output);
try{
 // Capture protected SQL tables without relying on the future reader or business projection.
 const tables=['print_parts','model_files','plates','plate_assignments','plate_preparations','preparation_items','print_jobs','print_job_items','inspection_drafts','write_requests','build_revisions'];
 const protectedData=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
 initializeSchema(db);db.exec('BEGIN IMMEDIATE');
 try{
  const reports=activateAcquisition(db);
  for(const t of tables)assert.deepEqual(db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all(),protectedData[t],t+' changed');
  for(const r of reports){const snapshot=readSQLiteSnapshot(db,r.buildId);assert.equal(snapshot.acquisition?.parts.length,r.parts);assert.equal(snapshot.purchasing,undefined);}
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
  db.exec('COMMIT');
  await writeFile(args.output+'.acquisition-report.json',JSON.stringify({passed:true,protectedTables:tables,reports},null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({passed:true,output:args.output,reports},null,2));
 }catch(e){db.exec('ROLLBACK');throw e}
}finally{db.close()}

// Offline schema-3 -> schema-4 migration into a new consistent database copy.
import {DatabaseSync} from 'node:sqlite';
import {backupSQLite} from '../src/server/sqlite-backup';
import {initializeSchema} from '../src/server/sqlite-schema.mjs';
import assert from 'node:assert/strict';
const args=Object.fromEntries(process.argv.slice(2).reduce<string[][]>((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]]);return a},[]));
if(!args.source||!args.output)throw Error('Usage: tsx scripts/migrate-fabrication.ts --source old.db --output new.db');
await backupSQLite(args.source,args.output);
const db=new DatabaseSync(args.output);
try{
 assert.equal(db.prepare('SELECT MAX(version) version FROM schema_migrations').get()?.version,3);
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>String(r.name));
 const before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM "'+t+'" ORDER BY rowid').all()]));
 initializeSchema(db);
 for(const t of tables){const after=db.prepare('SELECT * FROM "'+t+'" ORDER BY rowid').all();assert.deepEqual(t==='schema_migrations'?after.slice(0,before[t].length):after,before[t],t+' changed');}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM fabrication_parts').get()?.n,0);
 assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log(JSON.stringify({passed:true,output:args.output,protectedTables:tables.length,schema:4,existingDataUnchanged:true}));
}finally{db.close()}

// Explicit offline schema upgrade. Stop the service first; a consistent backup is required.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {initializeSchema} from '../web/src/server/sqlite-schema.mjs';
const file=process.argv[2];
if(!file||!existsSync(file))throw Error('Usage: node tools/migrate-assembly.mjs <existing-database> (stop Build Desk first)');
const db=new DatabaseSync(file);
try{
 const backup=path.resolve(file)+'.before-assembly-'+Date.now()+'.db';
 db.prepare('VACUUM INTO ?').run(backup);
 initializeSchema(db);
 console.log('Assembly schema ready. Backup: '+backup);
}finally{db.close()}

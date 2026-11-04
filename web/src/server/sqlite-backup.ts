import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function backupSQLite(source:string,destination?:string){
 const directory=path.join(path.dirname(source),'backups');
 const target=destination||path.join(directory,new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()+'.db');
 await mkdir(path.dirname(target),{recursive:true});
 const reservation=await open(target,'wx',0o600);await reservation.close();
 const db=new DatabaseSync(source,{readOnly:true});
 try {
  await backup(db,target);
  const check=new DatabaseSync(target,{readOnly:true});
  try{if(check.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||check.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup verification failed');}finally{check.close()}
  return target;
 }catch(e){await unlink(target).catch(()=>{});throw e}finally{db.close()}
}

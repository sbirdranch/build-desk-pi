import {open,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import type {BuildConfig} from '../core/types';
import {createStore} from './data-store';
import {DomainError} from '../core/domain';
import {root} from './registry';
export async function withPrinterSlot<T>(config:BuildConfig,registry:BuildConfig[],action:()=>Promise<T>):Promise<T>{
 const id=config.printer?.id||'build-'+config.id;if(!/^[A-Za-z0-9_-]+$/.test(id))throw new DomainError('Invalid printer identifier.');
 const directory=path.join(root,'local-data/printer-locks');await mkdir(directory,{recursive:true});const file=path.join(directory,id+'.lock');let lock;
 try{lock=await open(file,'wx')}catch{throw new DomainError('Another print is starting on this printer. Retry after it finishes.',409)}
 try{for(const other of registry){if(other.id===config.id||(other.printer?.id||'build-'+other.id)!==id)continue;const snapshot=await createStore(other).load();if(snapshot.jobs.some(j=>j.status==='Printing'))throw new DomainError('This printer already has a tracked print in '+other.name+'.',409);}return await action();}finally{await lock.close();await unlink(file).catch(()=>{})}
}

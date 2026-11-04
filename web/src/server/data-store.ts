import path from 'node:path';
import type {BuildConfig} from '../core/types';
import {DomainError} from '../core/domain';
import {ExcelStore,type DataStore} from './excel-store';
import {SQLiteStore} from './sqlite-store';
import {root} from './registry';
export function createStore(config:BuildConfig):DataStore {
 if(config.store.kind==='excel'&&config.store.schema==='master-tracker-v1')return new ExcelStore(config);
 if(config.store.kind==='sqlite'&&config.store.schema==='build-desk-v2')return new SQLiteStore(config,path.resolve(root,config.store.path));
 throw new DomainError('No compatible data-store adapter is registered for this build.');
}

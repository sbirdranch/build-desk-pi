import test from 'node:test';
import assert from 'node:assert/strict';
import {modelAccessError,openBambu} from '../src/server/assets';
import type {BuildConfig,Snapshot} from '../src/core/types';
test('model permission failures explain the Windows account remedy',()=>{
 for(const code of ['EPERM','EACCES']){const error=modelAccessError({code},'model.3mf');assert.equal(error.status,503);assert.match(error.message,/permission/);assert.match(error.message,/normal Windows account/);assert.match(error.message,/model.3mf/);}
 assert.equal(modelAccessError({code:'ENOENT'},'missing.3mf').status,404);
});
test('Open in Bambu identifies a missing model separately from workbook failure',async()=>{
 const config={models:{directory:process.cwd()+'/test-output/nonexistent-model-location'}} as BuildConfig;
 const snapshot={files:[{id:'model',filename:'missing.3mf'}]} as Snapshot;
 await assert.rejects(()=>openBambu(config,snapshot,'model'),/Model file not found:.*missing.3mf/);
});

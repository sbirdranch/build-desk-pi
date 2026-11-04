import test from 'node:test';
import assert from 'node:assert/strict';
import {modelAccessError} from '../src/server/assets';
test('model access failures identify host permissions and missing NAS files',()=>{
 for(const code of ['EPERM','EACCES']){const error=modelAccessError({code},'model.3mf');assert.equal(error.status,503);assert.match(error.message,/permission/);assert.match(error.message,/service account/);assert.match(error.message,/model.3mf/);}
 assert.equal(modelAccessError({code:'ENOENT'},'missing.3mf').status,404);
});

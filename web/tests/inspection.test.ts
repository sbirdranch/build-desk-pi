import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectionResults,updateInspection} from '../src/core/inspection';
import type {Job} from '../src/core/types';
const job:Job={id:'job',kind:'plate',status:'Printing',startedAt:'',finishedAt:'',items:['a','b','c'].map(mappingId=>({mappingId,partId:mappingId,fileId:'f',fileRevision:'',filename:'',plateNumber:1,plateName:'',runs:1,planned:2,accepted:null,rejected:null,profile:'',material:'',notes:''}))};
test('reopening the same inspection initializes separate zero counts for every row',()=>{
 assert.deepEqual(inspectionResults(job),['a','b','c'].map(mappingId=>({mappingId,accepted:0,rejected:0})));
 for(const field of ['accepted','rejected'] as const){const rows=updateInspection(job,[],'b',field,1);assert.equal(rows[1][field],1);assert.equal(rows[0][field],0);assert.equal(rows[2][field],0);assert.equal(rows.length,3);}
});
test('inspection restores saved rows by identity and preserves other counts while editing',()=>{
 const saved={...job,draft:[{mappingId:'b',accepted:1,rejected:1},{mappingId:'a',accepted:2,rejected:null}]};
 const rows=inspectionResults(saved);assert.deepEqual(rows.map(r=>r.accepted),[2,1,0]);
 const edited=updateInspection(saved,rows,'c','rejected',2);assert.deepEqual(edited.slice(0,2),rows.slice(0,2));assert.equal(edited[2].rejected,2);
 assert.deepEqual(updateInspection(saved,edited,'c','rejected',null)[2],{mappingId:'c',accepted:0,rejected:0});
});

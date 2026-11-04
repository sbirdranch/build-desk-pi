import test from 'node:test';
import assert from 'node:assert/strict';
import {acquisitionReport} from '../src/server/acquisition-report';
import type {Acquisition} from '../src/core/acquisition';
test('reports paginate maximum-length source fields without clipping or dropping a valid URL',async()=>{
 const data:Acquisition={vendors:[],parts:[{id:'LONG-1',category:'Hardware',description:'W'.repeat(2000),specification:'',requirement:'',required:1,onHand:0,ordered:true,vendor:'Vendor',url:'https://example.com/'+('W'.repeat(1970)),orderedDate:'2026-11-04',notes:''}]};
 const before=JSON.stringify(data);
 for(const kind of ['source','status'] as const){const pdf=await acquisitionReport({id:'long',name:'Long source data'},data,kind);assert.equal(pdf.subarray(0,4).toString(),'%PDF');const pages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;assert.ok(pages>1&&pages<15,'Long rows need bounded continuation pages');}
 assert.equal(JSON.stringify(data),before,'Report generation must not mutate acquisition records');
});

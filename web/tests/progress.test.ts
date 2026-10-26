import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProgress} from '../src/core/progress';
import {completionState} from '../src/core/completion';
import type {Snapshot} from '../src/core/types';
const fixture=():Snapshot=>({build:{id:'b',name:'Build'},revision:'1',recordedAt:'',audit:[],parts:[null,0,1,2,3].map((required,i)=>({id:String(i),name:String(i),section:'Cabin',source:'',material:'',required,opening:0,accepted:i===3?1:2,installed:0,notes:''})),files:[{id:'f',filename:'f.3mf',revision:'1',profile:'',material:'',section:'Cabin'},{id:'empty',filename:'empty.3mf',revision:'1',profile:'',material:'',section:'Empty'}],plates:[1,2].map(number=>({id:'p'+number,fileId:'f',number,name:'P'+number,section:'Cabin',assignments:[{id:'m'+number,partId:String(number),copies:1,confirmed:true}]})),jobs:[]} as Snapshot);
test('Parts count completed types rather than accepted units; unknown quantities stay incomplete',()=>{assert.deepEqual(buildProgress(fixture()).parts,{complete:2,total:5,percent:40});});
test('Plates and files follow accepted parts even without print runs; sections include every section part',()=>{
 const s=fixture(),p=buildProgress(s);
 assert.deepEqual(p.plates,{complete:2,total:2,percent:100});
 assert.deepEqual(p.files,{complete:1,total:2,percent:50});
 assert.equal(p.categories.complete,0);
 s.parts.forEach(part=>{part.required=1;part.accepted=1});
 assert.equal(buildProgress(s).categories.complete,1);
});
test('Unknown quantities, incomplete parts, unmatched objects and empty mappings block completion',()=>{
 const s=fixture();s.plates[0].unmappedObjects=['unmatched'];s.plates[1].assignments[0].partId='0';
 assert.equal(buildProgress(s).plates.complete,0);assert.equal(buildProgress(s).files.complete,0);
 s.parts.forEach(p=>{p.required=1;p.accepted=1});
 assert.equal(buildProgress(s).categories.complete,0);
 s.plates[0].unmappedObjects=[];s.plates[1].assignments=[];
 assert.equal(buildProgress(s).plates.complete,1);
 assert.equal(buildProgress(s).plates.complete,s.plates.filter(p=>completionState(p.assignments.map(a=>s.parts.find(part=>part.id===a.partId)!),!!p.unmappedObjects?.length)==='complete').length);
});
test('Empty builds have zero progress without invalid percentages',()=>{const s=fixture();s.parts=[];s.plates=[];s.files=[];for(const metric of Object.values(buildProgress(s)).slice(0,4))assert.deepEqual(metric,{complete:0,total:0,percent:0});});

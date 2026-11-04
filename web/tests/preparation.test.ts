import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand} from '../src/core/domain';
import {preparationIssue} from '../src/core/preparation';
import type {Snapshot,Preparation,BuildConfig} from '../src/core/types';
const config={id:'test',active:true,workflow:{materials:['PETG','TPU'],maxPrintingJobs:1}} as BuildConfig;
function fixture():Snapshot{return {build:{id:'test',name:'Test'},revision:'0',recordedAt:'',parts:[{id:'part',name:'Part',section:'Cab',source:'part.stl',material:'PETG',required:5,opening:0,accepted:0,installed:0,notes:''}],files:[{id:'file',filename:'file.3mf',revision:'v1',material:'PETG',profile:'Standard',section:'Cab',sourceHash:'current'}],plates:[{id:'plate',fileId:'file',number:1,name:'Plate',section:'Cab',assignments:[{id:'map',partId:'part',copies:null,confirmed:false,note:'Split STL components'}]}],jobs:[],audit:[]};}
const prep=():Preparation=>({runs:1,material:'PETG',profile:'Standard',sourceHash:'current',items:[{mappingId:'map',included:true,copies:2,planned:2}],notes:'Manual complete-unit quantities',savedAt:''});
test('valid preparation saves and starts without attestation; historical false flag has no gate or output field',()=>{
 const before=fixture();const command={type:'save-preparation' as const,plateId:'plate',preparation:{...prep(),layoutConfirmed:false}};
 const saved=applyCommand(before,command,config,{file:'current'}).state;
 assert.equal('layoutConfirmed' in saved.plates[0].preparation!,false);
 assert.equal(saved.parts[0].accepted,0);assert.equal(before.plates[0].preparation,undefined);
 const started=applyCommand(saved,{type:'start',plateId:'plate'},config,{file:'current'}).state;
 assert.equal(started.jobs[0].status,'Printing');assert.equal(started.jobs[0].items[0].planned,2);assert.equal(started.parts[0].accepted,0);
 const finished=applyCommand(started,{type:'finish',jobId:started.jobs[0].id,results:[{mappingId:'map',accepted:1,rejected:1}]},config,{}).state;
 assert.equal(finished.parts[0].accepted,1);assert.equal(finished.jobs[0].items[0].filename,'file.3mf');
});
test('Save and Start independently validate substantive preparation data, even with a forged true flag',()=>{
 const invalid=[{runs:101},{runs:1.5},{material:'TPU'},{profile:' '},{sourceHash:'old'},{items:[]},{items:[{mappingId:'other',included:true,copies:2,planned:2}]},{items:[{mappingId:'map',included:true,copies:null,planned:2}]},{items:[{mappingId:'map',included:true,copies:2,planned:0}]},{items:[{mappingId:'map',included:true,copies:-1,planned:2}]}];
 for(const change of invalid){const s=fixture(),bad={...prep(),...change,layoutConfirmed:true};assert.throws(()=>applyCommand(s,{type:'save-preparation',plateId:'plate',preparation:bad},config,{file:'current'}));s.plates[0].preparation=bad;assert.throws(()=>applyCommand(s,{type:'start',plateId:'plate'},config,{file:'current'}));assert.equal(s.jobs.length,0);}
 const s=fixture();s.plates[0].preparation=prep();s.plates[0].unmappedObjects=['unknown.stl'];assert.throws(()=>applyCommand(s,{type:'start',plateId:'plate'},config,{file:'current'}),/unknown/);
 s.plates[0].unmappedObjects=[];s.plates[0].preparation.items[0].included=false;assert.throws(()=>applyCommand(s,{type:'start',plateId:'plate'},config,{file:'current'}),/Include/);
 s.plates[0].preparation=prep();assert.throws(()=>applyCommand(s,{type:'start',plateId:'plate'},config,{file:'changed'}),/stale/);
 s.plates[0].preparation.sourceHash='changed';assert.throws(()=>applyCommand(s,{type:'start',plateId:'plate'},config,{file:'changed'}),/Reload Print Details/);
});

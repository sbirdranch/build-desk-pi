import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {inspectMembership} from '../src/server/reconcile';
import type {Snapshot,Part} from '../src/core/types';

test('duplicate bucket basenames match exact saved source paths, never fabricated geometry',async()=>{
 const make=(id:string,source:string):Part=>({id,name:'rockguard',source,section:id,material:'PETG',required:null,opening:0,accepted:0,installed:0,notes:''});
 const snapshot:Snapshot={build:{id:'loader',name:'Loader'},revision:'0',recordedAt:'',parts:[make('knife','STL\\Buckets\\Knife\\rockguard.stl'),make('teeth','STL\\Buckets\\Teeth\\rockguard.stl'),{...make('metal','metal\\rockguard.stl'),fabrication:{completed:0,method:'Unspecified'}}],files:[],plates:[],jobs:[],audit:[]};
 async function inspect(source:string){
  const zip=new JSZip();
  zip.file('Metadata/model_settings.config',`<config><object id="1"><metadata key="name" value="rockguard.stl"/><part><metadata key="source_file" value="${source}"/></part></object><plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate></config>`);
  zip.file('3D/3dmodel.model','<model><build><item objectid="1" printable="1"/></build></model>');
  return (await inspectMembership(await zip.generateAsync({type:'nodebuffer'}),snapshot,'file')).plates[0];
 }
 assert.deepEqual((await inspect('X:\\Models\\STL\\Buckets\\Teeth\\rockguard.stl')).assignments,[{partId:'teeth',copies:1,split:false}]);
 assert.deepEqual((await inspect('rockguard.stl')).unmapped,['rockguard.stl']);
 assert.deepEqual((await inspect('X:\\Models\\metal\\rockguard.stl')).unmapped,['rockguard.stl']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {existsSync} from 'node:fs';
import JSZip from 'jszip';
import {ExcelStore} from '../src/server/excel-store';
import {applyCommand} from '../src/core/domain';
import {requireEditor} from '../src/server/security';
import {withPrinterSlot} from '../src/server/printer-slot';
import {assetFile,refreshFile} from '../src/server/assets';
import {inspectMembership,refreshTrackedFile} from '../src/server/reconcile';
import type {BuildConfig,Preparation} from '../src/core/types';
const testRoot=path.resolve('test-output');
async function fixture(id='test-build'){
 const dir=path.join(testRoot,randomUUID());await mkdir(dir,{recursive:true});const filename=path.join(dir,'Master.xlsx');
 const wb=new ExcelJS.Workbook();const p=wb.addWorksheet('Printed Parts Checklist');p.addRow(['ID','Section','Part','STL','Material','Required','Opening','Jobs','Total','Remaining','Files','Plates','Review','Link','Locations','Status','Installed','Notes']);p.addRow(['part-one','Front','Panel','Front/Panel.stl','PETG',3,0,0,0,3,'','','','','','',0,'Keep notes']);p.addRow(['part-two','Rear','Bracket','Rear/Bracket.stl','PETG',2,0,0,0,2,'','','','','','',0,'']);
 const f=wb.addWorksheet('3MF Project Register');f.addRow(['ID','Filename','Path','Revision','Material','Profile','Override','Status']);f.addRow(['file-one','Front.3mf','','v1','PETG','Standard','','Active']);f.addRow(['file-two','Rear.3mf','','v1','PETG','Standard','','Active']);
 const m=wb.addWorksheet('Part-to-Plate Mapping');m.addRow(['ID','Part ID','File ID','Number','Name','Copies','Review']);m.addRow(['map-one','part-one','file-one',1,'Front plate',2,'Confirmed']);m.addRow(['map-two','part-two','file-two',1,'Rear plate',1,'Confirmed']);
 wb.addWorksheet('Print Job History').addRow(['Job','Date','Part','Mapping','File','Revision','Plate','Runs','Planned','Accepted','Rejected','Status','Profile','Material','Notes','Check','Filename','Number','Started','Finished']);
 const unrelated=wb.addWorksheet('Purchasing');unrelated.getCell('A1').value='Do not modify';unrelated.getCell('B2').value={formula:'1+2',result:3};unrelated.getCell('A1').note='Keep this comment';
 await wb.xlsx.writeFile(filename);
 const config:BuildConfig={id,name:id,active:true,store:{kind:'excel',path:filename,schema:'master-tracker-v1'},assets:{root:dir,catalog:'catalog.json'},models:{directory:dir},workflow:{defaultProfile:'Standard',materials:['PETG'],maxPrintingJobs:1},modules:['printing']};
 return {dir,filename,config,store:new ExcelStore(config)};
}
function preparation():Preparation{return {runs:1,material:'PETG',profile:'Standard',layoutConfirmed:true,sourceHash:'source-a',items:[{mappingId:'map-one',included:true,copies:2,planned:2}],notes:'',savedAt:''}}
async function start(f:Awaited<ReturnType<typeof fixture>>){let s=await f.store.load();s=(await f.store.commit(s.revision,randomUUID(),{type:'save-preparation',plateId:'file-one-P01',preparation:preparation()},{'file-one':'source-a'})).snapshot;return (await f.store.commit(s.revision,randomUUID(),{type:'start',plateId:'file-one-P01'},{'file-one':'source-a'})).snapshot}

test('preparation, start, draft and acceptance preserve complete workbook and audit trail',async()=>{
 const f=await fixture();let s=await start(f);assert.equal(s.jobs[0].items[0].planned,2);assert.equal(s.parts[0].accepted,0);
 s=(await f.store.commit(s.revision,randomUUID(),{type:'save-results',jobId:s.jobs[0].id,results:[{mappingId:'map-one',accepted:1,rejected:null}]},{})).snapshot;assert.equal(s.parts[0].accepted,0);
 const requestId=randomUUID();const result=await f.store.commit(s.revision,requestId,{type:'finish',jobId:s.jobs[0].id,results:[{mappingId:'map-one',accepted:1,rejected:1}]},{});assert.equal(result.snapshot.parts[0].accepted,1);assert.equal(result.snapshot.audit.length,4);
 const replay=await f.store.commit(s.revision,requestId,{type:'finish',jobId:s.jobs[0].id,results:[{mappingId:'map-one',accepted:1,rejected:1}]},{});assert.equal(replay.replayed,true);assert.equal(replay.snapshot.parts[0].accepted,1);
 await assert.rejects(()=>f.store.commit(replay.snapshot.revision,randomUUID(),{type:'finish',jobId:s.jobs[0].id,results:[{mappingId:'map-one',accepted:1,rejected:1}]},{}),/already closed/);
 const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(f.filename);assert.equal(wb.getWorksheet('Purchasing')!.getCell('A1').value,'Do not modify');assert.equal(wb.getWorksheet('Purchasing')!.getCell('B2').result,3);assert.ok(wb.getWorksheet('Purchasing')!.getCell('A1').note);assert.equal((await readdir(path.join(f.dir,'backups'))).length,4);
});
test('one Printing job; preparation of another plate remains allowed',async()=>{
 const f=await fixture();let s=await start(f);await assert.rejects(()=>f.store.commit(s.revision,randomUUID(),{type:'start',plateId:'file-one-P01'},{'file-one':'source-a'}),/already has/);
 const prep={...preparation(),sourceHash:'source-b',items:[{mappingId:'map-two',included:true,copies:1,planned:1}]};s=(await f.store.commit(s.revision,randomUUID(),{type:'save-preparation',plateId:'file-two-P01',preparation:prep},{'file-two':'source-b'})).snapshot;assert.equal(s.plates[1].preparation?.runs,1);assert.equal(s.jobs[0].status,'Printing');
});
test('stale source and invalid counts cannot change accepted totals',async()=>{
 const f=await fixture();let s=await f.store.load();s=(await f.store.commit(s.revision,randomUUID(),{type:'save-preparation',plateId:'file-one-P01',preparation:preparation()},{'file-one':'source-a'})).snapshot;
 await assert.rejects(()=>f.store.commit(s.revision,randomUUID(),{type:'start',plateId:'file-one-P01'},{'file-one':'changed'}),/stale/);
 s=(await f.store.commit(s.revision,randomUUID(),{type:'start',plateId:'file-one-P01'},{'file-one':'source-a'})).snapshot;
 for(const results of [[{mappingId:'map-one',accepted:2,rejected:1}],[{mappingId:'map-one',accepted:-1,rejected:3}],[{mappingId:'map-one',accepted:1,rejected:null}]])await assert.rejects(()=>f.store.commit(s.revision,randomUUID(),{type:'finish',jobId:s.jobs[0].id,results},{}));assert.equal((await f.store.load()).parts[0].accepted,0);
});
test('manual custom-layout results credit original mappings without plate runs',async()=>{
 const f=await fixture();const s=await f.store.load();const r=await f.store.commit(s.revision,randomUUID(),{type:'manual-results',items:[{mappingId:'map-one',planned:1,accepted:1,rejected:0},{mappingId:'map-two',planned:2,accepted:1,rejected:1}],notes:'Custom recovery plate'},{});assert.deepEqual(r.snapshot.parts.map(p=>p.accepted),[1,1]);assert.equal(r.snapshot.jobs[0].kind,'manual');assert.ok(r.snapshot.jobs[0].items.every(i=>i.runs===0));assert.equal(r.snapshot.plates.length,2);
});
test('external workbook edits and Excel lock files block saves without overwriting',async()=>{
 const f=await fixture();const stale=await f.store.load();const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(f.filename);wb.getWorksheet('Purchasing')!.getCell('A2').value='Outside edit';await wb.xlsx.writeFile(f.filename);
 await assert.rejects(()=>f.store.commit(stale.revision,randomUUID(),{type:'update-part',partId:'part-one',required:4,installed:0,notes:'app'},{}),/changed since/);assert.equal((await f.store.load()).parts[0].required,3);
 await writeFile(path.join(f.dir,'~$Master.xlsx'),'Excel lock');const fresh=await f.store.load();await assert.rejects(()=>f.store.commit(fresh.revision,randomUUID(),{type:'update-part',partId:'part-one',required:4,installed:0,notes:''},{}),/Close this workbook/);
});
test('two builds with identical entity IDs have separate data stores',async()=>{
 const a=await fixture('build-a'),b=await fixture('build-b');const sa=await a.store.load();await a.store.commit(sa.revision,randomUUID(),{type:'update-part',partId:'part-one',required:12,installed:0,notes:'Only build A'},{});assert.equal((await a.store.load()).parts[0].required,12);assert.equal((await b.store.load()).parts[0].required,3);assert.equal((await b.store.load()).audit.length,0);
});
test('builds sharing one printer cannot start independent simultaneous tracked prints',async()=>{
 const a=await fixture('printer-build-a'),b=await fixture('printer-build-b');const printer={id:'test-'+randomUUID(),name:'Shared test printer'};a.config.printer=printer;b.config.printer=printer;
 await withPrinterSlot(a.config,[a.config,b.config],()=>start(a));
 await assert.rejects(()=>withPrinterSlot(b.config,[a.config,b.config],()=>start(b)),/already has a tracked print/);
});
test('printer-finished stage does not accept parts; cancellation preserves drafted accepts',async()=>{
 const f=await fixture();let s=await start(f);s=(await f.store.commit(s.revision,randomUUID(),{type:'await-inspection',jobId:s.jobs[0].id},{})).snapshot;assert.equal(s.jobs[0].status,'Awaiting inspection');assert.equal(s.parts[0].accepted,0);s=(await f.store.commit(s.revision,randomUUID(),{type:'save-results',jobId:s.jobs[0].id,results:[{mappingId:'map-one',accepted:1,rejected:1}]},{})).snapshot;await assert.rejects(()=>f.store.commit(s.revision,randomUUID(),{type:'cancel',jobId:s.jobs[0].id},{}),/Accepted parts are drafted/);
});
test('remote clients cannot edit and foreign origins cannot use a desktop token',()=>{
 process.env.BUILDDESK_EDIT_TOKEN='test-token-12345';const make=(local:string,origin:string,token='test-token-12345')=>new Request('http://localhost:4174/api',{headers:{'host':'localhost:4174','origin':origin,'x-builddesk-local':local,'x-builddesk-token':token}});
 assert.throws(()=>requireEditor(make('0','http://localhost:4174')),/read-only/);assert.throws(()=>requireEditor(make('1','https://other.example')),/this app/);assert.throws(()=>requireEditor(make('1','http://localhost:4174','wrong')),/Refresh/);assert.doesNotThrow(()=>requireEditor(make('1','http://localhost:4174')));
});
test('asset paths cannot escape the configured build root',async()=>{const f=await fixture();await assert.rejects(()=>assetFile(f.config,'../secret.txt'),/not allowed/)});
test('file refresh preserves disabled flags and leaves new plates untracked',async()=>{
 const f=await fixture();const zip=new JSZip();zip.file('Metadata/model_settings.config','<config><object id="1"><metadata key="name" value="Panel.stl"/></object><plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="0"/></model_instance></plate><plate><metadata key="plater_id" value="2"/><model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="0"/></model_instance></plate></config>');zip.file('3D/3dmodel.model','<model><build><item objectid="1" printable="0"/></build></model>');zip.file('Metadata/slice_info.config','<config><header/></config>');await writeFile(path.join(f.dir,'Front.3mf'),await zip.generateAsync({type:'nodebuffer'}));await writeFile(path.join(f.dir,'catalog.json'),JSON.stringify({parts:[],projects:[{id:'file-one',filename:'Front.3mf',sha256:'old',plates:[{id:'file-one-P01',name:'Plate1',thumbnail:'old.png',preview:'old.png',model:'old.glb',tracking:'tracked'}]}],references:[]}));const before=await f.store.load();const result=await refreshFile(f.config,before,'file-one');assert.equal(result.changed,true);const cat=JSON.parse(await readFile(path.join(f.dir,'catalog.json'),'utf8'));assert.equal(cat.projects[0].plates[0].instances[0].enabled,false);assert.equal(cat.projects[0].plates[0].model,undefined);assert.equal(cat.projects[0].plates[1].tracking,'untracked_candidate');assert.equal(cat.projects[0].plates[0].slice_info.label,'Not yet sliced');assert.equal((await f.store.load()).revision,before.revision);
});
const realWorkbook=path.resolve(process.env.BUILDDESK_TEST_WORKBOOK||'../local-data/kitten-745/Master Tracker.xlsx');
test('real exported workbook survives a clone-only save; original is unchanged',{skip:!existsSync(realWorkbook)},async()=>{
 const input=realWorkbook;const original=await readFile(input);const dir=path.join(testRoot,'real-roundtrip-'+randomUUID());await mkdir(dir,{recursive:true});const filename=path.join(dir,'Clone.xlsx');await writeFile(filename,original);const registry=JSON.parse(await readFile('../config/builds.json','utf8'));const config={...registry.builds[0],store:{...registry.builds[0].store,path:filename}} as BuildConfig;const store=new ExcelStore(config);const before=await store.load();const part=before.parts[0];await store.commit(before.revision,randomUUID(),{type:'update-part',partId:part.id,required:part.required,installed:part.installed,notes:part.notes+' [TEST CLONE ONLY]'},{});const after=await store.load();assert.equal(after.parts.length,101);assert.deepEqual(after.parts.map(p=>p.accepted),before.parts.map(p=>p.accepted));const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(filename);const sourceBook=new ExcelJS.Workbook();await sourceBook.xlsx.load(original as never);for(const sheet of sourceBook.worksheets)assert.ok(wb.getWorksheet(sheet.name),'Preserve '+sheet.name);const missing=['Build Desk Preparations','Build Desk Result Drafts','Build Desk Change Log'].filter(n=>!sourceBook.getWorksheet(n)).length;assert.equal(wb.worksheets.length,sourceBook.worksheets.length+missing);assert.equal(createHash('sha256').update(await readFile(input)).digest('hex'),createHash('sha256').update(original).digest('hex'));
});

test('plate quantity edits commit atomically and preserve accepted history and notes',async()=>{
 const f=await fixture();let s=await f.store.load();
 await assert.rejects(()=>f.store.commit(s.revision,randomUUID(),{type:'update-parts',items:[{partId:'part-one',required:1,installed:0},{partId:'part-two',required:1,installed:1}]},{}),/Installed/);
 assert.deepEqual((await f.store.load()).parts.map(p=>p.required),[3,2]);
 s=(await f.store.commit(s.revision,randomUUID(),{type:'update-parts',items:[{partId:'part-one',required:1,installed:0},{partId:'part-two',required:1,installed:0}]},{})).snapshot;
 assert.deepEqual(s.parts.map(p=>p.required),[1,1]);assert.equal(s.parts[0].notes,'Keep notes');assert.deepEqual(s.parts.map(p=>p.accepted),[0,0]);assert.equal(s.jobs.length,0);
});

test('reconciliation moves part membership, retires mappings and preserves immutable jobs',async()=>{
 const f=await fixture();let s=await start(f);s=(await f.store.commit(s.revision,randomUUID(),{type:'finish',jobId:s.jobs[0].id,results:[{mappingId:'map-one',accepted:1,rejected:1}]},{})).snapshot;
 const oldHistory=JSON.stringify(s.jobs),oldQuantities=s.parts.map(p=>({accepted:p.accepted,required:p.required,installed:p.installed}));
 const refreshed=await f.store.commit(s.revision,randomUUID(),{type:'reconcile-file',fileId:'file-one',sourceHash:'new-source',plates:[{number:1,name:'Black parts',assignments:[{partId:'part-two',copies:2}],unmapped:[]}]},{'file-one':'new-source'});
 s=refreshed.snapshot;const plate=s.plates.find(p=>p.fileId==='file-one')!;
 assert.equal(plate.assignments.length,1);assert.equal(plate.assignments[0].partId,'part-two');assert.equal(plate.name,'Black parts');assert.equal(plate.preparation,undefined);assert.equal(s.files[0].sourceHash,'new-source');assert.equal(JSON.stringify(s.jobs),oldHistory);assert.deepEqual(s.parts.map(p=>({accepted:p.accepted,required:p.required,installed:p.installed})),oldQuantities);
 const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(f.filename);assert.equal(wb.getWorksheet('Part-to-Plate Mapping')!.getCell('G2').value,'Obsolete');assert.ok(wb.getWorksheet('Build Desk File Imports'));assert.equal(wb.getWorksheet('Printed Parts Checklist')!.getCell('L2').value,'Unmapped');assert.ok(String(wb.getWorksheet('Printed Parts Checklist')!.getCell('L3').value).includes('Black parts'));
 await assert.rejects(()=>f.store.commit(s.revision,randomUUID(),{type:'reconcile-file',fileId:'file-one',sourceHash:'older-source',plates:[]},{'file-one':'new-source'}),/changed during/);
});

test('3MF membership groups split components and imports new plates except ignore suffix',async()=>{
 const f=await fixture();const zip=new JSZip();
 zip.file('Metadata/model_settings.config','<config><object id="1"><metadata key="name" value="Panel.stl_1"/></object><object id="2"><metadata key="name" value="Panel.stl_2"/></object><object id="3"><metadata key="name" value="Bracket.stl"/></object><object id="4"><metadata key="name" value="Unknown.stl"/></object><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Gray"/><model_instance><metadata key="object_id" value="1"/></model_instance><model_instance><metadata key="object_id" value="2"/></model_instance><model_instance><metadata key="object_id" value="3"/></model_instance><model_instance><metadata key="object_id" value="4"/></model_instance></plate><plate><metadata key="plater_id" value="2"/></plate><plate><metadata key="plater_id" value="3"/><metadata key="plater_name" value="Custom IGNORE  "/></plate><plate><metadata key="plater_id" value="4"/><metadata key="plater_name" value="ignore in middle only"/></plate></config>');
 zip.file('3D/3dmodel.model','<model><build><item objectid="1" printable="1"/><item objectid="2" printable="1"/><item objectid="3" printable="0"/><item objectid="4" printable="1"/></build></model>');
 const imported=await inspectMembership(await zip.generateAsync({type:'nodebuffer'}),await f.store.load(),'file-one');
 assert.equal(imported.plates.length,3);assert.deepEqual(imported.untracked,[3]);assert.equal(imported.plates[0].assignments.length,2);assert.deepEqual(imported.plates[0].assignments[0],{partId:'part-one',copies:null,split:true});assert.equal(imported.plates[0].assignments[1].copies,0);assert.deepEqual(imported.plates[0].unmapped,['Unknown.stl']);
});

test('confirmed duplicate-name matches are scoped to build, file, plate and exact source revision',async()=>{
 const f=await fixture();const s=await f.store.load();
 s.parts[0].source='TipperBox 745\\Cylinder Mounts.stl';s.parts[1].source='Rear Chassis 745\\Cylinder Mounts.stl';
 const zip=new JSZip();
 zip.file('Metadata/model_settings.config','<config><object id="1"><metadata key="name" value="Cylinder Mounts.stl"/><part><metadata key="source_file" value="Cylinder Mounts.stl"/></part></object><plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate><plate><metadata key="plater_id" value="2"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate></config>');
 zip.file('3D/3dmodel.model','<model><build><item objectid="1"/></build></model>');
 const bytes=await zip.generateAsync({type:'nodebuffer'});const hash=createHash('sha256').update(bytes).digest('hex');
 const match={buildId:s.build.id,fileId:'file-one',sourceHash:hash,plateNumber:1,objectName:'Cylinder Mounts.stl',partSource:s.parts[0].source};
 const result=await inspectMembership(bytes,s,'file-one',[match]);
 assert.deepEqual(result.plates[0].assignments,[{partId:'part-one',copies:1,split:false}]);assert.deepEqual(result.plates[0].unmapped,[]);
 assert.deepEqual(result.plates[1].unmapped,['Cylinder Mounts.stl']);
 for(const wrong of [{...match,buildId:'another-build'},{...match,fileId:'file-two'},{...match,sourceHash:'changed'},{...match,objectName:'Other.stl'}]){
  assert.deepEqual((await inspectMembership(bytes,s,'file-one',[wrong])).plates[0].unmapped,['Cylinder Mounts.stl']);
 }
 await assert.rejects(()=>inspectMembership(bytes,s,'file-one',[{...match,partSource:'Missing/Cylinder Mounts.stl'}]),/no longer identifies/);
 await assert.rejects(()=>inspectMembership(bytes,s,'file-one',[match,match]),/Conflicting/);
});

test('unchanged membership preserves preparation; unmatched objects remain visible for review',async()=>{
 const f=await fixture();let s=await f.store.load();
 const command={type:'reconcile-file' as const,fileId:'file-one',sourceHash:'source-a',plates:[{number:1,name:'Front plate',assignments:[{partId:'part-two',copies:1},{partId:'part-one',copies:2}],unmapped:[] as string[]}]};
 s=(await f.store.commit(s.revision,randomUUID(),command,{'file-one':'source-a'})).snapshot;
 const p=s.plates.find(p=>p.fileId==='file-one')!;
 const prep={...preparation(),items:p.assignments.map(a=>({mappingId:a.id,included:true,copies:a.copies,planned:a.copies}))};
 s=(await f.store.commit(s.revision,randomUUID(),{type:'save-preparation',plateId:p.id,preparation:prep},{'file-one':'source-a'})).snapshot;
 s=(await f.store.commit(s.revision,randomUUID(),command,{'file-one':'source-a'})).snapshot;
 assert.ok(s.plates.find(p=>p.fileId==='file-one')!.preparation?.layoutConfirmed);
 s=(await f.store.commit(s.revision,randomUUID(),{...command,sourceHash:'changed',plates:[{number:1,name:'Unknown-only plate',assignments:[],unmapped:['New object.stl']}]},{'file-one':'changed'})).snapshot;
 const unknown=s.plates.find(p=>p.fileId==='file-one')!;assert.ok(unknown);assert.equal(unknown.assignments.length,0);assert.deepEqual(unknown.unmappedObjects,['New object.stl']);assert.equal(unknown.preparation,undefined);
});


test('refresh registers new production plates, excludes renamed ignore plates, and preserves accepted history',async()=>{
 const f=await fixture();let before=await f.store.load();
 before=(await f.store.commit(before.revision,randomUUID(),{type:'manual-results',items:[{mappingId:'map-one',planned:1,accepted:1,rejected:0}],notes:'Preserve this history'},{'file-one':'old'})).snapshot;
 const zip=new JSZip();zip.file('Metadata/model_settings.config','<config><object id="1"><metadata key="name" value="Panel.stl"/></object><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Old layout ignore"/></plate><plate><metadata key="plater_id" value="8"/><metadata key="plater_name" value="Black parts"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate><plate><metadata key="plater_id" value="9"/><metadata key="plater_name" value="Manual Ignore"/></plate></config>');zip.file('3D/3dmodel.model','<model><build><item objectid="1"/></build></model>');
 await writeFile(path.join(f.dir,'Front.3mf'),await zip.generateAsync({type:'nodebuffer'}));
 await writeFile(path.join(f.dir,'catalog.json'),JSON.stringify({parts:[],projects:[{id:'file-one',filename:'Front.3mf',sha256:'old',plates:[]}],references:[]}));
 await refreshTrackedFile(f.config,before,'file-one',before.revision,randomUUID());const after=await f.store.load();
 assert.deepEqual(after.plates.filter(p=>p.fileId==='file-one').map(p=>p.number),[8]);assert.equal(after.plates.find(p=>p.number===8)?.assignments[0].partId,'part-one');assert.equal(after.parts[0].accepted,1);assert.deepEqual(after.jobs,before.jobs);
 const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(f.filename);assert.equal(wb.getWorksheet('Purchasing')!.getCell('A1').value,'Do not modify');assert.equal(wb.getWorksheet('Part-to-Plate Mapping')!.getCell('G2').value,'Obsolete');
 await refreshTrackedFile(f.config,after,'file-one',after.revision,randomUUID());const again=await f.store.load();assert.deepEqual(again.plates,after.plates);assert.deepEqual(again.jobs,after.jobs);
});

 test('inspection draft survives reload and blank rejected counts complete as zero',async()=>{
 const f=await fixture();let s=await start(f);const jobId=s.jobs[0].id;
 s=(await f.store.commit(s.revision,randomUUID(),{type:'save-results',jobId,results:[{mappingId:'map-one',accepted:2,rejected:null}]},{})).snapshot;
 s=await f.store.load();assert.deepEqual(s.jobs[0].draft,[{mappingId:'map-one',accepted:2,rejected:null}]);assert.equal(s.parts[0].accepted,0);
 s=(await f.store.commit(s.revision,randomUUID(),{type:'finish',jobId,results:s.jobs[0].draft!},{})).snapshot;
 assert.equal(s.jobs[0].status,'Completed');assert.equal(s.jobs[0].items[0].rejected,0);assert.equal(s.parts[0].accepted,2);
 });

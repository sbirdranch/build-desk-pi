import test from 'node:test';
import assert from 'node:assert/strict';
import {available,acquisitionProgress,filteredParts,toggleOrdered,validateEdit,type AcquisitionPart} from '../src/core/acquisition';
import {DatabaseSync} from 'node:sqlite';
import {initializeSchema} from '../src/server/sqlite-schema.mjs';
import {activateAcquisition} from '../src/server/acquisition-migration';
import {importAcquisitionParts} from '../src/server/acquisition-import';
import {readSQLiteSnapshot} from '../src/server/sqlite-read';
import {applyCommand} from '../src/core/domain';
import type {BuildConfig} from '../src/core/types';
const part=(changes:Partial<AcquisitionPart>={}):AcquisitionPart=>({id:'p',category:'Hardware',description:'Screw',specification:'M3',requirement:'4',required:4,onHand:2,ordered:false,vendor:'Shop',url:'',orderedDate:'',notes:'',...changes});
test('availability, capped gauges, overlapping filters and empty/unknown requirements',()=>{
 const parts=[part({id:'partial',ordered:true}),part({id:'extra',onHand:9,ordered:true}),part({id:'zero',required:0,onHand:0}),part({id:'unknown',required:null,onHand:null})];
 assert.equal(available(parts[0]),false);assert.equal(available(parts[1]),true);
 const p=acquisitionProgress(parts);assert.equal(p.stock,6);assert.equal(p.units,8);assert.equal(p.availablePercent,75);assert.equal(p.orderedPercent,100);assert.equal(p.unknown,1);
 assert.deepEqual(filteredParts(parts,'ordered','').map(p=>p.id),['partial','extra']);
 assert.deepEqual(filteredParts(parts,'available','').map(p=>p.id),['extra','zero']);
 assert.deepEqual(filteredParts(parts,'not-available','').map(p=>p.id),['partial','unknown']);
 assert.equal(filteredParts(parts,'all','m3').length,4);assert.equal(filteredParts(parts,'all','missing').length,0);
 assert.equal(acquisitionProgress([]).availablePercent,0);assert.equal(acquisitionProgress([parts[2]]).orderedPercent,0);
});
test('every toggle offers a date choice, preserving stock and independent flag across repeated toggles',()=>{
 const initial={onHand:2,ordered:false,vendor:'Shop',url:'',orderedDate:'',notes:''};
 const decline=toggleOrdered(initial,false,'2026-11-04');assert.equal(decline.ordered,true);assert.equal(decline.orderedDate,'');
 const accept=toggleOrdered(initial,true,'2026-11-04');assert.equal(accept.orderedDate,'2026-11-04');
 const off=toggleOrdered(accept,false,'2026-11-05');assert.equal(off.ordered,false);assert.equal(off.orderedDate,'2026-11-04');assert.equal(off.onHand,2);
 const offUpdate=toggleOrdered(accept,true,'2026-11-05');assert.equal(offUpdate.orderedDate,'2026-11-05');
 assert.deepEqual(initial,{onHand:2,ordered:false,vendor:'Shop',url:'',orderedDate:'',notes:''});
 assert.equal(validateEdit({...accept,onHand:10}).ordered,true);
 for(const onHand of [-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN])assert.throws(()=>validateEdit({...initial,onHand}),/whole/);
 for(const notes of ['é','x'.repeat(201)])assert.throws(()=>validateEdit({...initial,notes}));
 assert.throws(()=>validateEdit({...initial,url:'javascript:alert(1)'}),/http/);
 assert.throws(()=>validateEdit({...initial,orderedDate:'2026-02-30'}),/date/);
 assert.equal(validateEdit({...initial,vendor:'  My   Shop  '}).vendor,'My Shop');
});
test('activation archives legacy records, isolates builds, shares vendors and preserves user fields on designer reimport',()=>{
 const db=new DatabaseSync(':memory:');initializeSchema(db);
 try{
  for(const id of ['truck','loader']){db.prepare('INSERT INTO builds VALUES(?,?,?,?,?)').run(id,id,1,'printer','today');db.prepare('INSERT INTO build_revisions VALUES(?,?,?)').run(id,0,'today');const p=part();db.prepare('INSERT INTO runtime_compatibility VALUES(?,?,?,?)').run(id,JSON.stringify({parts:[{...p,name:p.description,needed:p.required,onOrder:2,supplier:'  Shop ',link:'https://example.com',orderedDate:'2026-11-01',notes:'Keep é full original'}],items:[{legacy:'item'}],ledger:[{legacy:'event'}]}),'[]','{}');}
  db.exec('BEGIN');const reports=activateAcquisition(db);db.exec('COMMIT');assert.equal(reports.length,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM vendors').get()?.n,1);
  const s=readSQLiteSnapshot(db,'truck');assert.equal(s.purchasing,undefined);assert.equal(s.acquisition?.parts[0].ordered,false);assert.equal(s.acquisition?.parts[0].notes,'Keep  full original');
  assert.match(String(db.prepare('SELECT legacy_json FROM purchasing_archives WHERE build_id=?').get('truck')?.legacy_json),/Keep é full original/);
  const config={active:true} as BuildConfig;
  const changed=applyCommand(s,{type:'save-acquisition',partId:'p',fields:{onHand:9,ordered:true,vendor:'Another',url:'https://example.com/new',orderedDate:'2026-11-04',notes:'New note',required:999} as any},config,{});
  assert.equal(changed.state.acquisition?.parts[0].required,4);assert.equal(changed.state.acquisition?.parts[0].onHand,9);
  assert.equal(readSQLiteSnapshot(db,'loader').acquisition?.parts[0].onHand,2);
  db.prepare("UPDATE purchase_parts SET on_hand_qty=9,ordered=1,notes='user note' WHERE build_id='truck'").run();
  db.exec('BEGIN');importAcquisitionParts(db,'truck',[{id:'p',description:'New designer label',required:8}]);db.exec('COMMIT');
  const imported=readSQLiteSnapshot(db,'truck').acquisition!.parts[0];assert.equal(imported.description,'New designer label');assert.equal(imported.required,8);assert.equal(imported.onHand,9);assert.equal(imported.ordered,true);assert.equal(imported.notes,'user note');assert.equal(imported.url,'https://example.com');
  assert.equal(readSQLiteSnapshot(db,'loader').acquisition!.parts[0].required,4);
  assert.throws(()=>importAcquisitionParts(db,'truck',[{id:'p',description:'A',required:1},{id:'p',description:'B',required:2}]),/unique/);
  assert.deepEqual(activateAcquisition(db),[]);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';
import {readSQLiteSnapshot} from '../src/server/sqlite-read';

test('migration copies a synthetic completed print and purchased part without touching source',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'builddesk-sqlite-'));
 try{
  const file=join(dir,'source.xlsx'),out=join(dir,'test.db');
  const wb=new ExcelJS.Workbook();
  const tab=(name:string,cols:number)=>{const s=wb.addWorksheet(name);s.addRow(Array.from({length:cols},(_,i)=>'Column '+(i+1)));return s;};
  const parts=tab('Printed Parts Checklist',18);
  const part=Array(18).fill(null);
  Object.assign(part,{0:'P1',1:'Chassis',2:'Widget',3:'Widget.stl',4:'PETG',5:3,6:1,16:0,17:'keep note'});
  parts.addRow(part);
  const files=tab('3MF Project Register',10);
  const f=Array(10).fill(null);
  Object.assign(f,{0:'F1',1:'Model.3mf',3:'v1',4:'PETG',5:'Standard'});
  files.addRow(f);
  const maps=tab('Part-to-Plate Mapping',10);
  maps.addRow(['M1','P1','F1',1,'Plate 1',1,'Confirmed',null,null,'']);
  const history=tab('Print Job History',20);
  const job=Array(20).fill(null);
  Object.assign(job,{0:'J1',1:'2026-01-01',2:'P1',3:'M1',4:'F1',5:'v1',6:'Plate 1',7:1,8:2,9:2,10:0,11:'Completed',12:'Standard',13:'PETG',14:'',16:'Model.3mf',17:1,18:'2026-01-01',19:'2026-01-01'});
  history.addRow(job);
  const purchases=tab('Parts Checklist',17);
  const row=Array(17).fill(null);
  Object.assign(row,{0:'B1',1:'Hardware',2:'M3 screw',5:6,6:4,10:'AliExpress',11:'2026-01-02',13:'https://example.com'});
  purchases.addRow(row);
  tab('Order Log',17);
  await wb.xlsx.writeFile(file);
  const original=await readFile(file);
  const p=spawnSync(process.execPath,['--import','tsx','scripts/migrate-sqlite.mjs','--workbook',file,'--output',out,'--build-id','kitten-test','--name','Test Kitten'],{cwd:process.cwd(),encoding:'utf8',timeout:60000});
  assert.equal(p.status,0, 'Migration failed: '+p.stderr+' '+p.stdout);
  assert.deepEqual(await readFile(file),original,'Input workbook must stay untouched');
  const report=JSON.parse(await readFile(out+'.migration-report.json','utf8'));
  assert.equal(report.verified.parts,1);
  assert.equal(report.verified.jobs,1);
  assert.equal(report.verified.acceptedTotalsMatched,1);
  const db=new DatabaseSync(out);
  try{
   assert.equal(db.prepare('SELECT opening_qty FROM print_parts').get()?.opening_qty,1);
   assert.equal(db.prepare('SELECT accepted_qty FROM print_job_items').get()?.accepted_qty,2);
   assert.equal(db.prepare('SELECT on_hand_qty FROM purchase_parts').get()?.on_hand_qty,4);
   assert.equal(db.prepare('SELECT ordered FROM purchase_parts').get()?.ordered,0);
   const restored=readSQLiteSnapshot(db,'kitten-test');
   assert.equal(restored.parts[0].accepted,3);
   assert.equal(restored.jobs[0].items[0].accepted,2);
   assert.equal(restored.purchasing?.parts[0].onHand,4);
   assert.equal(restored.plates[0].assignments[0].partId,'P1');
   assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close()}
  const rerun=spawnSync(process.execPath,['--import','tsx','scripts/migrate-sqlite.mjs','--workbook',file,'--output',out,'--build-id','kitten-test'],{cwd:process.cwd(),encoding:'utf8',timeout:60000});
  assert.notEqual(rerun.status,0,'Must refuse to overwrite existing SQLite output');
 }finally{await rm(dir,{recursive:true,force:true})}
});

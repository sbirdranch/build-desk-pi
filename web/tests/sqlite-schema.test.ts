import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initializeSchema,SCHEMA_VERSION} from '../src/server/sqlite-schema.mjs';

function database() {
 const db=new DatabaseSync(':memory:');
 initializeSchema(db);
 return db;
}
function build(db:DatabaseSync,id:string){
 db.prepare('INSERT INTO builds(id,name,active,printer_id,created_at) VALUES(?,?,?,?,?)').run(id,id,1,'printer-1','2026-11-03T00:00:00Z');
}
function part(db:DatabaseSync,buildId:string,id:string,opening=0){
 db.prepare('INSERT INTO print_parts(build_id,id,name,section,source,material,required_qty,opening_qty,installed_qty,notes) VALUES(?,?,?,?,?,?,?,?,?,?)')
 .run(buildId,id,id,'Cabin','source','PETG',6,opening,0,'');
}
test('schema bootstraps and rejects unsupported version',()=>{
 const db=database();
 try{
  assert.equal(db.prepare('SELECT version FROM schema_migrations').get()?.version,SCHEMA_VERSION);
  initializeSchema(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n,1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.prepare('UPDATE schema_migrations SET version=999').run();
  assert.throws(()=>initializeSchema(db),/Unsupported SQLite schema/);
 }finally{db.close()}
});
test('build-scoped identical IDs are independent and cross-build FKs fail',()=>{
 const db=database();
 try{
  build(db,'kitten-old');build(db,'kitten-new');
  part(db,'kitten-old','same-part',2);part(db,'kitten-new','same-part',0);
  assert.equal(db.prepare('SELECT opening_qty FROM print_parts WHERE build_id=? AND id=?').get('kitten-old','same-part')?.opening_qty,2);
  assert.equal(db.prepare('SELECT opening_qty FROM print_parts WHERE build_id=? AND id=?').get('kitten-new','same-part')?.opening_qty,0);
  assert.throws(()=>db.prepare('INSERT INTO plates(build_id,id,file_id,plate_number,name,section) VALUES(?,?,?,?,?,?)').run('kitten-new','p','missing',1,'Plate','Cabin'),/FOREIGN KEY/);
  assert.throws(()=>part(db,'kitten-old','same-part'),/UNIQUE/);
 }finally{db.close()}
});
test('purchasing quantities are separate and vendor name shared',()=>{
 const db=database();
 try{
  build(db,'truck');build(db,'loader');
  db.prepare('INSERT INTO vendors(display_name,normalized_name) VALUES(?,?)').run('AliExpress','aliexpress');
  for(const [buildId,qty] of [['truck',2],['loader',8]] as const){
   db.prepare('INSERT INTO purchase_parts(build_id,id,description,required_qty,on_hand_qty,ordered,vendor_id) VALUES(?,?,?,?,?,?,?)')
    .run(buildId,'M3x10','M3 screw',6,qty,buildId==='truck'?1:0,1);
  }
  const rows=db.prepare('SELECT build_id, on_hand_qty, ordered, on_hand_qty >= required_qty AS available FROM purchase_parts ORDER BY build_id').all();
  assert.deepEqual(rows.map(x=>[x.build_id,x.on_hand_qty,x.ordered,x.available]),[['loader',8,0,1],['truck',2,1,0]]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vendors').get()?.n,1);
  assert.throws(()=>db.prepare('UPDATE purchase_parts SET on_hand_qty=-1 WHERE build_id=?').run('truck'),/CHECK/);
 }finally{db.close()}
});
test('job snapshots and inspection drafts have integrity constraints',()=>{
 const db=database();
 try{
  build(db,'truck');part(db,'truck','p1');
  db.prepare('INSERT INTO print_jobs(build_id,id,kind,status,started_at) VALUES(?,?,?,?,?)').run('truck','job1','plate','Awaiting inspection','2026-11-03');
  db.prepare('INSERT INTO print_job_items(build_id,job_id,line_no,part_id,mapping_id,file_id,file_revision,filename,plate_number,plate_name,runs,planned_qty,accepted_qty,rejected_qty,profile,material,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .run('truck','job1',0,'p1','old-mapping','f1','v1','historic.3mf',1,'Plate',1,4,null,null,'PETG standard','PETG','');
  db.prepare('INSERT INTO inspection_drafts(build_id,job_id,mapping_id,accepted_qty,rejected_qty) VALUES(?,?,?,?,?)').run('truck','job1','old-mapping',2,1);
  assert.equal(db.prepare('SELECT accepted_qty FROM print_job_items').get()?.accepted_qty,null);
  assert.equal(db.prepare('SELECT accepted_qty FROM inspection_drafts').get()?.accepted_qty,2);
  assert.throws(()=>db.prepare('DELETE FROM print_jobs WHERE id=?').run('job1'),/FOREIGN KEY/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});

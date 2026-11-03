// One-shot, dry-run-only workbook -> SQLite importer.
// Run from web/: npx tsx scripts/migrate-sqlite.mjs --workbook <copy.xlsx> --output <new.db> --build-id kitten-745
// NEVER point --output at a live datastore; existing output files are rejected.
import ExcelJS from 'exceljs';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,stat,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {decode} from '../src/server/excel-store.ts';
import {initializeSchema} from '../src/server/sqlite-schema.mjs';

const fail=(message)=>{throw Error(message)};
const args=Object.fromEntries(process.argv.slice(2).reduce((acc,v,i,a)=>{if(v.startsWith('--'))acc.push([v.slice(2),a[i+1]]);return acc},[]));
if(!args.workbook||!args.output||!args['build-id']) {
  console.error('Usage: npx tsx scripts/migrate-sqlite.mjs --workbook <copied-tracker.xlsx> --output <new.db> --build-id <id> [--name <name>]');
  process.exit(2);
}
const source=resolve(args.workbook),output=resolve(args.output),buildId=args['build-id'],buildName=args.name||buildId;
if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(buildId))fail('Invalid build ID');
if(existsSync(output)||existsSync(output+'-wal')||existsSync(output+'-shm'))fail('Output exists; refusing to replace data');
if(source===output)fail('Input and output must differ');
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const bytes=await readFile(source);
const wb=new ExcelJS.Workbook();
await wb.xlsx.load(bytes);
const config={id:buildId,name:buildName,active:true,store:{kind:'excel',path:source,schema:'master-tracker-v1'},assets:{root:'',catalog:''},models:{directory:''},workflow:{defaultProfile:'',materials:[],maxPrintingJobs:1},modules:['printing','purchasing']};
const snapshot=decode(wb,config,hash(bytes),(await stat(source)).mtime.toISOString());
const p=snapshot.purchasing;
const acceptedByPart=new Map(snapshot.parts.map(x=>[x.id,x.accepted]));
const duplicate=(label,ids)=>{if(new Set(ids).size!==ids.length)fail('Duplicate '+label+' IDs in source');};
for(const [label,items] of [['print part',snapshot.parts],['model file',snapshot.files],['plate',snapshot.plates],['job',snapshot.jobs],['purchasing part',p?.parts||[]]])duplicate(label,items.map(x=>x.id));
for(const job of snapshot.jobs)for(const item of job.items){
  if(!snapshot.parts.some(x=>x.id===item.partId))fail('Unknown job part '+item.partId);
  if(!integer(item.planned))fail('Invalid job planned count in '+job.id);
  if(job.status==='Completed'&&(!integer(item.accepted)||!integer(item.rejected)||item.accepted+item.rejected!==item.planned))fail('Invalid completed job '+job.id);
}
const audit={source,sourceSha256:hash(bytes),buildId,buildName,importedAt:new Date().toISOString(),counts:{parts:snapshot.parts.length,files:snapshot.files.length,plates:snapshot.plates.length,assignments:snapshot.plates.reduce((n,x)=>n+x.assignments.length,0),jobs:snapshot.jobs.length,jobItems:snapshot.jobs.reduce((n,x)=>n+x.items.length,0),purchasingParts:p?.parts.length||0},warnings:[]};
let db;
try{
  db=new DatabaseSync(output);
  db.exec('PRAGMA foreign_keys=ON');
  initializeSchema(db);
  const insert=(sql,rows)=>{const stmt=db.prepare(sql);for(const row of rows)stmt.run(...row)};
  const at=new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try{
    insert('INSERT INTO builds(id,name,active,printer_id,created_at) VALUES(?,?,?,?,?)',[[buildId,buildName,1,null,at]]);
    insert('INSERT INTO build_revisions(build_id,revision,updated_at) VALUES(?,?,?)',[[buildId,0,at]]);
    insert('INSERT INTO print_parts(build_id,id,name,section,source,material,required_qty,opening_qty,installed_qty,notes) VALUES(?,?,?,?,?,?,?,?,?,?)',
      snapshot.parts.map(x=>[buildId,x.id,x.name,x.section,x.source,x.material,x.required,x.opening,x.installed,x.notes]));
    insert('INSERT INTO model_files(build_id,id,filename,revision_label,profile,material,section,source_hash,imported_at) VALUES(?,?,?,?,?,?,?,?,?)',
      snapshot.files.map(x=>[buildId,x.id,x.filename,x.revision,x.profile,x.material,x.section,x.sourceHash||null,x.importedAt||null]));
    insert('INSERT INTO plates(build_id,id,file_id,plate_number,name,section,unmapped_json) VALUES(?,?,?,?,?,?,?)',
      snapshot.plates.map(x=>[buildId,x.id,x.fileId,x.number,x.name,x.section,JSON.stringify(x.unmappedObjects||[])]));
    insert('INSERT INTO plate_assignments(build_id,id,plate_id,part_id,copies,confirmed,note) VALUES(?,?,?,?,?,?,?)',
      snapshot.plates.flatMap(x=>x.assignments.map(a=>[buildId,a.id,x.id,a.partId,a.copies,Number(a.confirmed),a.note||''])));
    insert('INSERT INTO plate_preparations(build_id,plate_id,runs,material,profile,source_hash,notes,saved_at) VALUES(?,?,?,?,?,?,?,?)',
      snapshot.plates.filter(x=>x.preparation).map(x=>[buildId,x.id,x.preparation.runs,x.preparation.material,x.preparation.profile,x.preparation.sourceHash,x.preparation.notes,x.preparation.savedAt]));
    insert('INSERT INTO preparation_items(build_id,plate_id,mapping_id,included,copies,planned_qty) VALUES(?,?,?,?,?,?)',
      snapshot.plates.filter(x=>x.preparation).flatMap(x=>x.preparation.items.map(i=>[buildId,x.id,i.mappingId,Number(i.included),i.copies,i.planned])));
    insert('INSERT INTO print_jobs(build_id,id,kind,status,started_at,finished_at) VALUES(?,?,?,?,?,?)',
      snapshot.jobs.map(j=>[buildId,j.id,j.kind,j.status,j.startedAt,j.finishedAt||null]));
    insert('INSERT INTO print_job_items(build_id,job_id,line_no,part_id,mapping_id,file_id,file_revision,filename,plate_number,plate_name,runs,planned_qty,accepted_qty,rejected_qty,profile,material,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      snapshot.jobs.flatMap(j=>j.items.map((i,n)=>[buildId,j.id,n,i.partId,i.mappingId,i.fileId,i.fileRevision,i.filename,i.plateNumber,i.plateName,i.runs,i.planned,i.accepted,i.rejected,i.profile,i.material,i.notes])));
    insert('INSERT INTO inspection_drafts(build_id,job_id,mapping_id,accepted_qty,rejected_qty) VALUES(?,?,?,?,?)',
      snapshot.jobs.flatMap(j=>(j.draft||[]).map(d=>[buildId,j.id,d.mappingId,d.accepted,d.rejected])));
    const vendors=new Map();
    const addVendor=(name)=>{const normalized=name.trim().replace(/\\s+/g,' ').toLocaleLowerCase('en-US');if(!normalized)return null;
      if(!vendors.has(normalized)){const result=db.prepare('INSERT INTO vendors(display_name,normalized_name) VALUES(?,?)').run(name.trim(),normalized);vendors.set(normalized,Number(result.lastInsertRowid));}
      return vendors.get(normalized);};
    for(const x of p?.parts||[]){
      const rawNotes=x.notes||'';
      const ascii=rawNotes.replace(/[^\\x00-\\x7f]/g,'').slice(0,200);
      if(rawNotes!==ascii)audit.warnings.push({partId:x.id,issue:'Legacy notes shortened/converted; full value retained in archived source'});
      if(x.needed===null||x.onHand===null)audit.warnings.push({partId:x.id,issue:'Unknown required/on-hand value preserved as NULL'});
      if(x.orderedDate)audit.warnings.push({partId:x.id,issue:'Existing date preserved; Ordered flag requires review because historical order logs do not establish current user decision'});
      db.prepare('INSERT INTO purchase_parts(build_id,id,category,description,specification,designer_requirement,required_qty,on_hand_qty,ordered,vendor_id,product_url,ordered_date,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(buildId,x.id,x.category,x.name,x.specification,x.requirement,x.needed,x.onHand,0,addVendor(x.supplier||''),x.link||'',x.orderedDate||null,ascii);
    }
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const errors=db.prepare('PRAGMA foreign_key_check').all();
  const integrity=db.prepare('PRAGMA integrity_check').all();
  if(errors.length||integrity.some(r=>r.integrity_check!=='ok'))fail('SQLite integrity verification failed');
  const query=(q)=>Number(db.prepare(q).get().n);
  const found={parts:query('SELECT COUNT(*) n FROM print_parts'),files:query('SELECT COUNT(*) n FROM model_files'),plates:query('SELECT COUNT(*) n FROM plates'),assignments:query('SELECT COUNT(*) n FROM plate_assignments'),jobs:query('SELECT COUNT(*) n FROM print_jobs'),jobItems:query('SELECT COUNT(*) n FROM print_job_items'),purchasingParts:query('SELECT COUNT(*) n FROM purchase_parts')};
  for(const [k,v] of Object.entries(audit.counts))if(found[k]!==v)fail('Count mismatch '+k+': '+found[k]+' vs '+v);
  const totals=db.prepare(`SELECT p.id AS id,p.opening_qty+COALESCE(SUM(CASE WHEN j.status='Completed' AND i.accepted_qty IS NOT NULL AND i.rejected_qty IS NOT NULL AND i.accepted_qty+i.rejected_qty=i.planned_qty THEN i.accepted_qty ELSE 0 END),0) AS accepted
      FROM print_parts p LEFT JOIN print_job_items i ON i.build_id=p.build_id AND i.part_id=p.id
      LEFT JOIN print_jobs j ON j.build_id=i.build_id AND j.id=i.job_id WHERE p.build_id=? GROUP BY p.build_id,p.id`).all(buildId);
  const mismatches=totals.filter(r=>r.accepted!==acceptedByPart.get(r.id));
  if(mismatches.length)fail('Accepted-count mismatches: '+JSON.stringify(mismatches.slice(0,10)));
  // Compare business values field by field, not merely overall row counts.
  let checkedRows=0;
  const verify=(table,key,expected,actual)=>{
    checkedRows++;
    for(const [field,value] of Object.entries(expected)){
      if(actual?.[field]!==value)fail('Semantic mismatch '+table+'/'+key+'/'+field+': expected '+JSON.stringify(value)+' got '+JSON.stringify(actual?.[field]));
    }
  };
  for(const x of snapshot.parts){
    const row=db.prepare('SELECT name,section,source,material,required_qty,opening_qty,installed_qty,notes FROM print_parts WHERE build_id=? AND id=?').get(buildId,x.id);
    verify('print_parts',x.id,{name:x.name,section:x.section,source:x.source,material:x.material,required_qty:x.required,opening_qty:x.opening,installed_qty:x.installed,notes:x.notes},row);
  }
  for(const x of snapshot.files){
    verify('model_files',x.id,{filename:x.filename,revision_label:x.revision,profile:x.profile,material:x.material,section:x.section,source_hash:x.sourceHash||null,imported_at:x.importedAt||null},
      db.prepare('SELECT filename,revision_label,profile,material,section,source_hash,imported_at FROM model_files WHERE build_id=? AND id=?').get(buildId,x.id));
  }
  for(const plate of snapshot.plates){
    const row=db.prepare('SELECT file_id,plate_number,name,section,unmapped_json FROM plates WHERE build_id=? AND id=?').get(buildId,plate.id);
    verify('plates',plate.id,{file_id:plate.fileId,plate_number:plate.number,name:plate.name,section:plate.section,unmapped_json:JSON.stringify(plate.unmappedObjects||[])},row);
    for(const a of plate.assignments)verify('plate_assignments',a.id,{plate_id:plate.id,part_id:a.partId,copies:a.copies,confirmed:Number(a.confirmed),note:a.note||''},
      db.prepare('SELECT plate_id,part_id,copies,confirmed,note FROM plate_assignments WHERE build_id=? AND id=?').get(buildId,a.id));
    if(plate.preparation){
      const p=plate.preparation;
      verify('plate_preparations',plate.id,{runs:p.runs,material:p.material,profile:p.profile,source_hash:p.sourceHash,notes:p.notes,saved_at:p.savedAt},
        db.prepare('SELECT runs,material,profile,source_hash,notes,saved_at FROM plate_preparations WHERE build_id=? AND plate_id=?').get(buildId,plate.id));
      for(const i of p.items)verify('preparation_items',plate.id+'/'+i.mappingId,{included:Number(i.included),copies:i.copies,planned_qty:i.planned},
        db.prepare('SELECT included,copies,planned_qty FROM preparation_items WHERE build_id=? AND plate_id=? AND mapping_id=?').get(buildId,plate.id,i.mappingId));
    }
  }
  for(const job of snapshot.jobs){
    verify('print_jobs',job.id,{kind:job.kind,status:job.status,started_at:job.startedAt,finished_at:job.finishedAt||null},
      db.prepare('SELECT kind,status,started_at,finished_at FROM print_jobs WHERE build_id=? AND id=?').get(buildId,job.id));
    for(const [n,i] of job.items.entries())verify('print_job_items',job.id+'/'+n,
      {part_id:i.partId,mapping_id:i.mappingId,file_id:i.fileId,file_revision:i.fileRevision,filename:i.filename,plate_number:i.plateNumber,plate_name:i.plateName,runs:i.runs,planned_qty:i.planned,accepted_qty:i.accepted,rejected_qty:i.rejected,profile:i.profile,material:i.material,notes:i.notes},
      db.prepare('SELECT part_id,mapping_id,file_id,file_revision,filename,plate_number,plate_name,runs,planned_qty,accepted_qty,rejected_qty,profile,material,notes FROM print_job_items WHERE build_id=? AND job_id=? AND line_no=?').get(buildId,job.id,n));
    for(const d of job.draft||[])verify('inspection_drafts',job.id+'/'+d.mappingId,{accepted_qty:d.accepted,rejected_qty:d.rejected},
      db.prepare('SELECT accepted_qty,rejected_qty FROM inspection_drafts WHERE build_id=? AND job_id=? AND mapping_id=?').get(buildId,job.id,d.mappingId));
  }
  for(const x of p?.parts||[]){
    const expectedNotes=(x.notes||'').replace(/[^\\x00-\\x7f]/g,'').slice(0,200);
    verify('purchase_parts',x.id,{category:x.category,description:x.name,specification:x.specification,designer_requirement:x.requirement,required_qty:x.needed,on_hand_qty:x.onHand,ordered:0,product_url:x.link||'',ordered_date:x.orderedDate||null,notes:expectedNotes},
      db.prepare('SELECT category,description,specification,designer_requirement,required_qty,on_hand_qty,ordered,product_url,ordered_date,notes FROM purchase_parts WHERE build_id=? AND id=?').get(buildId,x.id));
  }
  audit.verified={...found,acceptedTotalsMatched:totals.length,fieldComparedRecords:checkedRows,foreignKeyCheck:'ok',integrityCheck:'ok'};
  await writeFile(output+'.migration-report.json',JSON.stringify(audit,null,2),{flag:'wx'});
  // Legacy purchase orders/ledgers retained separately, never imported into new active schema.
  await writeFile(output+'.legacy-purchasing.json',JSON.stringify({sourceSha256:audit.sourceSha256,parts:p?.parts||[],items:p?.items||[],ledger:p?.ledger||[]},null,2),{flag:'wx'});
  console.log(JSON.stringify({output,report:output+'.migration-report.json',verified:audit.verified,warnings:audit.warnings.length},null,2));
}catch(e){
  console.error('Migration failed:',e);
  process.exitCode=1;
  if(db){try{db.close()}catch{}}
  // Leave failed output for investigation, never use as production.
  console.error('Do not deploy this SQLite output; validation did not complete.');
}finally{try{db?.close()}catch{}}

import type {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {vendorKey,validDate,validProductURL} from '../core/acquisition';
import type {Purchasing} from '../core/purchasing';
// Called offline on a new consistent database copy, in the caller's write transaction.
export function activateAcquisition(db:DatabaseSync){
 const reports=[];
 for(const build of db.prepare('SELECT id FROM builds').all()){
  const id=String(build.id);
  if(db.prepare('SELECT build_id FROM purchasing_archives WHERE build_id=?').get(id))continue;
  const row=db.prepare('SELECT purchasing_json FROM runtime_compatibility WHERE build_id=?').get(id);
  if(!row)throw Error('Missing legacy purchasing source for '+id);
  const raw=String(row.purchasing_json),p=JSON.parse(raw) as Purchasing;
  if(!Array.isArray(p.parts))throw Error('Invalid legacy purchasing source for '+id);
  const warnings:{partId:string;issue:string}[]=[];
  db.prepare('DELETE FROM purchase_parts WHERE build_id=?').run(id);
  for(const part of p.parts){
   const notes=(part.notes||'').replace(/[^\x20-\x7e\r\n\t]/g,'').slice(0,200);
   if(notes!==(part.notes||''))warnings.push({partId:part.id,issue:'Notes shortened/converted to ASCII; full notes archived'});
   if((part.onOrder??0)>0||part.orderedDate)warnings.push({partId:part.id,issue:'Ordered starts unchecked; review manually. Prior orders and dates are archived.'});
   const url=part.link&&validProductURL(part.link)?part.link:'';
   if(part.link&&!url)warnings.push({partId:part.id,issue:'Unsupported product URL archived; editable link starts blank'});
   const date=part.orderedDate?.slice(0,10)||'';
   if(date&&!validDate(date))warnings.push({partId:part.id,issue:'Invalid prior date archived; editable date starts blank'});
   let vendorId:number|null=null;const vendor=(part.supplier||'').trim().replace(/\s+/g,' ');
   if(vendor){db.prepare('INSERT OR IGNORE INTO vendors(display_name,normalized_name) VALUES(?,?)').run(vendor,vendorKey(vendor));vendorId=Number(db.prepare('SELECT id FROM vendors WHERE normalized_name=?').get(vendorKey(vendor))!.id);}
   db.prepare('INSERT INTO purchase_parts(build_id,id,category,description,specification,designer_requirement,required_qty,on_hand_qty,ordered,vendor_id,product_url,ordered_date,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,part.id,part.category,part.name,part.specification,part.requirement,part.needed,part.onHand,0,vendorId,url,validDate(date)?date:null,notes);
  }
  const report={buildId:id,parts:p.parts.length,archivedItems:p.items?.length||0,archivedLedger:p.ledger?.length||0,warnings};
  db.prepare('INSERT INTO purchasing_archives VALUES(?,?,?,?,?)').run(id,new Date().toISOString(),createHash('sha256').update(raw).digest('hex'),raw,JSON.stringify(report));
  db.prepare('UPDATE runtime_compatibility SET purchasing_json=? WHERE build_id=?').run('{}',id);
  reports.push(report);
 }
 return reports;
}

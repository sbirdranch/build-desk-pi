// Read-only SQLite Snapshot adapter used to validate migration fidelity.
// No runtime registry changes. A complete transactional write adapter follows separately.
import type {DatabaseSync} from 'node:sqlite';
import type {Snapshot,Part,ModelFile,Plate,Job,JobItem,Preparation} from '../core/types';
import type {PurchasePart} from '../core/purchasing';
import {recalculate} from '../core/domain';

type DBRow=Record<string,unknown>;
const str=(v:unknown)=>v==null?'':String(v);
const opt=(v:unknown)=>v==null?null:Number(v);
const rows=(db:DatabaseSync,sql:string,id:string)=>db.prepare(sql).all(id) as DBRow[];
const parseArray=(v:unknown):string[]=>{const a=JSON.parse(str(v)||'[]');if(!Array.isArray(a)||!a.every(x=>typeof x==='string'))throw Error('Invalid source unmapped metadata');return a;};
export function readSQLiteSnapshot(db:DatabaseSync,buildId:string):Snapshot {
 db.exec('PRAGMA foreign_keys=ON');
 const build=db.prepare('SELECT id,name FROM builds WHERE id=?').get(buildId) as DBRow|undefined;
 if(!build)throw Error('Build not found');
 const rev=db.prepare('SELECT revision,updated_at FROM build_revisions WHERE build_id=?').get(buildId) as DBRow|undefined;
 if(!rev)throw Error('Build revision missing');
 const parts:Part[]=rows(db,'SELECT * FROM print_parts WHERE build_id=? ORDER BY id',buildId).map(p=>({
   id:str(p.id),name:str(p.name),section:str(p.section),source:str(p.source),material:str(p.material),
   required:opt(p.required_qty),opening:Number(p.opening_qty),accepted:0,installed:Number(p.installed_qty),notes:str(p.notes)
 }));
 const files:ModelFile[]=rows(db,'SELECT * FROM model_files WHERE build_id=? ORDER BY id',buildId).map(f=>({
   id:str(f.id),filename:str(f.filename),revision:str(f.revision_label),profile:str(f.profile),material:str(f.material),section:str(f.section),
   ...(f.source_hash!=null?{sourceHash:str(f.source_hash)}:{}),...(f.imported_at!=null?{importedAt:str(f.imported_at)}:{})
 }));
 const plates:Plate[]=rows(db,'SELECT * FROM plates WHERE build_id=? ORDER BY file_id,plate_number',buildId).map(p=>{
  const id=str(p.id);
  const mappings=rows(db,'SELECT * FROM plate_assignments WHERE build_id=? AND plate_id='+"'"+id.replaceAll("'","''")+"' ORDER BY id",buildId);
  const prep=db.prepare('SELECT * FROM plate_preparations WHERE build_id=? AND plate_id=?').get(buildId,id) as DBRow|undefined;
  const preparation:Preparation|undefined=prep?{
   runs:Number(prep.runs),material:str(prep.material),profile:str(prep.profile),sourceHash:str(prep.source_hash),
   notes:str(prep.notes),savedAt:str(prep.saved_at),
   // Compatibility shape until WP-03 removes the legacy attestation field.
   layoutConfirmed:true,
   items:(db.prepare('SELECT * FROM preparation_items WHERE build_id=? AND plate_id=? ORDER BY mapping_id').all(buildId,id) as DBRow[])
     .map(i=>({mappingId:str(i.mapping_id),included:!!i.included,copies:opt(i.copies),planned:opt(i.planned_qty)}))
  }:undefined;
  return {id,fileId:str(p.file_id),number:Number(p.plate_number),name:str(p.name),section:str(p.section),
    assignments:mappings.map(m=>({id:str(m.id),partId:str(m.part_id),copies:opt(m.copies),confirmed:!!m.confirmed,note:str(m.note)})),
    unmappedObjects:parseArray(p.unmapped_json),...(preparation?{preparation}:{})};
 });
 const jobs:Job[]=rows(db,'SELECT * FROM print_jobs WHERE build_id=? ORDER BY id',buildId).map(j=>{
  const id=str(j.id);
  const items:JobItem[]=(db.prepare('SELECT * FROM print_job_items WHERE build_id=? AND job_id=? ORDER BY line_no').all(buildId,id) as DBRow[]).map(i=>({
   partId:str(i.part_id),mappingId:str(i.mapping_id),fileId:str(i.file_id),fileRevision:str(i.file_revision),
   filename:str(i.filename),plateNumber:Number(i.plate_number),plateName:str(i.plate_name),runs:Number(i.runs),
   planned:Number(i.planned_qty),accepted:opt(i.accepted_qty),rejected:opt(i.rejected_qty),profile:str(i.profile),material:str(i.material),notes:str(i.notes)
  }));
  const draft=(db.prepare('SELECT * FROM inspection_drafts WHERE build_id=? AND job_id=? ORDER BY mapping_id').all(buildId,id) as DBRow[])
    .map(d=>({mappingId:str(d.mapping_id),accepted:opt(d.accepted_qty),rejected:opt(d.rejected_qty)}));
  return {id,kind:str(j.kind) as Job['kind'],status:str(j.status) as Job['status'],startedAt:str(j.started_at),finishedAt:str(j.finished_at),items,...(draft.length?{draft}:{})};
 });
 const purchaseParts:PurchasePart[]=(db.prepare('SELECT p.*,v.display_name vendor FROM purchase_parts p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.build_id=? ORDER BY p.id').all(buildId) as DBRow[]).map(p=>({
  id:str(p.id),category:str(p.category),name:str(p.description),specification:str(p.specification),
  requirement:str(p.designer_requirement),needed:opt(p.required_qty),onHand:opt(p.on_hand_qty),
  onOrder:null,toSource:null,supplier:str(p.vendor),orderedDate:str(p.ordered_date),receivedDate:'',notes:str(p.notes),link:str(p.product_url),packSize:null,
  status:p.required_qty==null||p.on_hand_qty==null?'Confirm quantity':Number(p.on_hand_qty)>=Number(p.required_qty)?'On hand':'Need to source'
 }));
 const snapshot:Snapshot={build:{id:buildId,name:str(build.name)},revision:String(rev.revision),recordedAt:str(rev.updated_at),
  parts,files,plates,jobs,audit:[],purchasing:{parts:purchaseParts,items:[],ledger:[]}};
 recalculate(snapshot);
 return snapshot;
}

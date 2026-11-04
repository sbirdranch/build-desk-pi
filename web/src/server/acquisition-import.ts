import type {DatabaseSync} from 'node:sqlite';
export type DesignerPart={id:string;description:string;required:number|null;category?:string;specification?:string;requirement?:string};
// Stable designer IDs scope reimports to this build. Missing rows are retained, never guessed away.
export function importAcquisitionParts(db:DatabaseSync,buildId:string,parts:DesignerPart[]){
 if(!Array.isArray(parts)||new Set(parts.map(p=>p.id)).size!==parts.length)throw Error('Designer part IDs must be unique.');
 for(const p of parts){
  if(typeof p.id!=='string'||!p.id.trim()||p.id.length>120||typeof p.description!=='string'||!p.description.trim()||p.description.length>2000)throw Error('Designer part ID and description are required.');
  if(p.required!==null&&!(Number.isSafeInteger(p.required)&&p.required>=0))throw Error('Designer required quantities must be nonnegative whole numbers or null.');
  for(const key of ['category','specification','requirement'] as const)if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key]!.length>2000))throw Error('Invalid designer '+key);
 }
 const stmt=db.prepare(`INSERT INTO purchase_parts(build_id,id,category,description,specification,designer_requirement,required_qty,on_hand_qty,ordered,notes)
 VALUES(?,?,?,?,?,?,?,0,0,'') ON CONFLICT(build_id,id) DO UPDATE SET category=excluded.category,description=excluded.description,specification=excluded.specification,designer_requirement=excluded.designer_requirement,required_qty=excluded.required_qty`);
 for(const p of parts)stmt.run(buildId,p.id,p.category||'',p.description,p.specification||'',p.requirement||'',p.required);
}

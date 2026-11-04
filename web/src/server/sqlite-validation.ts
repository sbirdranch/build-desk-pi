import assert from 'node:assert/strict';
import type {Snapshot} from '../core/types';
// Ordering is storage-specific; every business field must survive the boundary.
export function canonicalSnapshot(s:Snapshot){
 const sort=<T>(a:T[],key:(v:T)=>string)=>[...a].sort((a,b)=>key(a).localeCompare(key(b)));
 return {build:s.build,parts:sort(s.parts,p=>p.id),files:sort(s.files,f=>f.id),
  plates:sort(s.plates.map(p=>({...p,unmappedObjects:p.unmappedObjects||[],
   assignments:sort(p.assignments.map(a=>({...a,note:a.note||''})),a=>a.id),
   ...(p.preparation?{preparation:{...p.preparation,items:sort(p.preparation.items,i=>i.mappingId)}}:{})})),p=>p.id),
  jobs:sort(s.jobs.map(j=>({...j,...(j.draft?{draft:sort(j.draft,d=>d.mappingId)}:{})})),j=>j.id),audit:s.audit,purchasing:s.purchasing};
}
export function assertSnapshotsEqual(a:Snapshot,b:Snapshot){assert.deepEqual(JSON.parse(JSON.stringify(canonicalSnapshot(b))),JSON.parse(JSON.stringify(canonicalSnapshot(a))),'Migrated business snapshot differs from source');}

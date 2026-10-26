import type {Snapshot} from './types';
import {completionState} from './completion';

export const tally=(complete:number,total:number)=>({complete,total,percent:total?Math.round(complete/total*100):0});
export function buildProgress(snapshot:Snapshot){
 const partsFor=(plates:Snapshot['plates'])=>plates.flatMap(p=>p.assignments.flatMap(a=>snapshot.parts.filter(part=>part.id===a.partId)));
 const complete=(parts:Snapshot['parts'],plates:Snapshot['plates'])=>completionState(parts,plates.some(p=>!!p.unmappedObjects?.length))==='complete';
 const plateComplete=(p:Snapshot['plates'][number])=>complete(partsFor([p]),[p]);
 const fileComplete=(id:string)=>{const plates=snapshot.plates.filter(p=>p.fileId===id);return complete(partsFor(plates),plates)};
 const sectionNames=[...new Set([...snapshot.parts.map(p=>p.section),...snapshot.files.map(f=>f.section)])];
 const sections=sectionNames.map(name=>{const plates=snapshot.plates.filter(p=>p.section===name);return {name,plates:tally(plates.filter(plateComplete).length,plates.length),complete:complete(snapshot.parts.filter(p=>p.section===name),plates)}});
 return {parts:tally(snapshot.parts.filter(p=>completionState([p])==='complete').length,snapshot.parts.length),plates:tally(snapshot.plates.filter(plateComplete).length,snapshot.plates.length),files:tally(snapshot.files.filter(f=>fileComplete(f.id)).length,snapshot.files.length),categories:tally(sections.filter(s=>s.complete).length,sections.length),sections};
}

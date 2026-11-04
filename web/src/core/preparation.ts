import type {Plate,Preparation,ModelFile} from './types';
const whole=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
// One functional readiness definition for Save, Start and the browser. No acknowledgement flag.
export function preparationIssue(plate:Plate,prep:Preparation|undefined,file:ModelFile|undefined,materials:string[],hash:string|null|undefined,start=false):string|null {
 if(!prep)return 'Save a preparation before starting.';
 if(!whole(prep.runs,1)||prep.runs>100)return 'Plate runs must be between 1 and 100.';
 if(!file)return 'File not found.';
 if(!materials.includes(prep.material)||file.material.includes('TPU')!==prep.material.includes('TPU'))return 'Choose a configured material compatible with this project.';
 if(typeof prep.profile!=='string'||!prep.profile.trim())return 'Enter a print profile.';
 if(!hash||prep.sourceHash!==hash)return 'The saved preparation is stale or the source file cannot be read. Refresh it before saving or starting.';
 if(file.sourceHash&&file.sourceHash!==hash)return 'The source file changed. Reload Print Details before preparing it.';
 if(!Array.isArray(prep.items)||prep.items.length!==plate.assignments.length)return 'The plate membership changed. Refresh it.';
 if(new Set(prep.items.map(i=>i.mappingId)).size!==prep.items.length)return 'Duplicate preparation items.';
 const included=new Set<string>();
 for(const a of plate.assignments){
  const i=prep.items.find(i=>i.mappingId===a.id);
  if(!i)return 'A mapped part is missing.';
  if(typeof i.included!=='boolean')return 'Invalid include flag.';
  if(i.copies!==null&&!whole(i.copies))return 'Copies must be nonnegative whole numbers.';
  if(i.planned!==null&&!whole(i.planned))return 'Planned quantity must be a nonnegative whole number.';
  if(i.included){
   if(!whole(i.copies,1)||!whole(i.planned,1))return 'Each included part needs positive enabled copies and planned quantities.';
   if(included.has(a.partId))return 'Combine duplicate part mappings before starting.';
   included.add(a.partId);
  }
 }
 if(start&&plate.unmappedObjects?.length)return 'Match the unknown plate objects before starting.';
 if(start&&!included.size)return 'Include at least one part.';
 return null;
}
export function preparationData(p:Preparation):Preparation {
 return {runs:p.runs,material:p.material,profile:p.profile,sourceHash:p.sourceHash,items:p.items.map(i=>({mappingId:i.mappingId,included:i.included,copies:i.copies,planned:i.planned})),notes:p.notes,savedAt:p.savedAt};
}

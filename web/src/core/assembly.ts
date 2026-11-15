import manual from './assembly-manual.json';
export {manual};
export type AssemblyRecord={id:string;completed:boolean;notes:string;updatedAt:string;completedAt:string};
export function assemblyProgress(records:AssemblyRecord[],phase?:number){
 const steps=manual.steps.filter(s=>phase===undefined||s.phase===phase);
 const completed=steps.filter(s=>records.some(r=>r.id===s.id&&r.completed)).length;
 return {total:steps.length,completed,percent:steps.length?completed/steps.length*100:0,next:steps.find(s=>!records.some(r=>r.id===s.id&&r.completed))};
}

import type {Job,ResultInput} from './types';
export function inspectionResults(job:Job):ResultInput[]{
 return job.items.map(item=>{const saved=job.draft?.find(r=>r.mappingId===item.mappingId);return {mappingId:item.mappingId,accepted:saved?(saved.accepted??0):(item.accepted??0),rejected:saved?(saved.rejected??0):(item.rejected??0)}});
}
export function updateInspection(job:Job,current:ResultInput[],mappingId:string,field:'accepted'|'rejected',value:number|null):ResultInput[]{
 return inspectionResults(job).map(row=>{const result=current.find(r=>r.mappingId===row.mappingId)||row;return result.mappingId===mappingId?{...result,[field]:value??0}:{...result}});
}

export type AcquisitionPart={id:string;category:string;description:string;specification:string;requirement:string;required:number|null;onHand:number|null;ordered:boolean;vendor:string;url:string;alternateUrl:string;orderedDate:string;notes:string};
export type Acquisition={parts:AcquisitionPart[];vendors:string[]};
export type AcquisitionEdit=Pick<AcquisitionPart,'onHand'|'ordered'|'vendor'|'url'|'alternateUrl'|'orderedDate'|'notes'>;
export type AcquisitionCommand={type:'save-acquisition';partId:string;fields:AcquisitionEdit};
export const available=(p:Pick<AcquisitionPart,'onHand'|'required'>)=>p.onHand!==null&&p.required!==null&&p.onHand>=p.required;
export const vendorKey=(name:string)=>name.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
export const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function validProductURL(s:string){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password}catch{return false}}
export function validateEdit(input:AcquisitionEdit):AcquisitionEdit {
 if(!input||typeof input!=='object')throw Error('Provide purchasing fields.');
 if(input.onHand!==null&&!(Number.isSafeInteger(input.onHand)&&input.onHand>=0))throw Error('On hand must be a nonnegative whole number or blank for unknown.');
 if(typeof input.ordered!=='boolean')throw Error('Ordered must be checked or unchecked.');
 for(const [field,max] of [['vendor',200],['url',2000],['orderedDate',10],['notes',200]] as const)if(typeof input[field]!=='string'||input[field].length>max)throw Error('Invalid '+field+'.');
 const alternateUrl=input.alternateUrl;
 if(typeof alternateUrl!=='string'||alternateUrl.length>2000)throw Error('Invalid alternate URL.');
 if(alternateUrl&&!validProductURL(alternateUrl))throw Error('Use an http:// or https:// alternate link, or leave it blank.');
 if(input.notes&&!/^[\x20-\x7e\r\n\t]*$/.test(input.notes))throw Error('Notes must use plain ASCII text (up to 200 characters).');
 if(input.url&&!validProductURL(input.url))throw Error('Use an http:// or https:// product link, or leave it blank.');
 if(input.orderedDate&&!validDate(input.orderedDate))throw Error('Choose a valid order date or leave it blank.');
 return {onHand:input.onHand,ordered:input.ordered,vendor:input.vendor.trim().replace(/\s+/g,' '),url:input.url.trim(),alternateUrl:alternateUrl.trim(),orderedDate:input.orderedDate,notes:input.notes};
}
export function acquisitionProgress(parts:AcquisitionPart[]){
 const required=parts.filter(p=>p.required!==null&&p.required>0);
 const units=required.reduce((n,p)=>n+p.required!,0),stock=required.reduce((n,p)=>n+Math.min(p.onHand??0,p.required!),0);
 const ordered=required.filter(p=>p.ordered).length;
 return {units,stock,ordered,types:required.length,available:parts.filter(available).length,unknown:parts.filter(p=>p.required===null||p.onHand===null).length,availablePercent:units?100*stock/units:0,orderedPercent:required.length?100*ordered/required.length:0};
}
export function filteredParts(parts:AcquisitionPart[],filter:string,query:string){const q=query.trim().toLowerCase();return parts.filter(p=>(filter==='all'||filter==='ordered'&&p.ordered||filter==='available'&&available(p)||filter==='not-available'&&!available(p))&&[p.id,p.description,p.specification,p.category,p.vendor].join(' ').toLowerCase().includes(q));}
export function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function toggleOrdered(fields:AcquisitionEdit,updateDate:boolean,today:string):AcquisitionEdit{return {...fields,ordered:!fields.ordered,orderedDate:updateDate?today:fields.orderedDate};}

export function acquisitionStatus(p:Pick<AcquisitionPart,'onHand'|'required'|'ordered'>){return available(p)?'available':p.ordered?'ordered':'unavailable';}
export function acquisitionStatusGroups(parts:AcquisitionPart[]):[string,AcquisitionPart[]][]{return [['Not Yet Available',parts.filter(p=>acquisitionStatus(p)==='unavailable')],['Ordered',parts.filter(p=>acquisitionStatus(p)==='ordered')],['Available',parts.filter(p=>acquisitionStatus(p)==='available')]];}

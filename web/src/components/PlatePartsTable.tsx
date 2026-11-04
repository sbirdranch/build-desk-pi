'use client';
import {ChevronRight} from 'lucide-react';
import type {Part,Assignment,Asset} from '@/core/types';
import {assetURL} from './Media';
export type QuantityDraft={required:number|null;installed:number};
export default function PlatePartsTable({parts,assignments,buildId,assetFor,preparedQuantities,onReview,drafts,editable,busy,onChange,onOpen,onSave,onDiscard}:{parts:Part[];assignments:Assignment[];buildId:string;assetFor:(id:string)=>Asset|undefined;preparedQuantities:string[];onReview:()=>void;drafts:Record<string,QuantityDraft>;editable:boolean;busy:boolean;onChange:(id:string,value:QuantityDraft)=>void;onOpen:(id:string)=>void;onSave:()=>void;onDiscard:()=>void}) {
 const changed=Object.keys(drafts).length>0;
 return <div className="plate-parts-editor">
  <div className="table-actions"><span className="muted small">Required and installed quantities apply to the part across all plates.</span>{editable&&<div><button disabled={busy||!changed} onClick={onDiscard}>Discard</button><button className="primary" disabled={busy||!changed} onClick={onSave}>Save quantities</button></div>}</div>
  <div className="table-wrap"><table><thead><tr><th>Part</th><th>Required</th><th>Accepted</th><th>Installed</th><th>Remaining</th><th>Status</th><th/></tr></thead><tbody>{parts.map(p=>{
   const draft=drafts[p.id]||{required:p.required,installed:p.installed},asset=assetFor(p.id),assignment=assignments.find(a=>a.partId===p.id);
   const status=draft.required===null?'Qty to confirm':p.accepted>=draft.required?'Completed':p.accepted>0?'Partial':'Not printed';
   return <tr key={p.id} className={drafts[p.id]?'changed-row':''}>
    <td><button className="part-link" onClick={()=>onOpen(p.id)}>{asset?.thumbnail&&<img src={assetURL(buildId,asset.thumbnail)} alt="" loading="lazy"/>}<span>{p.name}<small>{p.id}</small>{assignment?.note?.startsWith('Split STL')&&<small className="attention">Split component · print quantity needs review</small>}</span></button>{assignment?.note?.startsWith('Split STL')&&(preparedQuantities.includes(assignment.id)?<small className="quantity-saved">Print quantity saved</small>:<button className="quantity-review" disabled={!editable||busy||changed} onClick={onReview}>Review print quantity</button>)}</td>
    <td>{editable?<input aria-label={'Required '+p.name} type="number" min="0" value={draft.required??''} placeholder="—" disabled={busy} onChange={e=>onChange(p.id,{...draft,required:e.target.value===''?null:Number(e.target.value)})}/>:draft.required??'—'}</td>
    <td>{p.accepted}</td>
    <td>{editable?<input aria-label={'Installed '+p.name} type="number" min="0" max={p.accepted} value={draft.installed} disabled={busy} onChange={e=>onChange(p.id,{...draft,installed:Number(e.target.value)})}/>:draft.installed}</td>
    <td>{draft.required===null?'—':Math.max(0,draft.required-p.accepted)}</td><td><span className="badge">{status}</span></td>
    <td><button className="icon-button" aria-label={'Open '+p.name} onClick={()=>onOpen(p.id)}><ChevronRight size={16}/></button></td>
   </tr>;
  })}</tbody></table></div>
 </div>;
}

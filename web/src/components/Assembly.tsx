'use client';
import {useCallback,useEffect,useState} from 'react';
import {Search,ArrowLeft,ChevronDown,ChevronRight,CircleCheck,CircleDashed,Circle,Truck} from 'lucide-react';
import type {BuildView,Command} from '@/core/types';
import {assemblyProgress,manual} from '@/core/assembly';
import InstrumentGauge from './InstrumentGauge';
import {Modal} from './Media';
type Guard=(next:()=>void)=>void;
export default function Assembly({view,editable,busy,perform,onDirty,onNavigationGuard}:{view:BuildView;editable:boolean;busy:boolean;perform:(c:Command)=>Promise<boolean>;onDirty:(v:boolean)=>void;onNavigationGuard:(g:Guard|null)=>void}){
 const [selected,setSelected]=useState(''),[selectedPhase,setSelectedPhase]=useState<number|null>(null),[expanded,setExpanded]=useState<Set<string>>(new Set(['vehicle'])),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const [fields,setFields]=useState({completed:false,notes:''}),[pending,setPending]=useState<(()=>void)|null>(null);
 const records=view.snapshot.assembly||[],step=manual.steps.find(s=>s.id===selected),record=records.find(r=>r.id===selected);
 const original={completed:record?.completed||false,notes:record?.notes||''};
 const dirty=!!step&&JSON.stringify(fields)!==JSON.stringify(original);
 const navigate=useCallback((next:()=>void)=>{if(busy)return;if(dirty)setPending(()=>next);else next()},[busy,dirty]);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty,onDirty]);
 useEffect(()=>{onNavigationGuard(navigate);return()=>onNavigationGuard(null)},[navigate,onNavigationGuard]);
 useEffect(()=>{if(!dirty)setFields(original)},[view.snapshot.revision]);
 const choose=(id='',targetPhase:number|null=null)=>navigate(()=>{const r=records.find(r=>r.id===id);setSelected(id);setSelectedPhase(targetPhase);setFields({completed:r?.completed||false,notes:r?.notes||''})});
 const toggle=(key:string)=>setExpanded(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next});
 const completionIcon=(total:number,completed:number)=>{
  const state=total>0&&completed===total?'complete':completed>0?'partial':'not-printed';
  const Icon=state==='complete'?CircleCheck:state==='partial'?CircleDashed:Circle;
  const label=state==='complete'?'Complete':state==='partial'?'Partially complete':'Not started';
  return <span className={'tree-completion '+state} role="img" aria-label={label} title={label}><Icon size={13}/></span>;
 };
 async function save(){if(!editable||!step)return false;return perform({type:'save-assembly',stepId:step.id,...fields})}
 const configured=view.config.assembly?.manual===manual.id;
 const progress=assemblyProgress(records);
 const url='/api/builds/'+encodeURIComponent(view.config.id)+'/assembly/manual';
 const link=(page=1)=>url+'#page='+page;
 const matches=(s:(typeof manual.steps)[number])=>(filter==='all'||(records.some(r=>r.id===s.id&&r.completed)?filter==='completed':filter==='remaining'))&&(`${s.label} ${manual.phases[s.phase-1]} ${records.find(r=>r.id===s.id)?.notes||''}`).toLowerCase().includes(query.toLowerCase());
 if(!configured)return <main className="detail"><h1>Assembly</h1><p>No assembly manual is configured for this build.</p></main>;
 return <div className="workspace acquisition-workspace assembly-workspace"><aside className="sidebar acquisition-sidebar">
  <label className="search"><Search size={16}/><input aria-label="Search assembly steps" placeholder="Search steps or notes..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="acquisition-filters">{[['all','All'],['remaining','Remaining'],['completed','Completed']].map(([id,label])=><button key={id} aria-pressed={filter===id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>
  <nav className="tree assembly-tree" aria-label="Assembly hierarchy">
   <div className="tree-row root">
    <button className="disclosure" aria-label="Expand or collapse vehicle" aria-expanded={expanded.has('vehicle')} onClick={()=>toggle('vehicle')}>{expanded.has('vehicle')?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>
    <button className={!selected&&selectedPhase===null?'selected':''} onClick={()=>choose()}><Truck size={15}/><span className="tree-label">{view.config.name}</span><span className="tree-decorators">{completionIcon(progress.total,progress.completed)}</span></button>
   </div>
   {expanded.has('vehicle')&&manual.phases.map((name,i)=>{
    const number=i+1,phaseSteps=manual.steps.filter(s=>s.phase===number),visible=phaseSteps.filter(matches),phaseProgress=assemblyProgress(records,number),key='phase:'+number;
    if(!visible.length)return null;
    return <div className="tree-level" key={key}>
     <div className="tree-row">
      <button className="disclosure" aria-label={'Expand '+name} aria-expanded={expanded.has(key)} onClick={()=>toggle(key)}>{expanded.has(key)?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>
      <button className={selectedPhase===number?'selected':''} onClick={()=>choose('',number)}><span className="tree-label">{number}. {name}</span><span className="tree-decorators">{completionIcon(phaseProgress.total,phaseProgress.completed)}</span></button>
     </div>
     {expanded.has(key)&&visible.map(s=><div className="tree-level" key={s.id}><div className="tree-row assembly-step-row">
      <span className="assembly-leaf-spacer" aria-hidden="true"/>
      <button className={selected===s.id?'selected':''} aria-current={selected===s.id?'page':undefined} onClick={()=>choose(s.id)}><span className="tree-label">{s.label}</span><span className="tree-decorators">{completionIcon(1,records.some(r=>r.id===s.id&&r.completed)?1:0)}</span></button>
     </div></div>)}
    </div>;
   })}
  </nav>
 </aside><main className="detail acquisition-detail">
  <div className="page-heading"><div><p className="eyebrow">{view.config.name}</p><h1>{step?step.label:selectedPhase!==null?`${selectedPhase}. ${manual.phases[selectedPhase-1]}`:'Assembly'}</h1></div><a className="assembly-pdf-link" href={link(step?.page)} target="_blank" rel="noreferrer">Open instruction PDF{step?' · page '+step.page:''}</a></div>
  {!step?<><p className="muted">{selectedPhase===null?"Follow the five build phases and keep your workshop notes with each step.":`Phase ${selectedPhase} · ${manual.phases[selectedPhase-1]}`}</p><div className="acquisition-gauges"><div className="acquisition-gauge-card"><InstrumentGauge label="Assembly complete" value={progress.percent} detail={`${progress.completed} of ${progress.total} steps complete`}/><button disabled={!progress.next||busy} onClick={()=>choose(progress.next?.id)}>Continue{progress.next?' with '+progress.next.label:' · all steps complete'}</button></div><div className="assembly-overview-summary"><h2>Build progress</h2><p><strong>{progress.total-progress.completed}</strong> steps remaining</p><p><strong>{records.filter(r=>r.notes).length}</strong> {records.filter(r=>r.notes).length===1?'step':'steps'} with notes</p><p className="muted small">Completion is recorded separately for each build. Step 89b is included.</p></div></div>
   <div className="summary-list">{manual.phases.map((name,i)=>{const p=assemblyProgress(records,i+1);return <button className="summary-row assembly-phase-row" key={name} onClick={()=>{setFilter('all');setQuery('');choose('',i+1);setExpanded(prev=>new Set([...prev,'vehicle','phase:'+(i+1)]))}}><span><strong>{i+1}. {name}</strong><small>{p.completed} / {p.total} steps complete</small></span><progress aria-label={name+' completion'} max={p.total} value={p.completed}/></button>})}</div><h2>Reference drawings</h2><div className="actions">{manual.references.map(r=><a key={r.page} href={link(r.page)} target="_blank" rel="noreferrer">{r.label} · page {r.page}</a>)}</div>
  </>:<><button onClick={()=>choose()} disabled={busy}><ArrowLeft size={16}/>Assembly overview</button><p className="eyebrow">Phase {step.phase} · {manual.phases[step.phase-1]}</p><p>Use the original instruction drawing on <a href={link(step.page)} target="_blank" rel="noreferrer">PDF page {step.page}</a>.</p><div className="assembly-work-item"><label className="assembly-completion"><input type="checkbox" disabled={!editable||busy} checked={fields.completed} onChange={e=>setFields({...fields,completed:e.target.checked})}/>Step completed</label><label>Work item notes<textarea aria-label="Work item notes" maxLength={4000} rows={8} disabled={!editable||busy} value={fields.notes} onChange={e=>setFields({...fields,notes:e.target.value})}/></label><small className="muted">{fields.notes.length} / 4000 characters{record?.updatedAt?' · Last saved '+new Date(record.updatedAt).toLocaleString():''}</small><div className="save-bar"><span role="status">{busy?'Saving...':dirty?'Unsaved changes':'Step details'}</span><button disabled={busy||!dirty} onClick={()=>setFields(original)}>Discard</button><button className="primary" disabled={busy||!editable||!dirty} onClick={save}>Save step</button></div></div><div className="actions"><button disabled={busy||manual.steps.indexOf(step)===0} onClick={()=>choose(manual.steps[manual.steps.indexOf(step)-1]?.id)}>Previous step</button><button disabled={busy||manual.steps.indexOf(step)===manual.steps.length-1} onClick={()=>choose(manual.steps[manual.steps.indexOf(step)+1]?.id)}>Next step</button></div>{!editable&&<p className="muted">This view is read-only.</p>}</>}
 </main>{pending&&<Modal title="Unsaved assembly changes" onClose={()=>setPending(null)}><p>Save your changes before leaving this step?</p><div className="actions"><button disabled={busy} onClick={()=>setPending(null)}>Stay here</button><button disabled={busy} onClick={()=>{const go=pending;setPending(null);go()}}>Discard changes</button><button className="primary" disabled={busy||!editable} onClick={async()=>{if(await save()){const go=pending;setPending(null);go()}}}>Save and continue</button></div></Modal>}</div>;
}

import InstrumentGauge from './InstrumentGauge';
import {buildProgress} from '@/core/progress';
import type {Snapshot} from '@/core/types';

export default function BuildProgress({snapshot}:{snapshot:Snapshot}){
 const totals=buildProgress(snapshot);
 const metrics=[{label:'Parts complete',value:totals.parts,help:'Accepted quantity meets or exceeds required quantity. Unconfirmed quantities remain incomplete.'},{label:'Plates complete',value:totals.plates,help:'All mapped parts meet their required accepted quantities, with no unmatched objects.'}];
 return <><div className="build-progress printing-gauges" aria-label="Vehicle progress">{metrics.map(({label,value,help})=><div className="printing-gauge" key={label} title={help}><InstrumentGauge label={label} value={value.percent} detail={value.complete+' of '+value.total}/></div>)}</div><p className="progress-note">{snapshot.parts.reduce((n,p)=>n+p.accepted,0)} accepted units recorded · Completion matches the build tree and uses accepted part quantities.</p></>;
}

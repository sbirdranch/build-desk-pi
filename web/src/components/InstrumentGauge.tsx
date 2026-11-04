import {useId} from 'react';
export default function InstrumentGauge({label,value,detail}:{label:string;value:number;detail:string}){
 const id=useId().replaceAll(':','');const angle=-125+Math.max(0,Math.min(100,value))*2.5;
 return <figure className="instrument"><svg viewBox="0 0 220 192" role="img" aria-label={`${label}: ${Math.round(value)} percent. ${detail}`}>
  <defs><linearGradient id={id+'rim'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#8a918e"/><stop offset=".25" stopColor="#303b41"/><stop offset=".5" stopColor="#66716f"/><stop offset="1" stopColor="#1e272d"/></linearGradient><radialGradient id={id+'face'}><stop stopColor="#26333b"/><stop offset="1" stopColor="#111c23"/></radialGradient></defs>
  <circle cx="110" cy="101" r="88" fill={'url(#'+id+'rim)'} stroke="#080f14" strokeWidth="2"/><circle cx="110" cy="101" r="81" fill={'url(#'+id+'face)'} stroke="#7f8b86" strokeOpacity=".4"/>
  {Array.from({length:51},(_,i)=>{const a=(-125+i*5)*Math.PI/180,r=i%5===0?66:71;return <line key={i} x1={110+Math.sin(a)*r} y1={101-Math.cos(a)*r} x2={110+Math.sin(a)*76} y2={101-Math.cos(a)*76} stroke={i%5===0?'#bdc5bc':'#6b7778'} strokeWidth={i%5===0?1.5:0.7}/>})}
  {[0,25,50,75,100].map(n=>{const a=(-125+n*2.5)*Math.PI/180;return <text key={n} x={110+Math.sin(a)*54} y={105-Math.cos(a)*54} textAnchor="middle" fill="#b8c1ba" fontSize="10">{n}</text>})}
  <text x="110" y="80" textAnchor="middle" fill="#85968e" fontSize="8" letterSpacing="2">BUILD DESK</text>
  <g transform={`rotate(${angle} 110 101)`}><path d="M107 113 L109 40 L112 113 Z" fill="#d3ad69"/><path d="M110 42 L112 113" stroke="#eed6a0" strokeWidth=".7"/></g><circle cx="110" cy="101" r="7" fill="#9eaa9f" stroke="#101a20" strokeWidth="3"/>
  <rect x="80" y="133" width="60" height="25" rx="3" fill="#0c161c" stroke="#495b5e"/><text x="110" y="151" textAnchor="middle" fill="#e3e8de" fontSize="17" fontFamily="monospace">{Math.round(value)}%</text>
  {[[-65,-52],[65,-52],[-65,52],[65,52]].map(([x,y],i)=><g key={i}><circle cx={110+x} cy={101+y} r="2" fill="#a0aaa0"/><path d={`M${108+x} ${101+y}h4`} stroke="#334047" strokeWidth=".8"/></g>)}
 </svg><figcaption><strong>{label}</strong><span>{detail}</span></figcaption></figure>;
}

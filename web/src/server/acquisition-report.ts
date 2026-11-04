import PDFDocument from 'pdfkit';
import path from 'node:path';
import {available,acquisitionProgress,type Acquisition} from '../core/acquisition';
// Text is wrapped and measured before rows are drawn; no fixed-height clipping.
export async function acquisitionReport(build:{id:string;name:string},data:Acquisition,kind:'source'|'status',now=new Date()):Promise<Buffer>{
 const font=path.resolve(process.cwd(),'fonts/DejaVuSans.ttf');
 const doc=new PDFDocument({size:'A4',layout:'landscape',margin:32,bufferPages:true,font,info:{Title:kind==='source'?'Parts Source List':'Parts Status',Author:'Build Desk Pi'}});
 const chunks:Buffer[]=[];const output=new Promise<Buffer>((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 const title=kind==='source'?'Parts Source List':'Parts Status',date=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeZone:'America/New_York'}).format(now);
 const widths=kind==='source'?[94,260,55,115,254]:[94,360,84,84,156];
 const headings=kind==='source'?['Part ID','Description / specification','Required','Vendor','Product URL']:['Part ID','Description / specification','Required','On hand','Ordered'];
 let y=0,page=0,section='';
 const tableHeader=()=>{let x=32;doc.rect(32,y,778,23).fill('#253641');doc.fontSize(9).fillColor('#ffffff');headings.forEach((h,i)=>{doc.text(h,x+7,y+6,{width:widths[i]-14,lineBreak:false});x+=widths[i]});y+=23};
 const newPage=()=>{if(page)doc.addPage();page++;doc.fillColor('#1b2c38').fontSize(20).text(title,32,27,{lineBreak:false});doc.fontSize(10).fillColor('#50616c').text(build.name+'  |  '+build.id+'  |  '+date,32,56,{lineBreak:false});y=83;if(section){doc.fontSize(12).fillColor('#243c48').text(section,32,y,{lineBreak:false});y+=22;}tableHeader()};
 newPage();let rowNo=0;
 const parts=[...data.parts].sort((a,b)=>a.id.localeCompare(b.id));
 const groups: [string,typeof parts][]=kind==='source'?[['',parts]]:[['Not Yet Available',parts.filter(p=>!available(p))],['Available',parts.filter(available)]];
 for(const [label,rows] of groups){
  if(label){section=label;if(y>460)newPage();else{doc.fontSize(12).fillColor('#243c48').text(label+' ('+rows.length+')',32,y+12,{lineBreak:false});y+=36;}}
  if(!rows.length){doc.fontSize(9).fillColor('#65737c').text('No parts in this section.',39,y+8);y+=32;continue;}
  for(const p of rows){
   const description=p.description+(p.specification?' - '+p.specification:'');
   const values=kind==='source'?[p.id,description,p.required===null?'Unknown':String(p.required),p.vendor,p.url]:[p.id,description,p.required===null?'Unknown':String(p.required),p.onHand===null?'Unknown':String(p.onHand),p.ordered?'Yes':'No'];
   doc.fontSize(9);const height=Math.max(28,...values.map((v,i)=>doc.heightOfString(v||' ',{width:widths[i]-14,lineGap:2})+14));
   if(height>400)throw Error('A part description is too long to fit the report. Shorten the source description.');
   if(y+height>548)newPage();
   if(rowNo++%2===0)doc.rect(32,y,778,height).fill('#f0f3f3');
   let x=32;values.forEach((v,i)=>{doc.fillColor(kind==='source'&&i===4&&p.url?'#225b7e':'#20313d').text(v,x+7,y+7,{width:widths[i]-14,lineGap:2,...(kind==='source'&&i===4&&p.url?{link:p.url,underline:true}:{})});x+=widths[i]});
   y+=height;doc.moveTo(32,y).lineTo(810,y).strokeColor('#d8dfe0').lineWidth(.4).stroke();
  }
 }
 const progress=acquisitionProgress(data.parts);
 if(y+35>548)newPage();
 doc.fillColor('#50616c').fontSize(9).text(`${parts.length} parts | ${progress.available} Available | ${parts.length-progress.available} Not Yet Available | ${parts.filter(p=>p.ordered).length} Ordered`,32,y+14,{lineBreak:false});
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.fillColor('#6a7881').fontSize(8).text('Build Desk Pi  /  '+build.name,32,566,{lineBreak:false});doc.text((i+1)+' / '+range.count,755,566,{width:55,align:'right',lineBreak:false});}
 doc.end();return output;
}

// Disposable sample workbook and cached events; no live tracker or Drive credentials.
import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'web/package.json')),ExcelJS=require('exceljs');
const dir=path.join(root,'web/test-output/order-process',randomUUID());
await mkdir(dir,{recursive:true});
const workbook=new ExcelJS.Workbook();
for(const name of ['Printed Parts Checklist','3MF Project Register','Part-to-Plate Mapping','Print Job History'])workbook.addWorksheet(name).addRow(['ID']);
const parts=workbook.addWorksheet('Parts Checklist');
parts.addRow(['Part ID','Category','Part','Specification','Requirement','Qty Needed','Qty On Hand','Qty On Order','Qty To Source','Status','Chosen Supplier','Ordered Date','Received Date','Bernie Link','Notes']);
const orders=workbook.addWorksheet('Order Log');
orders.addRow(['Order ID','Part ID','Supplier','Seller','Order Date','Ordered Qty','Unit Price','Line Subtotal','Shipping','Tax / Duties','Total','Received Date','Received Qty','Order Link / Number','Notes','Part Name']);
const examples=[['motor','K745-009','Steering worm gear motor',1,'31.48'],['coupler','sample-coupler','6-mm rigid couplers',6,'12.00'],['gearmotor','sample-gearmotor','Drive gearmotor',1,'25.00']];
const files=[];
for(const [name,id,title,quantity,total] of examples){
 const raw=await readFile(path.join(root,'web/tests/fixtures/order-process',name+'.json'),'utf8'),event=JSON.parse(raw);
 parts.addRow([id,'Test samples',title,'','Required',quantity,0,quantity,0,'Ordered','AliExpress','','','','Sample values; not live purchasing data']);
 orders.addRow([event.order_number,id,'AliExpress','Sample seller','2026-10-16',quantity,null,null,null,null,total,'',0,'','Preserve this sample note',title]);
 files.push({id:'sample-'+name,name:name+'.json',raw});
}
const filename=path.join(dir,'Sample.xlsx');await workbook.xlsx.writeFile(filename);
const queueDir=path.join(dir,'local-data/kitten-745/order-updates');await mkdir(queueDir,{recursive:true});
await writeFile(path.join(queueDir,'cache.json'),JSON.stringify({lastCheck:null,error:'Isolated sample queue. Google Drive is not connected.',files,acknowledged:[]}));
const registry=JSON.parse(await readFile(path.join(root,'config/builds.json'),'utf8')),build=registry.builds[0];
build.name='Order Process Improvements — SAMPLE DATA';build.store.path=filename;build.printer={id:'order-process-test',name:'Disconnected test printer'};build.models.directory=dir;build.assets.root=dir;registry.builds=[build];
const registryFile=path.join(dir,'builds.json');await writeFile(registryFile,JSON.stringify(registry));
const out=await open(path.join(dir,'server.log'),'a'),err=await open(path.join(dir,'server.err.log'),'a');
const port=process.env.PORT||'4176';
const child=spawn(process.execPath,['server.mjs'],{cwd:path.join(root,'web'),env:{...process.env,PORT:port,BUILDDESK_HOST:'127.0.0.1',BUILDDESK_DISABLE_MONITOR:'1',BUILDDESK_QUEUE_ROOT:dir,BUILDDESK_REGISTRY:registryFile},detached:true,windowsHide:true,stdio:['ignore',out.fd,err.fd]});child.unref();
await writeFile(path.join(root,'web/test-output/order-process/latest.json'),JSON.stringify({pid:child.pid,dir,url:'http://127.0.0.1:'+port}));
console.log('Sample app: http://127.0.0.1:'+port+' (PID '+child.pid+'). All saves stay in '+dir);

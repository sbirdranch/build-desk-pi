import {readFile, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url=`http://127.0.0.1:${Number(process.env.PORT||4174)}/`;
const action=process.argv[2];
if(!['status','stop'].includes(action))throw Error('Use status or stop.');
let health;
try {
 const response=await fetch(url+'api/health',{signal:AbortSignal.timeout(2000)});
 if(!response.ok)throw Error('Health endpoint failed');
 health=await response.json();
} catch {
 console.log('Build Desk is not responding on '+url);
 process.exit(action==='status'?1:0);
}
if(health.application!=='Build Desk'||!Number.isInteger(health.pid))throw Error('Port 4174 did not identify itself as the local Build Desk server.');
if(action==='status'){
 console.log(`Build Desk is running: ${url} (PID ${health.pid})`);
}else{
 const saved=Number(await readFile(path.join(root,'local-data/app.pid'),'utf8'));
 if(saved!==health.pid)throw Error('Saved PID does not match the running server. Nothing was stopped.');
 process.kill(saved);
 let stopped=false;
 for(let n=0;n<40;n++){
  try{process.kill(saved,0)}catch{stopped=true;break}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!stopped)throw Error('Server has not exited yet. Check status again.');
 await unlink(path.join(root,'local-data/app.pid')).catch(()=>{});
 console.log('Build Desk stopped.');
}

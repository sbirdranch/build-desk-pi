import {spawn} from 'node:child_process';
import {mkdir,open,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url=`http://127.0.0.1:${Number(process.env.PORT||4174)}/`;
async function ready(){try{const r=await fetch(url+'api/builds',{signal:AbortSignal.timeout(1000)});return r.ok&&Array.isArray(await r.json())}catch{return false}}
if(process.argv.includes('--restart')&&await ready()){
 const saved=Number(await readFile(path.join(root,'local-data/app.pid'),'utf8'));
 const health=await fetch(url+'api/health').then(r=>r.json());
 if(health.application!=='Build Desk'||health.pid!==saved)throw Error('The running service does not match the saved process ID; it was not stopped.');
 process.kill(saved);
 for(let n=0;n<30&&await ready();n++)await new Promise(r=>setTimeout(r,250));
}
if(!await ready()){
 await mkdir(path.join(root,'local-data'),{recursive:true});
 const out=await open(path.join(root,'local-data/app.log'),'a'),err=await open(path.join(root,'local-data/app.err.log'),'a');
 const child=spawn(process.execPath,['server.mjs'],{cwd:path.join(root,'web'),detached:true,windowsHide:true,stdio:['ignore',out.fd,err.fd]});
 child.unref();await writeFile(path.join(root,'local-data/app.pid'),String(child.pid));
 for(let n=0;n<30&&!await ready();n++)await new Promise(r=>setTimeout(r,500));
 if(!await ready())throw Error('Build Desk did not start. Check local-data/app.err.log. Run npm --prefix web run build first.');
}
console.log('Build Desk is ready: '+url);
if(process.argv.includes('--open')){
 const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
 const args=process.platform==='win32'?['/c','start','',url]:[url];
 const child=spawn(command,args,{windowsHide:true,stdio:'ignore'});
 child.on('error',()=>console.log('Open this address in your browser: '+url));
 child.unref();
}

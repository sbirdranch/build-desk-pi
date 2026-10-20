import {spawn} from 'node:child_process';
import {access,mkdir,open,writeFile} from 'node:fs/promises';
import {createConnection} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url='http://127.0.0.1:4176/';
const identity=path.join(root,'local-data/pi-user-key');
async function ready(){try{const r=await fetch(url+'api/health',{signal:AbortSignal.timeout(2500)});return r.ok&&(await r.json()).application==='Build Desk'}catch{return false}}
async function occupied(){return new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port:4176});const finish=value=>{socket.destroy();resolve(value)};socket.setTimeout(1000);socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.once('timeout',()=>finish(false));})}
if(!await ready()){
 if(await occupied())throw Error('Port 4176 is already forwarded or occupied, but the Pi app is not responding. Check the Pi service before opening another tunnel.');
 try{await access(identity)}catch{throw Error('The Windows-user SSH key is missing or unreadable: '+identity)}
 await mkdir(path.join(root,'local-data'),{recursive:true});
 const log=await open(path.join(root,'local-data/pi-user-tunnel.err.log'),'a');
 const child=spawn('ssh',['-N','-i',identity,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','UserKnownHostsFile='+path.join(root,'local-data/pi-known-hosts'),'-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-L','127.0.0.1:4176:127.0.0.1:4174','preston@192.168.0.119'],{detached:true,windowsHide:true,stdio:['ignore','ignore',log.fd]});
 let failure;child.on('error',error=>{failure=error});child.unref();await log.close();
 if(child.pid)await writeFile(path.join(root,'local-data/pi-user-tunnel.pid'),String(child.pid));
 for(let n=0;n<20&&!failure&&!await ready();n++)await new Promise(resolve=>setTimeout(resolve,500));
 if(failure)throw failure;
 if(!await ready())throw Error('The Pi app did not respond. Check local-data/pi-user-tunnel.err.log and the Pi service.');
}
console.log('Build Desk Pi: '+url);
if(process.argv.includes('--open')){
 const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
 const args=process.platform==='win32'?['/c','start','',url]:[url];
 const child=spawn(command,args,{windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log('Open the address above in your browser.'));child.unref();
}

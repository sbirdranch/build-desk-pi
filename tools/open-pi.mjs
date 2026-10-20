import {spawn} from 'node:child_process';

const url='http://192.168.0.119:4174/';
try{
 const response=await fetch(url+'api/health',{signal:AbortSignal.timeout(10000)});
 if(!response.ok||(await response.json()).application!=='Build Desk')throw Error('Unexpected response');
}catch{
 throw Error('Build Desk Pi is not responding at '+url+' Check that the Pi is on and this computer is on the home network.');
}
console.log('Build Desk Pi: '+url);
if(process.argv.includes('--open')){
 const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
 const args=process.platform==='win32'?['/c','start','',url]:[url];
 const child=spawn(command,args,{windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log('Open the address above in your browser.'));child.unref();
}

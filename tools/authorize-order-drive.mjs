// Desktop OAuth authorization-code + PKCE flow. Run on the host, never in a task runtime.
// Secrets are read from a downloaded desktop client file and saved only under ignored local-data.
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [buildId,clientFile,pendingFolderId,processedFolderId,dismissedFolderId]=process.argv.slice(2);
if(!buildId||!clientFile||![pendingFolderId,processedFolderId,dismissedFolderId].every(x=>/^[A-Za-z0-9_-]+$/.test(x||'')))throw Error('Usage: node tools/authorize-order-drive.mjs <build-id> <desktop-client-json> <Pending-id> <Processed-id> <Dismissed-id>');
const registry=JSON.parse(await readFile(path.join(root,'config/builds.json'),'utf8'));if(!registry.builds.some(b=>b.id===buildId&&b.active))throw Error('Choose an active registered build.');
const client=JSON.parse(await readFile(path.resolve(clientFile),'utf8')).installed;if(!client?.client_id)throw Error('Use a downloaded Desktop app OAuth client.');
const state=randomBytes(24).toString('hex'),verifier=randomBytes(48).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
let finish;const callback=new Promise((resolve,reject)=>{finish={resolve,reject};});
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname!=='/oauth/callback'||u.searchParams.get('state')!==state){res.writeHead(400).end('Invalid authorization callback.');return;}if(!u.searchParams.get('code')){res.writeHead(400).end('Authorization was not granted.');finish.reject(Error('Google authorization was not granted.'));return;}res.end('Authorization received. Return to the Build Desk setup terminal.');finish.resolve(u.searchParams.get('code'));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const redirect='http://127.0.0.1:'+server.address().port+'/oauth/callback';
// Queue files are created by a separate app. Live metadata-only authorization
// returned appNotAuthorizedToFile on folder moves; explicit full Drive consent is required.
// This grants broader account access than the configured queue operations use.
const scopes=['https://www.googleapis.com/auth/drive'];
console.log('Use a personal-use OAuth configuration suitable for durable authorization, not a seven-day Testing token. Stop if Google requires a paid service or trial.');
console.log('Open this Google consent URL on the host PC:\n'+new URL('https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:scopes.join(' '),state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent'})).href);
const timer=setTimeout(()=>finish.reject(Error('Authorization timed out. Run setup again.')),300000);
try{const code=await callback;const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:client.client_id,...(client.client_secret?{client_secret:client.client_secret}:{}),code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error('Google token exchange failed; no credentials were saved.');const token=await res.json();if(!token.refresh_token)throw Error('No refresh token returned; reconnect with offline consent.');for(const id of [pendingFolderId,processedFolderId,dismissedFolderId]){const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,mimeType,capabilities(canAddChildren)',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Queue folder access could not be verified.');const f=await r.json();if(f.mimeType!=='application/vnd.google-apps.folder'||!f.capabilities?.canAddChildren)throw Error('Queue folder is missing write access.');}const dir=path.join(root,'local-data',buildId,'order-updates');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'drive.local.json'),JSON.stringify({clientId:client.client_id,clientSecret:client.client_secret,refreshToken:token.refresh_token,pendingFolderId,processedFolderId,dismissedFolderId,scopes},null,2),{mode:0o600});console.log('Authorization saved privately. Restart Build Desk or use Check for Order Updates. Token longevity and one real queue event still require acceptance testing.');}finally{clearTimeout(timer);server.close();}

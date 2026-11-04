import next from 'next';
import {createClientAccessPolicy,setClientAccessHeaders} from '../tools/client-access.mjs';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Resolve Next and local data from this server, regardless of the launch folder.
process.chdir(path.dirname(fileURLToPath(import.meta.url)));
import {startPrinterMonitors} from '../tools/printer-monitor.mjs';
const dev=process.argv.includes('--dev');
const port=Number(process.env.PORT||4174);
const host=process.env.BUILDDESK_HOST||'127.0.0.1';
const clientAccess=createClientAccessPolicy();
process.env.BUILDDESK_EDIT_TOKEN=randomBytes(32).toString('hex');
const app=next({dev,hostname:host,port});
await app.prepare();
const projectRoot=path.resolve(process.cwd(),'..');
await startPrinterMonitors(projectRoot,process.env.BUILDDESK_REGISTRY||path.join(projectRoot,'config/builds.json'));
const handler=app.getRequestHandler();
http.createServer((req,res)=>{
  setClientAccessHeaders(req,clientAccess);
  handler(req,res);
}).listen(port,host,()=>console.log(`Build Desk Pi: http://${host}:${port} (${process.env.BUILDDESK_LAN_SUBNET?'configured home-network editing':'loopback editing'})`));

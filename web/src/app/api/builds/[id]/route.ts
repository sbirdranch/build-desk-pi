import {refreshTrackedFile} from '@/server/reconcile';
import {printerView} from '@/server/printer';
import {build,builds} from '@/server/registry';
import {withPrinterSlot} from '@/server/printer-slot';
import {createStore} from '@/server/data-store';
import {assets,sourceHashes,openBambu,refreshFile} from '@/server/assets';
import {requireEditor,editor} from '@/server/security';
import {DomainError} from '@/core/domain';
import type {BuildView,Command} from '@/core/types';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function view(id:string,request:Request):Promise<BuildView>{const c=await build(id);const snapshot=await createStore(c).load();const bundle=await assets(c);const hashes=await sourceHashes(c,snapshot);return {config:{id:c.id,name:c.name,materials:c.workflow.materials,defaultProfile:c.workflow.defaultProfile,modules:c.modules},snapshot,assets:bundle,sourceFiles:Object.fromEntries(snapshot.files.map(f=>[f.id,{hash:hashes[f.id],available:!!hashes[f.id],changed:!!hashes[f.id]&&(bundle.projects.find(a=>a.id===f.id)?.sha256!==hashes[f.id]||!!f.sourceHash&&f.sourceHash!==hashes[f.id])}])),canEdit:editor(request)&&c.active,...(editor(request)?{editToken:process.env.BUILDDESK_EDIT_TOKEN}:{}),printer:await printerView(c)};}
function error(e:unknown){console.error('Build data request failed:',e);return Response.json({error:e instanceof DomainError?e.message:e instanceof Error&&e.message.includes('not found')?e.message:'The local workbook or model files could not be accessed. Check the host PC and configured folders.'},{status:e instanceof DomainError?e.status:500});}
export async function GET(request:Request,context:Context){try{return Response.json(await view((await context.params).id,request),{headers:{'Cache-Control':'no-store'}})}catch(e){return error(e)}}
export async function POST(request:Request,context:Context){try{requireEditor(request);if(Number(request.headers.get('content-length')||0)>1_000_000)throw new DomainError('Request too large.');const body=await request.json();const id=(await context.params).id;const config=await build(id);if(!config.active)throw new DomainError('Archived builds are read-only.',403);const store=createStore(config);
 if(body.action==='open-bambu'){await openBambu(config,await store.load(),String(body.fileId));return Response.json({message:'Opened in Bambu Studio.'});}
 if(body.action==='refresh-file'){const result=await refreshTrackedFile(config,await store.load(),String(body.fileId),String(body.revision),String(body.requestId));return Response.json({...result,view:await view(id,request)});}
 if(body.command?.type==='reconcile-file')throw new DomainError('Use Refresh file details to import saved plate membership.');const current=await store.load();const hashes=body.command?.type==='save-acquisition'?{}:await sourceHashes(config,current);const commit=()=>store.commit(String(body.revision),String(body.requestId),body.command as Command,hashes);const result=body.command?.type==='start'?await withPrinterSlot(config,await builds(),commit):await commit();return Response.json({message:result.summary,replayed:result.replayed,...(body.command?.type==='save-acquisition'?{snapshot:result.snapshot}:{view:await view(id,request)})});
 }catch(e){return error(e)}}

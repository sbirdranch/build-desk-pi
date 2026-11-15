import {open} from 'node:fs/promises';
import path from 'node:path';
import {build,root} from '@/server/registry';
import {manual} from '@/core/assembly';
import {createHash} from 'node:crypto';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 let file;
 try{
  const config=await build((await context.params).id);
  if(config.assembly?.manual!==manual.id)return Response.json({error:'No assembly manual configured for this build.'},{status:404});
  file=await open(path.resolve(root,config.assembly.pdf),'r');
  const bytes=await file.readFile();
  if(createHash('sha256').update(bytes).digest('hex')!==manual.sha256)return Response.json({error:'The configured PDF differs from the indexed assembly manual. Restore the matching manual before using page links.'},{status:409});
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="Dump_Truck_Build_Manual.pdf"','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'The assembly PDF is unavailable. Check the configured manual on the host.'},{status:404})}
 finally{await file?.close()}
}

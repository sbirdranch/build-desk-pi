import {build} from '@/server/registry';
import {createStore} from '@/server/data-store';
import {acquisitionReport} from '@/server/acquisition-report';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const config=await build((await context.params).id),kind=new URL(request.url).searchParams.get('kind');
  if(kind!=='source'&&kind!=='status')return Response.json({error:'Choose source or status report.'},{status:400});
  const snapshot=await createStore(config).load();if(!snapshot.acquisition)return Response.json({error:'Purchasing data is not available.'},{status:409});
  const bytes=await acquisitionReport(snapshot.build,snapshot.acquisition,kind);
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${config.id}-parts-${kind}.pdf"`,'Cache-Control':'no-store'}});
 }catch(e){console.error('Purchasing report failed',e);return Response.json({error:'The report could not be generated. Check the local service log.'},{status:500})}
}

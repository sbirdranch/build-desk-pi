import {build} from '@/server/registry';
import {createStore} from '@/server/data-store';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const snapshot=await createStore(await build((await context.params).id)).load();return Response.json(snapshot.acquisition||{parts:[],vendors:[]},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Purchasing data unavailable.'},{status:500})}}

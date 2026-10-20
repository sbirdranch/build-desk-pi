import {readFile,writeFile,mkdir,stat,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {XMLParser} from 'fast-xml-parser';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {BuildConfig,AssetBundle,Snapshot,Asset} from '../core/types';
import {assetRoot,root} from './registry';
import {DomainError} from '../core/domain';
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export async function assets(config:BuildConfig):Promise<AssetBundle>{const dir=assetRoot(config);let cat:AssetBundle;try{cat=JSON.parse(await readFile(path.join(dir,config.assets.catalog),'utf8'));}catch{cat={parts:[],projects:[],references:[]};}for(const p of cat.projects)for(const plate of p.plates)plate.sha256=p.sha256;try{cat.references=JSON.parse(await readFile(path.join(dir,config.assets.references||'references.json'),'utf8'));}catch{cat.references=[];}return cat;}
export function modelPath(config:BuildConfig,filename:string){if(path.basename(filename)!==filename||!filename.toLowerCase().endsWith('.3mf'))throw new DomainError('Invalid model filename.');return path.resolve(config.models.directory,filename)}
export async function sourceHashes(config:BuildConfig,snapshot:Snapshot){const result:Record<string,string|null>={};await Promise.all(snapshot.files.map(async f=>{try{result[f.id]=digest(await readFile(modelPath(config,f.filename)));}catch{result[f.id]=null;}}));return result;}
export function modelAccessError(error:unknown,filename:string):DomainError{
 const code=(error as NodeJS.ErrnoException)?.code;
 if(code==='EPERM'||code==='EACCES')return new DomainError(`Build Desk does not have permission to access the model file ${filename}. Stop Build Desk and start Start-Build-Desk.cmd from your normal Windows account with access to the model folder.`,503);
 if(code==='ENOENT'||code==='ENOTDIR')return new DomainError(`Model file not found: ${filename}. Check the configured model folder and NAS connection.`,404);
 return new DomainError(`Could not read model file ${filename}. Check the model folder and NAS connection.`,503);
}
export async function openBambu(config:BuildConfig,snapshot:Snapshot,fileId:string){const file=snapshot.files.find(f=>f.id===fileId);if(!file)throw new DomainError('Model file not found.');const filename=modelPath(config,file.filename);try{await stat(filename)}catch(e){throw modelAccessError(e,filename)}const exe=config.models.bambuExecutable;if(!exe)throw new DomainError('Bambu Studio has not been configured for this build.');try{await stat(exe)}catch{throw new DomainError('Bambu Studio could not be found at the configured application path. Check the Bambu Studio installation.',503)}await new Promise<void>((resolve,reject)=>{const child=spawn(exe,[filename],{detached:true,stdio:'ignore',windowsHide:false});child.once('error',()=>reject(new DomainError('Windows could not launch Bambu Studio. Start Build Desk from your normal Windows desktop account and check the configured application path.',503)));child.once('spawn',()=>{child.unref();resolve();});});}
const array=<T,>(v:T|T[]|undefined):T[]=>v===undefined?[]:Array.isArray(v)?v:[v];
type XmlNode=Record<string,unknown>;
function metadata(node:XmlNode){return Object.fromEntries(array(node.metadata as XmlNode|XmlNode[]).map(m=>[String(m['@_key']),String(m['@_value']??'')]))}
export async function refreshFile(config:BuildConfig,snapshot:Snapshot,fileId:string){
 await mkdir(assetRoot(config),{recursive:true});const lockName=path.join(assetRoot(config),'.refresh.lock');let lock;
 try{lock=await open(lockName,'wx')}catch{throw new DomainError('An asset refresh is already running for this build.',409)}
 try{return await refreshUnlocked(config,snapshot,fileId)}finally{await lock.close();await unlink(lockName).catch(()=>{})}
}
async function refreshUnlocked(config:BuildConfig,snapshot:Snapshot,fileId:string){
 const file=snapshot.files.find(f=>f.id===fileId);if(!file)throw new DomainError('File not found.');const filename=modelPath(config,file.filename);let bytes:Buffer;try{bytes=await readFile(filename)}catch(e){throw modelAccessError(e,filename)}if(bytes.length>150_000_000)throw new DomainError('Project is too large for the preview importer.');const fingerprint=digest(bytes);
 const zip=await JSZip.loadAsync(bytes);const parser=new XMLParser({ignoreAttributes:false,processEntities:false});
 async function xml(name:string){const entry=zip.file(name);if(!entry)return {};const raw=await entry.async('string');if(raw.length>2_000_000||/<!DOCTYPE/i.test(raw))throw new DomainError('Unsupported project metadata.');return parser.parse(raw) as Record<string,XmlNode>;}
 const settings=await xml('Metadata/model_settings.config');const slice=await xml('Metadata/slice_info.config');const model=await xml('3D/3dmodel.model');const buildItems=array((model.model?.build as XmlNode)?.item as XmlNode|XmlNode[]);const cat=await assets(config);const existing=cat.projects.find(p=>p.id===file.id);if(!existing)throw new DomainError('This project has no registered asset catalog yet.');
 const changed=existing.sha256!==fingerprint;const objects=Object.fromEntries(array(settings.config?.object as XmlNode|XmlNode[]).map(o=>[String(o['@_id']),metadata(o).name||'Unnamed object']));
 const partNames=new Map(snapshot.parts.map(p=>[path.win32.basename(p.source).toLowerCase(),p.id]));
 for(const plateNode of array(settings.config?.plate as XmlNode|XmlNode[])){
  const meta=metadata(plateNode);const number=Number(meta.plater_id);if(!Number.isInteger(number))continue;
  const id=`${file.id}-P${String(number).padStart(2,'0')}`;let plate=existing.plates.find(p=>p.id===id);if(!plate){plate={id,name:meta.plater_name||`Plate ${number}`,thumbnail:'',preview:'',tracking:'untracked_candidate'};existing.plates.push(plate);}
  if(changed){delete plate.model;plate.preview='';plate.thumbnail='';}
  const image=zip.file(meta.thumbnail_file||`Metadata/plate_${number}.png`);
  if(image){const raw=await image.async('nodebuffer');if(raw.length>10_000_000)throw new DomainError('Oversize thumbnail in project.');const relative=`plates/${id}/refreshed.png`;await mkdir(path.join(assetRoot(config),'plates',id),{recursive:true});await writeFile(path.join(assetRoot(config),relative),raw);plate.preview=relative;plate.thumbnail=relative;}
  plate.name=meta.plater_name||plate.name;
  plate.instances=array(plateNode.model_instance as XmlNode|XmlNode[]).map(instance=>{const im=metadata(instance);const name=objects[im.object_id]||im.object_id;const item=buildItems.filter(i=>String(i['@_objectid'])===im.object_id)[Number(im.instance_id||0)];if(!item)throw new DomainError('A saved plate instance has no matching model object. Review it in Bambu Studio.');return {name,part_id:partNames.get(name.toLowerCase())||null,enabled:String(item['@_printable']??'1')!=='0'};});
  const savedSlice=array(slice.config?.plate as XmlNode|XmlNode[]).find(p=>{const m=metadata(p);return Number(m.index||m.plater_id)===number});
  const sm=savedSlice?metadata(savedSlice):{};const seconds=Number(sm.prediction);const grams=savedSlice?array(savedSlice.filament as XmlNode|XmlNode[]).reduce((n,f)=>n+Number(f['@_used_g']||0),0):0;
  plate.slice_info=seconds>0?{status:'saved_slice_metadata',label:`Saved estimate · ${Math.round(seconds/60)} min${grams>0?` · ${grams.toFixed(1)} g`:''}`}:{status:'not_yet_sliced',label:'Not yet sliced'};
 }
 // Refresh never creates production plate records or changes quantities.
 existing.sha256=fingerprint;const target=path.join(assetRoot(config),config.assets.catalog);await writeFile(target,JSON.stringify(cat,null,2));
 let regenerated=false;
 if(config.assets.renderer&&(changed||existing.plates.some(p=>!p.model))){
  const temp=path.join(root,'local-data',config.id,'asset-refresh');await mkdir(temp,{recursive:true});await writeFile(path.join(temp,file.filename),bytes);
  await writeFile(path.join(temp,'parts.json'),JSON.stringify(snapshot.parts.map(p=>({id:p.id,source:p.source}))));
  await writeFile(path.join(temp,'projects.json'),JSON.stringify(snapshot.files.map(f=>({project_id:f.id,section:f.section,filename:f.filename,tracked_plate_numbers:snapshot.plates.filter(p=>p.fileId===f.id).map(p=>p.number)}))));
  try{await promisify(execFile)(config.assets.renderer,[path.join(root,'tools/generate_assets.py'),'--stl-root',temp,'--projects',temp,'--keys',path.join(temp,'parts.json'),'--project-manifest',path.join(temp,'projects.json'),'--output',assetRoot(config),'--only-project',file.filename],{windowsHide:true,timeout:180000,maxBuffer:2_000_000});const output=JSON.parse(await readFile(target,'utf8'));const rendered=output.projects.find((p:{id:string})=>p.id===file.id);if(!rendered||rendered.sha256!==fingerprint||rendered.plates.length!==array(settings.config?.plate as XmlNode|XmlNode[]).length||rendered.plates.some((p:Asset)=>!p.model))throw Error('Incomplete renderer output');regenerated=true;}catch{throw new DomainError('Saved file images were refreshed, but 3D regeneration failed. Retry Refresh or check the configured local renderer.');}
 }
 return {changed,message:regenerated?'File details and rotatable plate previews refreshed. Review the layout before starting.':changed?'File details refreshed. Review preparation before starting. Rotatable geometry can be regenerated separately.':'File details refreshed.'};
}
export async function assetFile(config:BuildConfig,relative:string){const dir=await import('node:fs/promises').then(fs=>fs.realpath(assetRoot(config)));const candidate=path.resolve(dir,relative);if(!candidate.startsWith(dir+path.sep))throw new DomainError('Asset path not allowed.',403);const real=await import('node:fs/promises').then(fs=>fs.realpath(candidate));if(!real.startsWith(dir+path.sep))throw new DomainError('Asset path not allowed.',403);return {bytes:await readFile(real),extension:path.extname(real).toLowerCase()};}

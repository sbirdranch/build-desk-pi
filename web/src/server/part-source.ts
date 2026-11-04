import path from 'node:path';
import type {Part} from '../core/types';

// Saved source paths distinguish designs with the same STL basename (e.g. buckets).
export function matchPrintedSource(parts:Part[],name:string,sourcePath=false):Part[]{
 const normalize=(s:string)=>path.win32.normalize(s).toLowerCase();
 const printed=parts.filter(p=>!p.fabrication);
 if(sourcePath){const full=normalize(name),exact=printed.filter(p=>full===normalize(p.source)||full.endsWith('\\'+normalize(p.source)));if(exact.length)return exact;}
 return printed.filter(p=>path.win32.basename(p.source).toLowerCase()===path.win32.basename(name).toLowerCase());
}

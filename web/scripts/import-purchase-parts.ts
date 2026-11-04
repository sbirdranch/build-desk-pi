import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';
import {backupSQLite} from '../src/server/sqlite-backup';
import {importAcquisitionParts,type DesignerPart} from '../src/server/acquisition-import';
import {decodePurchasing} from '../src/server/purchasing-store';
const a=Object.fromEntries(process.argv.slice(2).reduce<string[][]>((r,v,i,all)=>{if(v.startsWith('--'))r.push([v.slice(2),all[i+1]]);return r},[]));
if(!a.source||!a.database||!a.output||!a['build-id'])throw Error('Offline import: --database source.db --output new.db --build-id id --source designer.json|xlsx');
let parts:DesignerPart[];
if(a.source.endsWith('.xlsx')){const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(a.source);if(!wb.getWorksheet('Parts Checklist'))throw Error('Workbook must contain the documented Parts Checklist columns.');parts=decodePurchasing(wb).parts.map(p=>({id:p.id,description:p.name,required:p.needed,category:p.category,specification:p.specification,requirement:p.requirement}));}
else parts=JSON.parse(await readFile(a.source,'utf8'));
await backupSQLite(a.database,a.output);const db=new DatabaseSync(a.output);
try{db.exec('PRAGMA foreign_keys=ON;BEGIN IMMEDIATE');try{
 if(!db.prepare('SELECT build_id FROM purchasing_archives WHERE build_id=?').get(a['build-id']))throw Error('Activate simplified Purchasing for this build first.');
 importAcquisitionParts(db,a['build-id'],parts);db.prepare('UPDATE build_revisions SET revision=revision+1,updated_at=? WHERE build_id=?').run(new Date().toISOString(),a['build-id']);db.exec('COMMIT');
 console.log(JSON.stringify({imported:parts.length,buildId:a['build-id'],output:a.output,preserved:'Existing on-hand, Ordered, vendor, URL, date and notes'}));
}catch(e){db.exec('ROLLBACK');throw e}}finally{db.close()}

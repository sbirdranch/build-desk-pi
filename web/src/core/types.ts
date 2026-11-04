export type BuildConfig={id:string;name:string;active:boolean;store:{kind:'excel'|'sqlite';path:string;schema:string};assets:{root:string;catalog:string;references?:string;renderer?:string};models:{directory:string};printer?:{id?:string;name:string};workflow:{defaultProfile:string;materials:string[];maxPrintingJobs:number};modules:string[]};
export type Fabrication={completed:number;method:'Unspecified'|'Hand made'|'Outsourced'};
export type Part={id:string;name:string;section:string;source:string;material:string;required:number|null;opening:number;accepted:number;installed:number;notes:string;fabrication?:Fabrication};
export type Assignment={id:string;partId:string;copies:number|null;confirmed:boolean;note?:string};
export type Preparation={runs:number;material:string;profile:string;sourceHash:string;items:{mappingId:string;included:boolean;copies:number|null;planned:number|null}[];notes:string;savedAt:string};
export type Plate={id:string;fileId:string;number:number;name:string;section:string;assignments:Assignment[];unmappedObjects?:string[];preparation?:Preparation};
export type ModelFile={id:string;filename:string;revision:string;profile:string;material:string;section:string;sourceHash?:string;importedAt?:string};
export type JobItem={partId:string;mappingId:string;fileId:string;fileRevision:string;filename:string;plateNumber:number;plateName:string;runs:number;planned:number;accepted:number|null;rejected:number|null;profile:string;material:string;notes:string};
export type Job={id:string;kind:'plate'|'manual';status:'Printing'|'Awaiting inspection'|'Completed'|'Cancelled';startedAt:string;finishedAt:string;items:JobItem[];draft?:{mappingId:string;accepted:number|null;rejected:number|null}[]};
export type Audit={requestId:string;at:string;action:string;target:string;summary:string;before:string;after:string};
export type Snapshot={build:{id:string;name:string};revision:string;recordedAt:string;parts:Part[];files:ModelFile[];plates:Plate[];jobs:Job[];audit:Audit[];acquisition?:import('./acquisition').Acquisition;purchasing?:import('./purchasing').Purchasing};
export type ResultInput={mappingId:string;accepted:number|null;rejected:number|null};
export type ImportedPlate={number:number;name:string;assignments:{partId:string;copies:number|null;split?:boolean}[];unmapped:string[]};
export type Command=
 | {type:'update-fabrication';partId:string;required:number|null;installed:number;notes:string;fabrication:Fabrication}
 | import('./acquisition').AcquisitionCommand
 | {type:'reconcile-file';fileId:string;sourceHash:string;plates:ImportedPlate[];registerPlates?:number[]}
 | {type:'update-parts';items:{partId:string;required:number|null;installed:number}[]}
 | {type:'save-preparation';plateId:string;preparation:Preparation}
 | {type:'start';plateId:string}
 | {type:'await-inspection';jobId:string}
 | {type:'save-results';jobId:string;results:ResultInput[]}
 | {type:'finish';jobId:string;results:ResultInput[]}
 | {type:'cancel';jobId:string}
 | {type:'manual-results';items:{mappingId:string;planned:number;accepted:number;rejected:number}[];notes:string}
 | {type:'update-part';partId:string;required:number|null;installed:number;notes:string};
export type Asset={credit?:string;sourcePage?:string;referenceType?:'photo'|'render';id:string;name:string;thumbnail:string;preview:string;model?:string;original?:string;sha256?:string;source_sha256?:string;width?:number;height?:number;view?:string;slice_info?:{label:string;status:string};tracking?:string;instances?:{name:string;part_id:string|null;enabled:boolean}[]};
export type AssetBundle={parts:Asset[];projects:{id:string;filename:string;sha256:string;plates:Asset[]}[];references:Asset[]};
export type PrinterView={name:string;status:'unconfigured'|'live'|'stale'|'offline'|'connecting';label:string;lastSeen?:string;state?:string;job?:string;progress?:number;remainingMinutes?:number;layer?:number;totalLayers?:number};
export type BuildView={config:{id:string;name:string;materials:string[];defaultProfile:string;modules:string[]};snapshot:Snapshot;assets:AssetBundle;sourceFiles:Record<string,{hash:string|null;changed:boolean;available:boolean}>;canEdit:boolean;editToken?:string;printer:PrinterView};

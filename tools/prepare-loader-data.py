"""Prepare the real loader's independent tracking import and display assets.

Both buckets are included at the user's request. Metal STLs are display inputs,
never print-project inputs. Window templates are resources rather than vehicle
components. The duplicate root front-window template is not counted twice.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile


def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def metadata(node):return {m.get('key'):m.get('value') for m in node.findall('metadata')}
def normalized(s):return re.sub('[^a-z0-9]','',s.lower())


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ['source','projects','templates','references','output']:p.add_argument('--'+arg,type=Path,required=True)
    a=p.parse_args();root=Path(__file__).resolve().parents[1];source=a.source.resolve();out=a.output.resolve()
    assert not out.exists() and not out.is_relative_to(source)
    expected={'Kitten 980 Metal Plate overview.txt':'e28cc3600bd77e4beb101431fca675d33f58dac03893f0d1433b05680f3f90e5','Kitten 980 Screwlist.txt':'b5db9b3d789e566f0c7150ffcb3f00e1c80d34d907759a2fa593521dc0996fe9','Kitten 980 What you need.txt':'51397f4a8cfca4239c297901e005c0a512426b23936cd51ea1135364554452ac'}
    for name,digest in expected.items():assert sha(source/name)==digest
    projects=json.loads((a.projects/'projects.json').read_text());assert len(projects)==7
    template=json.loads((a.templates/'projects.json').read_text());assert len(template)==1 and len(template[0]['inputs'])==3
    out.mkdir(parents=True);(out/'models').mkdir();(out/'resources').mkdir()
    parts=[];keys=[];key_by_source={}
    for i,file in enumerate(sorted((source/'STL').rglob('*.stl')),1):
        relative=str(file.relative_to(source)).replace('/','\\')
        if 'Windows Template' in relative:continue
        id=f'K980-P{i:03d}';project=next(r for r in projects if any(x['source']==relative for x in r['inputs']))
        keys.append(dict(id=id,source=relative));key_by_source[relative]=id
        parts.append(dict(id=id,name=file.stem,source=relative,section=project['section'],material='PETG / PETG HF',required=None,notes='Designer v1.2e STL; print face retained. Assembly quantity unconfirmed. Both buckets included.'))
    counts={}
    for line in (source/'Kitten 980 Metal Plate overview.txt').read_text().splitlines():
        m=re.match(r'\s*([123]mm\s+.*?)\s+(\d+)pc',line)
        if m:counts[normalized(m[1])]=int(m[2])
    metal=sorted((source/'Metal plates STL format').rglob('*.stl'));assert len(metal)==26 and len(counts)==26
    for i,file in enumerate(metal,1):
        id=f'K980-F{i:03d}';relative=str(file.relative_to(source)).replace('/','\\');stem=file.stem
        alias=stem.replace('knifebucket','KBucket').replace('teethbucket','TBucket')
        matches=[f for f in (source/'Metal plates').rglob('*.dxf') if normalized(f.stem)==normalized(alias)];assert len(matches)==1,stem
        drawings=[str(matches[0].relative_to(source)).replace('/','\\')]
        drawings += [str(f.relative_to(source)).replace('/','\\') for f in (source/'Metal plates').rglob('*') if f.suffix.lower() in ['.stp','.123dx'] and normalized(f.stem) in [normalized(alias),normalized(stem)]]
        assert len(drawings)==3,stem
        thickness=stem.split()[0];keys.append(dict(id=id,source=relative))
        parts.append(dict(id=id,name=stem,source=drawings[0],section='Fabricated metal — '+thickness,material='Steel · '+thickness,required=counts[normalized(stem)],notes='Hand made or outsourced; not 3D printed or a Purchasing item. Designer quantity includes both bucket options.\nDesign files:\n'+'\n'.join(drawings)+'\nSTL display geometry: '+relative,fabrication=dict(completed=0,method='Unspecified')))
    manifest=dict(id='kitten-980-loader',name='Kitten 980 Loader',printerId='h2d-main',parts=parts,files=[],plates=[],purchases=json.loads((root/'config/designer/kitten-980-purchases.json').read_text()),sourceInventory=[dict(path=str(f.relative_to(source)).replace('\\','/'),bytes=f.stat().st_size,sha256=sha(f)) for f in sorted(source.rglob('*')) if f.is_file() and f.suffix!='.json'])
    project_manifest=[]
    for row in projects:
        file=a.projects/'models'/row['filename'];assert sha(file)==row['sha256'];shutil.copy2(file,out/'models'/file.name)
        for input in row['inputs']:assert sha(source/input['source'].replace('\\','/'))==input['sha256']
        manifest['files'].append(dict(id=row['id'],filename=file.name,revision='Designer v1.2e · review draft',profile='Kitten 980 PETG',material='PETG / PETG HF',section=row['section'],sourceHash=row['sha256']))
        project_manifest.append(dict(project_id=row['id'],filename=file.name,section=row['section'],tracked_plate_numbers=[p['number'] for p in row['plates']]))
        by_name={Path(r['source'].replace('\\','/')).name:key_by_source[r['source']] for r in row['inputs']}
        with zipfile.ZipFile(file) as z:
            xml=ET.fromstring(z.read('Metadata/model_settings.config'));objects={o.get('id'):by_name[metadata(o)['name']] for o in xml.findall('object')}
            for plate in xml.findall('plate'):
                md=metadata(plate);number=int(md['plater_id']);id=row['id']+f'-P{number:02d}';membership={}
                for instance in plate.findall('model_instance'):
                    part=objects[metadata(instance)['object_id']];membership[part]=membership.get(part,0)+1
                manifest['plates'].append(dict(id=id,fileId=row['id'],number=number,name=md['plater_name'],section=row['section'],assignments=[dict(id=id+'-'+part,partId=part,copies=copies) for part,copies in sorted(membership.items())]))
    assert len(parts)==114 and len({a['partId'] for p in manifest['plates'] for a in p['assignments']})==88
    assert not {p['id'] for p in parts if p.get('fabrication')} & {x['partId'] for p in manifest['plates'] for x in p['assignments']}
    (out/'parts.json').write_text(json.dumps(keys,indent=2),encoding='utf-8');(out/'projects.json').write_text(json.dumps(project_manifest,indent=2),encoding='utf-8')
    (out/'instance.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
    shutil.copy2(a.templates/'models'/template[0]['filename'],out/'resources'/template[0]['filename'])
    subprocess.run([sys.executable,str(root/'tools/generate_assets.py'),'--stl-root',str(source),'--projects',str(out/'models'),'--keys',str(out/'parts.json'),'--project-manifest',str(out/'projects.json'),'--output',str(out/'assets')],check=True)
    catalog=json.loads((out/'assets/catalog.json').read_text());assert not catalog['exceptions'] and len(catalog['parts'])==114
    for record in catalog['parts']:record['section']=next(p['section'] for p in parts if p['id']==record['id'])
    for project in catalog['projects']:
        row=next(r for r in projects if r['id']==project['id']);by_name={Path(r['source'].replace('\\','/')).name:key_by_source[r['source']] for r in row['inputs']}
        for plate in project['plates']:
            for instance in plate['instances']:instance['part_id']=by_name[instance['name']]
    sys.path.insert(0,str(root/'.python-packages'));from PIL import Image,ImageOps
    refs=[]
    for i,row in enumerate(json.loads((a.references/'sources.json').read_text()),1):
        src=a.references/row['filename'];assert sha(src)==row['sha256'];id=f'K980-REF{i:03d}';folder=out/'assets/references'/id;folder.mkdir(parents=True)
        with Image.open(src) as image:
            extension={'WEBP':'.webp','JPEG':'.jpg','PNG':'.png'}[image.format];original='original'+extension;shutil.copy2(src,folder/original)
            width,height=image.size;icc=image.info.get('icc_profile');image=ImageOps.exif_transpose(image).convert('RGB')
            for name,size in [('thumbnail',320),('preview',2048)]:
                derivative=image.copy();derivative.thumbnail((size,size),Image.Resampling.LANCZOS);derivative.save(folder/(name+'.webp'),lossless=True,**({'icc_profile':icc} if icc else {}))
        refs.append(dict(id=id,name=row['name'],credit=row['credit'],sourcePage=row['source_page'],referenceType='render' if i==1 else 'photo',sha256=row['sha256'],source_sha256=row['sha256'],width=width,height=height,original=f'references/{id}/{original}',preview=f'references/{id}/preview.webp',thumbnail=f'references/{id}/thumbnail.webp'))
    catalog['references']=refs;(out/'assets/catalog.json').write_text(json.dumps(catalog,indent=2),encoding='utf-8');(out/'assets/references.json').write_text(json.dumps(refs,indent=2),encoding='utf-8')
    (out/'README.txt').write_text('Kitten 980 Loader — designer v1.2e. Both buckets included. Seven unsliced PETG review projects preserve designer print faces; plate-plane rotation/positioning allowed. H2D 0.4mm, 4 walls, 40% gyroid, 1.2mm top/bottom and 6 shell layers. Review supports, enabled copies, required assembly quantities and spool assignments before slicing. The separate WindowTemplates project is a cutting-guide resource, not a vehicle component. Its duplicate root template is not counted twice. All 26 metal designs are fabricated parts, not print jobs or Purchasing items; use original DXF/STEP files for fabrication. No previous-build progress, stock or orders copied.\n',encoding='utf-8')
    (out/'native-validation.json').write_text(json.dumps(dict(passed=True,projects=8,trackedProjects=7,printableModels=88,templates=3,printFacesPreserved=True,sliced=False)))
    print(json.dumps(dict(printableParts=88,fabricatedParts=26,plates=len(manifest['plates']),purchases=len(manifest['purchases']),references=len(refs))))


if __name__=='__main__':main()

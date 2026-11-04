"""Create independent unsliced loader projects; metal designs are never inputs.

Uses the established Windows Bambu CLI export/material correction process.
Bed-plane rotation is allowed; the designer's print face must remain unchanged.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile


def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['source','profiles','output']:p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--section', help='Export one named section for a new output directory')
    p.add_argument('--bambu',type=Path,default=Path(r'C:\Program Files\Bambu Studio\bambu-studio.exe'))
    a=p.parse_args();source=a.source.resolve();out=a.output.resolve();profiles=a.profiles.resolve()
    assert not out.exists() and not out.is_relative_to(source),'Use a new separate output directory'
    spec=importlib.util.spec_from_file_location('orientation',Path(__file__).with_name('prepare-kitten-instance.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    out.mkdir(parents=True);(out/'native').mkdir();(out/'models').mkdir();(out/'roundtrip').mkdir()
    process=json.loads((profiles/'process.json').read_text(encoding='utf-8-sig'))
    process.update(name='Kitten 980 PETG',print_settings_id='Kitten 980 PETG',top_shell_layers='6',bottom_shell_layers='6',top_shell_thickness='1.2',bottom_shell_thickness='1.2')
    (out/'geometry-process.json').write_text(json.dumps(process),encoding='utf-8')
    final=json.loads((profiles/'wheel-settings.json').read_text(encoding='utf-8-sig'))
    final.update(print_settings_id='Kitten 980 PETG',top_shell_layers='6',bottom_shell_layers='6',top_shell_thickness='1.2',bottom_shell_thickness='1.2')
    assert final['wall_loops']=='4' and final['sparse_infill_density']=='40%'
    groups=[(name,sorted((source/'STL'/name).glob('*.stl'))) for name in ['Arms','Cabin','Front Chassis','Rear Chassis','Wheels']]
    groups += [('Knife Bucket',sorted((source/'STL/Buckets/Standard Knife Bucket').glob('*.stl'))),('Teeth Bucket',sorted((source/'STL/Buckets/Standard Teeth bucket').glob('*.stl')))]
    groups += [('Window Templates',sorted((source/'STL/Windows Template').glob('*.stl')))]
    if a.section:groups=[g for g in groups if g[0]==a.section];assert groups, a.section
    records=[]
    for index,(section,inputs) in enumerate(groups,1):
        assert inputs and all(p.is_file() for p in inputs),section
        filename='K980_'+section.replace(' ','')+'_PETG_draft.3mf';native=out/'native'/filename;target=out/'models'/filename
        args=[str(a.bambu),*map(str,inputs),'--arrange','1','--ensure-on-bed','--curr-bed-type','Textured PEI Plate','--load-settings',str(profiles/'machine.json')+';'+str(out/'geometry-process.json'),'--load-filaments',str(profiles/'pla.json'),'--export-3mf',str(native),'--debug','3']
        with (out/(section.replace(' ','')+'-export.log')).open('w') as log:
            result=subprocess.run(args,cwd=a.bambu.parent,stdout=log,stderr=subprocess.STDOUT,timeout=240,creationflags=subprocess.CREATE_NO_WINDOW)
        assert result.returncode==0 and native.exists(),(section,result.returncode)
        module.require_preserved_print_face(native)
        with zipfile.ZipFile(native) as z:
            assert z.testzip() is None
            config=ET.fromstring(z.read('Metadata/model_settings.config'))
            objects=config.findall('object');assert len(objects)==len(inputs)
            by_name={p.name:p for p in inputs};assert len(by_name)==len(inputs)
            for obj in objects:
                name=obj.find("metadata[@key='name']").get('value');assert name in by_name
                obj.find("metadata[@key='extruder']").set('value','4')
                for md in obj.findall(".//metadata[@key='source_file']"):md.set('value','X:\\3DModels\\rc_kitten980WheeledLoader\\'+str(by_name[name].relative_to(source)).replace('/','\\'))
            plates=[]
            for plate in config.findall('plate'):
                number=int(plate.find("metadata[@key='plater_id']").get('value'));name=f'P{number:02d}_'+section.replace(' ','')
                plate.find("metadata[@key='plater_name']").set('value',name);plates.append(dict(number=number,name=name))
            with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as dest:
                for info in z.infolist():
                    assert not info.filename.endswith('.gcode')
                    data=z.read(info.filename)
                    if info.filename=='Metadata/project_settings.config':data=json.dumps(final,indent=2).encode()
                    if info.filename=='Metadata/model_settings.config':data=ET.tostring(config,encoding='utf-8',xml_declaration=True)
                    dest.writestr(info,data)
        module.require_preserved_print_face(target)
        roundtrip=out/'roundtrip'/filename
        with (out/(section.replace(' ','')+'-roundtrip.log')).open('w') as log:
            result=subprocess.run([str(a.bambu),str(target),'--export-3mf',str(roundtrip)],cwd=a.bambu.parent,stdout=log,stderr=subprocess.STDOUT,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW)
        assert result.returncode==0 and roundtrip.exists(),(section,'native reopen failed')
        module.require_preserved_print_face(roundtrip)
        with zipfile.ZipFile(roundtrip) as z:
            assert z.testzip() is None
            cfg=json.loads(z.read('Metadata/project_settings.config'));xml=ET.fromstring(z.read('Metadata/model_settings.config'))
            assert cfg['printer_settings_id']=='Bambu Lab H2D 0.4 nozzle' and cfg['print_settings_id']=='Kitten 980 PETG'
            assert cfg['top_shell_layers']=='6' and cfg['bottom_shell_layers']=='6'
            assert len(xml.findall('object'))==len(inputs) and len(xml.findall('plate'))==len(plates)
            assert all(o.find("metadata[@key='extruder']").get('value')=='4' for o in xml.findall('object'))
        records.append(dict(id=f'K980-3MF{index:03d}',section=section,filename=filename,sha256=sha(target),inputs=[dict(source=str(p.relative_to(source)).replace('/','\\'),sha256=sha(p)) for p in inputs],plates=plates,resourceOnly=section=='Window Templates'))
        (out/'projects.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
        print(f'{section}: {len(inputs)} models, {len(plates)} plates; print face and native reopen validated',flush=True)
    (out/'native-validation.json').write_text(json.dumps(dict(passed=True,projects=len(records),objects=sum(len(r['inputs']) for r in records),printFacesPreserved=True,sliced=False)))


if __name__=='__main__':main()

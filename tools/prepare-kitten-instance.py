"""Prepare a fresh 745 instance from hash-verified designer STLs and AI layouts.

Offline only. No tracking records are read. Inputs/outputs are operator-selected;
the original prepared layouts and source STLs are never changed.
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


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def md(node):
    return {x.get('key'): x.get('value') for x in node.findall('metadata')}


def require_fixed_rotations(path):
    """Reject layouts that rotate/scale the imported designer geometry."""
    identity = [1,0,0,0,1,0,0,0,1]
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith('.model'): continue
            for node in ET.fromstring(archive.read(name)).iter():
                if 'transform' not in node.attrib: continue
                values = [float(x) for x in node.get('transform').split()]
                if len(values) != 12 or any(abs(x-y)>1e-6 for x,y in zip(values[:9],identity)):
                    raise ValueError(f'{path.name}: layout rotates or scales a designer part. Prepare a layout with fixed designer rotations before reuse.')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ['source-manifest', 'catalog', 'templates', 'template-manifest', 'profiles', 'wheel', 'part-assets', 'purchases', 'output']:
        p.add_argument('--' + arg, type=Path, required=True)
    a = p.parse_args()
    assert not a.output.exists(), 'Use a new output directory'
    inventory = json.loads(a.source_manifest.read_text())
    # Purchasing definitions below were transcribed from these exact designer lists.
    source_hashes = {r['path']:r['sha256'] for r in inventory}
    assert source_hashes['Screwlist.txt'] == 'e80db8f470884373b1029486a4283a7904262c7c44fa566ad1da1af988256878'
    assert source_hashes['What you need Kitten740745.txt'] == 'fb708ae3269480e28144a377bede827d112e82279a473ba2898432ae7a97a03f'
    observed = {r['path'][4:].replace('/', '\\'): r for r in inventory if r['path'].startswith('STL/')}
    old = json.loads(a.catalog.read_text())
    keys = json.loads((Path(__file__).resolve().parents[1] / 'config/parts.json').read_text())
    geometry = {x['id']: x for x in old['parts']}
    assert len(keys) == 101 and len({x['id'] for x in keys}) == 101
    for key in keys:
        assert geometry[key['id']]['source_relative'] == key['source']
        assert observed[key['source']]['sha256'] == geometry[key['id']]['sha256'], key['source']
    layouts = json.loads(a.template_manifest.read_text())
    assert len(layouts) == 6
    for row in layouts:
        assert sha(a.templates / row['filename']) == row['sha256'], row['filename']
        require_fixed_rotations(a.templates / row['filename'])
    require_fixed_rotations(a.wheel)
    output = a.output.resolve()
    models = output / 'models'; assets = output / 'assets'
    models.mkdir(parents=True); assets.mkdir()
    shutil.copytree(a.part_assets, assets / 'parts')
    for part in geometry.values():
        for field in ['thumbnail', 'preview', 'model']:
            relative = Path(part[field])
            assert not relative.is_absolute() and '..' not in relative.parts
            assert (assets / relative).is_file()
    wheel_settings = json.loads((a.profiles / 'wheel-settings.json').read_text(encoding='utf-8-sig'))
    layouts.append(dict(project_id='K745-3MF001', section='Wheels / 745', filename=a.wheel.name, material='PETG'))
    cat = dict(schema_version=1, renderer=old['renderer'], parts=old['parts'], projects=[], references=[], exceptions=[],
               notice='Independent review drafts; verified identical designer geometry. No production history copied.')
    parts = [dict(id=k['id'], name=Path(k['source'].replace('\\', '/')).stem,
                  section='Wheels / 745' if k['source'].startswith('Wheels') else k['source'].split('\\')[0],
                  source=k['source'], material='TPU' if k['source'].startswith('TPU') else 'PETG / PETG HF',
                  required=None, notes='Designer STL verified. Assembly quantity unconfirmed; no first-truck tracking copied.') for k in keys]
    manifest = dict(id='kitten-745-instance2', name='Kitten 745 — Truck 2', printerId='h2d-main', parts=parts, files=[], plates=[], purchases=json.loads(a.purchases.read_text()), sourceInventory=inventory)
    seen = set()
    for row in layouts:
        wheel = row['project_id'] == 'K745-3MF001'
        source = a.wheel if wheel else a.templates / row['filename']
        tpu = row['material'] == 'TPU'
        filename = 'K7452_' + re.sub(r'[^A-Za-z0-9]', '', row['section']) + ('_TPU' if tpu else '_PETG') + '_draft.3mf'
        target = models / filename
        with zipfile.ZipFile(source) as z:
            assert z.testzip() is None
            metadata = ET.fromstring(z.read('Metadata/model_settings.config'))
            settings = json.loads(z.read('Metadata/project_settings.config'))
            if wheel:
                settings = wheel_settings
            objects = {}
            for obj in metadata.findall('object'):
                name = md(obj)['name']
                candidates = [k for k in keys if Path(k['source'].replace('\\', '/')).name.lower() == name.lower()]
                if len(candidates) != 1:
                    candidates = [k for k in candidates if k['source'].split('\\')[0] == row['section']]
                assert len(candidates) == 1, (row['section'], name)
                key = candidates[0]; objects[obj.get('id')] = key['id']; seen.add(key['id'])
                for x in obj.findall("metadata[@key='extruder']"):
                    x.set('value', '1' if tpu else '4')
                for x in obj.findall(".//metadata[@key='source_file']"):
                    x.set('value', 'X:\\3DModels\\rc_Cat745instance2\\STL\\' + key['source'])
            project = dict(id=row['project_id'], filename=filename, section=row['section'], plates=[])
            for plate in metadata.findall('plate'):
                number = int(md(plate)['plater_id']); id = row['project_id'] + f'-P{number:02d}'
                name = f'P{number:02d}_Truck2_' + re.sub(r'[^A-Za-z0-9]', '', row['section'])
                plate.find("metadata[@key='plater_name']").set('value', name)
                counts = {}; instances = []
                for instance in plate.findall('model_instance'):
                    im = md(instance); part_id = objects[im['object_id']]
                    counts[part_id] = counts.get(part_id, 0) + 1
                    instances.append(dict(name=next(x['name'] + '.stl' for x in parts if x['id'] == part_id), part_id=part_id, enabled=True))
                thumbnail = f'plates/{id}/saved.png'
                (assets / thumbnail).parent.mkdir(parents=True, exist_ok=True)
                (assets / thumbnail).write_bytes(z.read(md(plate).get('thumbnail_file', f'Metadata/plate_{number}.png')))
                project['plates'].append(dict(id=id, number=number, name=name, instances=instances, thumbnail=thumbnail, preview=thumbnail, tracking='tracked', slice_info=dict(status='not_yet_sliced', label='Not yet sliced')))
                manifest['plates'].append(dict(id=id, fileId=row['project_id'], number=number, name=name, section=row['section'], assignments=[dict(id=id + '-' + k, partId=k, copies=v) for k, v in sorted(counts.items())]))
            with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
                for info in z.infolist():
                    assert not info.filename.endswith('.gcode'), 'Use unsliced templates'
                    data = z.read(info.filename)
                    if info.filename == 'Metadata/model_settings.config': data = ET.tostring(metadata, encoding='utf-8', xml_declaration=True)
                    if info.filename == 'Metadata/project_settings.config': data = json.dumps(settings, indent=2).encode()
                    out.writestr(info, data)
            with zipfile.ZipFile(target) as z:
                assert z.testzip() is None
            project['sha256'] = sha(target); cat['projects'].append(project)
            manifest['files'].append(dict(id=row['project_id'], filename=filename, revision='Independent review draft', profile=settings['print_settings_id'], material='TPU' if tpu else 'PETG / PETG HF', section=row['section'], sourceHash=project['sha256']))
    assert seen == {k['id'] for k in keys}
    (assets / 'references.json').write_text('[]')
    (assets / 'catalog.json').write_text(json.dumps(cat, indent=2))
    for row in manifest['files']:
        subprocess.run([sys.executable, str(Path(__file__).with_name('generate_plate_models.py')), '--source', str(models / row['filename']), '--output', str(assets), '--catalog', str(assets / 'catalog.json'), '--project-id', row['id']], check=True)
    (output / 'instance.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    (output / 'README.txt').write_text('Truck 2: independent UNSLICED REVIEW DRAFTS. Same verified designer STLs, AI-prepared layouts reused as templates; wheels newly arranged by Bambu Studio. PETG/PETG HF; TPU uses stock profile and requires review. Inspect orientation, supports, quantities and spool/nozzle assignments, then slice in Bambu Studio. No production, orders or stock copied. Assembly quantities remain unconfirmed. Source: X:\\3DModels\\rc_Cat745instance2. Original truck models are unchanged.\n')
    print(json.dumps(dict(parts=len(parts), files=len(manifest['files']), plates=len(manifest['plates']), allSourceHashesVerified=True)))


if __name__ == '__main__':
    main()

"""Generate plate GLBs from saved 3MF geometry using only Python's standard library.

Preserves component and instance transforms, including disabled objects shown in
the saved layout. Never changes source models or production tracking records.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zipfile

NS = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
PROD = '{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}path'

def metadata(node):
    return {m.get('key'): m.get('value') for m in node.findall('metadata')}

def matrix(text):
    if not text:
        return None
    n = [float(x) for x in text.split()]
    if len(n) != 12 or not all(math.isfinite(x) for x in n):
        raise ValueError('Invalid 3MF transform')
    return n[:3]+[0]+n[3:6]+[0]+n[6:9]+[0]+n[9:]+[1]

def generate(source, output, catalog_path, project_id):
    catalog = json.loads(catalog_path.read_text())
    project = next(p for p in catalog['projects'] if p['id'] == project_id)
    fingerprint = hashlib.file_digest(source.open('rb'), 'sha256').hexdigest()
    staged = []
    with zipfile.ZipFile(source) as archive:
        roots = {}
        def xml(name):
            name = name.lstrip('/')
            if name not in roots:
                entry = archive.getinfo(name)
                if entry.file_size > 150_000_000:
                    raise ValueError('Geometry XML exceeds supported size')
                raw = archive.read(entry)
                if b'<!DOCTYPE' in raw.upper():
                    raise ValueError('Unsupported XML doctype')
                roots[name] = ET.fromstring(raw)
            return roots[name]
        main = '3D/3dmodel.model'
        build = xml(main).findall('m:build/m:item', NS)
        for plate in xml('Metadata/model_settings.config').findall('plate'):
            md = metadata(plate)
            plate_id = f"{project_id}-P{int(md['plater_id']):02d}"
            record = next(p for p in project['plates'] if p['id'] == plate_id)
            gltf = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': []}],
                    'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [],
                    'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [.71,.75,.79,1], 'metallicFactor': 0, 'roughnessFactor': .75}, 'doubleSided': True}]}
            binary = bytearray()
            meshes = {}
            def accessor(data, fmt, kind, component, bounds=None):
                while len(binary) % 4:
                    binary.append(0)
                offset = len(binary)
                for row in data:
                    binary.extend(struct.pack('<'+fmt, *row))
                view = len(gltf['bufferViews'])
                gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(binary)-offset})
                item = {'bufferView': view, 'componentType': component, 'count': len(data), 'type': kind}
                if bounds:
                    item.update(min=bounds[0], max=bounds[1])
                gltf['accessors'].append(item)
                return len(gltf['accessors'])-1
            def obj(filename, oid, stack=()):
                filename = filename.lstrip('/')
                key = (filename, oid)
                if key in stack or len(stack) > 64:
                    raise ValueError('Cyclic or excessive component nesting')
                element = xml(filename).find(f"m:resources/m:object[@id='{int(oid)}']", NS)
                if element is None:
                    raise ValueError('Missing 3MF object')
                node = {}
                mesh = element.find('m:mesh', NS)
                if mesh is not None:
                    if key not in meshes:
                        vertices = [tuple(float(v.get(k)) for k in ('x','y','z')) for v in mesh.findall('m:vertices/m:vertex', NS)]
                        indices = [tuple(int(t.get(k)) for k in ('v1','v2','v3')) for t in mesh.findall('m:triangles/m:triangle', NS)]
                        if not vertices or not indices or not all(math.isfinite(x) for v in vertices for x in v):
                            raise ValueError('Invalid or empty mesh')
                        if any(i < 0 or i >= len(vertices) for t in indices for i in t):
                            raise ValueError('Invalid triangle index')
                        bounds = ([min(v[k] for v in vertices) for k in range(3)], [max(v[k] for v in vertices) for k in range(3)])
                        positions = accessor(vertices, 'fff', 'VEC3', 5126, bounds)
                        triangles = accessor([(i,) for t in indices for i in t], 'I', 'SCALAR', 5125)
                        meshes[key] = len(gltf['meshes'])
                        gltf['meshes'].append({'primitives': [{'attributes': {'POSITION': positions}, 'indices': triangles, 'material': 0}]})
                    node['mesh'] = meshes[key]
                else:
                    children = []
                    for c in element.findall('m:components/m:component', NS):
                        child = obj(c.get(PROD, filename), c.get('objectid'), stack+(key,))
                        transform = matrix(c.get('transform'))
                        if transform:
                            gltf['nodes'][child]['matrix'] = transform
                        children.append(child)
                    if not children:
                        raise ValueError('Object has no geometry')
                    node['children'] = children
                gltf['nodes'].append(node)
                return len(gltf['nodes'])-1
            for instance in plate.findall('model_instance'):
                im = metadata(instance)
                items = [i for i in build if i.get('objectid') == im['object_id']]
                item = items[int(im.get('instance_id', '0'))]
                index = obj(main, im['object_id'])
                transform = matrix(item.get('transform'))
                if transform:
                    gltf['nodes'][index]['matrix'] = transform
                gltf['scenes'][0]['nodes'].append(index)
            if not gltf['scenes'][0]['nodes']:
                continue
            while len(binary) % 4:
                binary.append(0)
            gltf['buffers'] = [{'byteLength': len(binary)}]
            encoded = json.dumps(gltf, separators=(',', ':')).encode()
            encoded += b' ' * (-len(encoded) % 4)
            glb = struct.pack('<III', 0x46546C67, 2, 28+len(encoded)+len(binary))
            glb += struct.pack('<II', len(encoded), 0x4E4F534A)+encoded
            glb += struct.pack('<II', len(binary), 0x004E4942)+binary
            # Hash-specific names prevent serving stale geometry after a refresh.
            relative = f'plates/{plate_id}/model-{fingerprint}.glb'
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix('.tmp')
            temporary.write_bytes(glb)
            os.replace(temporary, destination)
            staged.append((record, relative))
            print(f'{plate_id}: {len(glb)} bytes', flush=True)
    for record, relative in staged:
        record['model'] = relative
    project['sha256'] = fingerprint
    temporary = catalog_path.with_suffix('.tmp')
    temporary.write_text(json.dumps(catalog, indent=2))
    os.replace(temporary, catalog_path)

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for name in ('source', 'output', 'catalog'):
        p.add_argument('--'+name, type=Path, required=True)
    p.add_argument('--project-id', required=True)
    args = p.parse_args()
    generate(args.source, args.output, args.catalog, args.project_id)

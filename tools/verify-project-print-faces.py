"""Read-only source geometry/print-face audit; no third-party Python packages."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET
import zipfile

NS={'m':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
PROD='{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}path'


def stl(path):
    data=path.read_bytes();points=set()
    if len(data)>84 and 84+50*struct.unpack_from('<I',data,80)[0]==len(data):
        for i in range(84,len(data),50):
            v=struct.unpack_from('<9f',data,i+12);points.update(tuple(v[j:j+3]) for j in [0,3,6])
    else:
        for match in re.finditer(rb'\bvertex\s+([^\r\n]+)',data):points.add(tuple(map(float,match[1].split())))
    assert points;return points


def centered(points):
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)];c=[(a+b)/2 for a,b in zip(lo,hi)]
    return [tuple(p[i]-c[i] for i in range(3)) for p in points]


def distance(a,b):
    buckets={}
    for p in b:buckets.setdefault(tuple(math.floor(v/.001) for v in p),[]).append(p)
    maximum=0
    for p in a:
        key=tuple(math.floor(v/.001) for v in p);best=math.inf
        for dx in [-1,0,1]:
            for dy in [-1,0,1]:
                for dz in [-1,0,1]:
                    for q in buckets.get((key[0]+dx,key[1]+dy,key[2]+dz),[]):best=min(best,sum((x-y)**2 for x,y in zip(p,q)))
        maximum=max(maximum,math.sqrt(best))
    return maximum


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['source','projects','manifest','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();spec=importlib.util.spec_from_file_location('orientation',Path(__file__).with_name('prepare-kitten-instance.py'));orientation=importlib.util.module_from_spec(spec);spec.loader.exec_module(orientation)
    results=[]
    for row in json.loads(a.manifest.read_text()):
        file=a.projects/row['filename'];assert hashlib.sha256(file.read_bytes()).hexdigest()==row['sha256'];orientation.require_preserved_print_face(file)
        with zipfile.ZipFile(file) as archive:
            roots={}
            def xml(name):
                name=name.lstrip('/')
                if name not in roots:roots[name]=ET.fromstring(archive.read(name))
                return roots[name]
            def vertices(path,oid):
                obj=xml(path).find("m:resources/m:object[@id='"+oid+"']",NS);mesh=obj.find('m:mesh',NS)
                if mesh is not None:return [tuple(float(v.get(k)) for k in ['x','y','z']) for v in mesh.findall('m:vertices/m:vertex',NS)]
                out=[]
                for c in obj.findall('m:components/m:component',NS):
                    v=[float(n) for n in c.get('transform','1 0 0 0 1 0 0 0 1 0 0 0').split()]
                    for x,y,z in vertices(c.get(PROD,path),c.get('objectid')):out.append((v[0]*x+v[3]*y+v[6]*z+v[9],v[1]*x+v[4]*y+v[7]*z+v[10],v[2]*x+v[5]*y+v[8]*z+v[11]))
                return out
            for obj in xml('Metadata/model_settings.config').findall('object'):
                name=obj.find("metadata[@key='name']").get('value');matches=[r for r in row['inputs'] if Path(r['source'].replace('\\','/')).name==name];assert len(matches)==1
                src=a.source/matches[0]['source'].replace('\\','/');assert hashlib.sha256(src.read_bytes()).hexdigest()==matches[0]['sha256']
                before=centered(stl(src));after=centered(set(vertices('3D/3dmodel.model',obj.get('id'))))
                error=max(distance(before,after),distance(after,before));assert error<.001,(name,error)
                results.append(dict(source=matches[0]['source'],maxVertexErrorMm=error))
        print('Source geometry and print faces verified:',file.name,flush=True)
    report=dict(passed=True,models=len(results),maxVertexErrorMm=max(r['maxVertexErrorMm'] for r in results),toleranceMm=.001,results=results)
    a.output.write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='results'}))


if __name__=='__main__':main()

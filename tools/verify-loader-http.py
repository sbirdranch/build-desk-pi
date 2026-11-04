"""Three real builds, fabricated components and printer exclusion on CLONES only."""
import argparse
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--url',default='http://127.0.0.1:4178');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    assert a.url in ['http://127.0.0.1:4177','http://127.0.0.1:4178'];a.output.mkdir(exist_ok=True)
    token='';timings=[]
    def request(route,body=None):
        start=time.monotonic();req=urllib.request.Request(a.url+route,data=json.dumps(body).encode() if body else None,headers={'Origin':a.url,'Content-Type':'application/json','x-builddesk-token':token})
        try:
            with urllib.request.urlopen(req,timeout=90) as r:
                raw=r.read();result=(r.status,json.loads(raw) if r.headers.get_content_type()=='application/json' else raw)
        except urllib.error.HTTPError as e:result=(e.code,e.read())
        timings.append(round(time.monotonic()-start,3));return result
    ids=['kitten-745','kitten-745-instance2','kitten-980-loader'];loader=ids[-1]
    assert {b['id'] for b in request('/api/builds')[1]}==set(ids)
    def view(id):
        code,v=request('/api/builds/'+id);assert code==200;return v
    initial={id:view(id) for id in ids};token=initial[loader]['editToken'];revisions={id:initial[id]['snapshot']['revision'] for id in ids}
    def snapshot(id):return view(id)['snapshot']
    def save(id,command,expected=200,request_id=None):
        code,result=request('/api/builds/'+id,dict(revision=revisions[id],requestId=request_id or str(uuid.uuid4()),command=command))
        assert code==expected,(code,result)
        if code!=200:return result
        state=result.get('snapshot') or result['view']['snapshot'];revisions[id]=state['revision'];return state
    def protected(state):
        s=json.loads(json.dumps(state));s['acquisition'].pop('vendors',None);return s
    old={id:protected(initial[id]['snapshot']) for id in ids[:-1]}
    def others_unchanged():
        for id in old:assert protected(snapshot(id))==old[id],id+' changed'
    state=initial[loader]['snapshot'];fabricated=[p for p in state['parts'] if p.get('fabrication')];printed=[p for p in state['parts'] if not p.get('fabrication')]
    assert len(fabricated)==26 and len(printed)==88 and len(state['plates'])==22
    assert not state['jobs'] and not any(p.get('preparation') for p in state['plates'])
    assert all(p['accepted']==0 for p in state['parts'])
    assert len(state['acquisition']['parts'])==59
    assert not {p['id'] for p in fabricated}&{p['id'] for p in state['acquisition']['parts']}
    assert not {p['id'] for p in fabricated}&{x['partId'] for p in state['plates'] for x in p['assignments']}
    assert len(initial[loader]['assets']['references'])==3
    for id in ids:
        assert all(f['available'] and not f['changed'] for f in initial[id]['sourceFiles'].values())
        assert not any(j['status']=='Printing' for j in initial[id]['snapshot']['jobs']),'Use idle clones'
    for part,method,qty in [(fabricated[0],'Hand made',2)]:
        command=dict(type='update-fabrication',partId=part['id'],required=part['required'],installed=0,notes=part['notes'],fabrication=dict(completed=qty,method=method))
        key=str(uuid.uuid4());state=save(loader,command,request_id=key)
        assert next(p for p in state['parts'] if p['id']==part['id'])['accepted']==qty
        assert not state['jobs'] and state['acquisition']['parts']==initial[loader]['snapshot']['acquisition']['parts'];others_unchanged()
        assert request('/api/builds/'+loader,dict(revision='0',requestId=key,command=command))[1]['replayed']
        save(loader,{**command,'installed':qty+1},expected=422)
        save(loader,{**command,'partId':printed[0]['id']},expected=422)
        save(loader,dict(type='save-acquisition',partId=part['id'],fields=dict(onHand=1,ordered=False,vendor='',url='',orderedDate='',notes='')),expected=422)
    # Only vendor suggestions cross build boundaries; purchases and printed parts do not.
    purchase=state['acquisition']['parts'][0]
    state=save(loader,dict(type='save-acquisition',partId=purchase['id'],fields=dict(onHand=13,ordered=True,vendor='Loader Validation Vendor',url=purchase['url'],orderedDate='',notes='Disposable loader sentinel')))
    others_unchanged()
    for id in ids[:-1]:assert 'Loader Validation Vendor' in snapshot(id)['acquisition']['vendors']
    for record in [initial[loader]['assets']['parts'][0],next(p for p in initial[loader]['assets']['parts'] if p['id']==fabricated[0]['id'])]:
        for field in ['thumbnail','model']:
            code,raw=request('/api/assets/'+loader+'/'+record[field]);assert code==200
            assert raw.startswith(b'glTF') if field=='model' else len(raw)>100
    for ref in initial[loader]['assets']['references']:
        code,raw=request('/api/assets/'+loader+'/'+ref['original']);assert code==200 and (raw.startswith(b'\xff\xd8') or raw.startswith(b'\x89PNG') or raw.startswith(b'RIFF') and raw[8:12]==b'WEBP')
    assert request('/api/assets/'+loader+'/%2e%2e%2fprivate.txt')[0] in [403,404]
    # Prepare each independent build; then the loader occupies the common printer.
    plates={}
    for id in ids:
        v=view(id);s=v['snapshot'];plate=next(p for p in s['plates'] if p['assignments'] and not p.get('unmappedObjects'));file=next(f for f in s['files'] if f['id']==plate['fileId'])
        material=next(m for m in v['config']['materials'] if ('TPU' in m)==('TPU' in file['material']))
        prep=dict(runs=1,material=material,profile=file['profile'],sourceHash=v['sourceFiles'][file['id']]['hash'],notes='Disposable three-build test',savedAt='',items=[dict(mappingId=x['id'],included=i==0,copies=1 if i==0 else 0,planned=1 if i==0 else 0) for i,x in enumerate(plate['assignments'])])
        save(id,dict(type='save-preparation',plateId=plate['id'],preparation=prep));plates[id]=plate
    old={id:protected(snapshot(id)) for id in ids[:-1]}
    state=save(loader,dict(type='start',plateId=plates[loader]['id']));job=next(j for j in state['jobs'] if j['status']=='Printing');others_unchanged()
    for id in ids[:-1]:save(id,dict(type='start',plateId=plates[id]['id']),expected=409)
    # Outsourcing/fabrication does not consume the printer or create purchase rows.
    part=fabricated[1];jobs=state['jobs'];purchases=state['acquisition']['parts']
    state=save(loader,dict(type='update-fabrication',partId=part['id'],required=part['required'],installed=0,notes=part['notes'],fabrication=dict(completed=1,method='Outsourced')))
    assert state['jobs']==jobs and state['acquisition']['parts']==purchases;others_unchanged()
    save(loader,dict(type='await-inspection',jobId=job['id']))
    state=save(loader,dict(type='finish',jobId=job['id'],results=[dict(mappingId=i['mappingId'],accepted=1,rejected=0) for i in job['items']]))
    assert sum(p['accepted'] for p in state['parts'] if not p.get('fabrication'))==1
    assert sum(p['accepted'] for p in state['parts'] if p.get('fabrication'))==3;others_unchanged()
    started=save(ids[0],dict(type='start',plateId=plates[ids[0]]['id']));before=snapshot(loader)
    save(loader,dict(type='start',plateId=plates[loader]['id']),expected=409)
    save(ids[0],dict(type='cancel',jobId=next(j['id'] for j in started['jobs'] if j['status']=='Printing')));assert snapshot(loader)==before
    old={id:protected(snapshot(id)) for id in ids[:-1]}
    # Both buckets contain duplicate basenames; exact source paths must resolve them.
    for file in [f for f in state['files'] if f['section'] in ['Knife Bucket','Teeth Bucket']]:
        code,result=request('/api/builds/'+loader,dict(action='refresh-file',fileId=file['id'],revision=revisions[loader],requestId=str(uuid.uuid4())))
        assert code==200,result;state=result['view']['snapshot'];revisions[loader]=state['revision']
        assert not any(p.get('unmappedObjects') for p in state['plates'] if p['fileId']==file['id']);others_unchanged()
        project=next(p for p in result['view']['assets']['projects'] if p['id']==file['id'])
        for plate in project['plates']:
            tracked=next(p for p in state['plates'] if p['id']==plate['id'])
            assert {i['part_id'] for i in plate['instances']}=={i['partId'] for i in tracked['assignments']},'Preview membership differs from tracked bucket membership'
        assert sum(p['accepted'] for p in state['parts'] if p.get('fabrication'))==3
    for id in ids:
        before=snapshot(id)
        for kind in ['source','status']:
            code,raw=request('/api/builds/'+id+'/purchasing/report?kind='+kind);assert code==200 and raw.startswith(b'%PDF');(a.output/(id+'-'+kind+'.pdf')).write_bytes(raw)
        assert snapshot(id)==before
    expected={id:snapshot(id) for id in ids};(a.output/'expected-after-restart.json').write_text(json.dumps(expected,sort_keys=True))
    result=dict(passed=True,builds=3,printedParts=88,fabricatedParts=26,plates=22,purchases=59,references=3,reports=6,maxRequestSeconds=max(timings),checks='Independent writes and replay; handmade/outsourced progress separate from printing/purchasing; shared vendors only; assets/photos; three-build printer exclusion; finish/cancel isolation; both bucket source paths; reports')
    (a.output/'http-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))


if __name__=='__main__':main()

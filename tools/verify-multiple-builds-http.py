"""Exercise real two-build isolation on a disposable loopback server only."""
import argparse
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url', default='http://127.0.0.1:4178')
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(); assert a.url in ['http://127.0.0.1:4177','http://127.0.0.1:4178']
    a.output.mkdir(exist_ok=True)
    token = ''; durations = []

    def request(route, body=None):
        start = time.monotonic()
        req = urllib.request.Request(a.url + route, data=json.dumps(body).encode() if body else None,
            headers={'Origin':a.url,'Content-Type':'application/json','x-builddesk-token':token})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                raw=r.read(); result=(r.status,json.loads(raw) if r.headers.get_content_type()=='application/json' else raw)
        except urllib.error.HTTPError as e: result=(e.code,e.read())
        durations.append(round(time.monotonic()-start,3)); return result

    ids = ['kitten-745','kitten-745-instance2']; routes = {id:'/api/builds/'+id for id in ids}
    assert {b['id'] for b in request('/api/builds')[1]} == set(ids)
    views = {id:request(routes[id])[1] for id in ids}; token=views[ids[0]]['editToken']
    initial = {id:views[id]['snapshot'] for id in ids}; revisions={id:initial[id]['revision'] for id in ids}
    first, second = ids
    assert len(initial[second]['parts'])==101 and not initial[second]['jobs']
    assert all(p['accepted']==0 and p['required'] is None for p in initial[second]['parts'])
    assert not any(p.get('preparation') for p in initial[second]['plates'])
    assert all(p['onHand']==0 and not p['ordered'] and not p['vendor'] for p in initial[second]['acquisition']['parts'])
    assert {p['id'] for p in initial[first]['parts']} == {p['id'] for p in initial[second]['parts']}
    assert not any(j['status']=='Printing' for s in initial.values() for j in s['jobs']), 'Use idle cloned data'

    def snapshot(id):
        code, v=request(routes[id]); assert code==200; return v['snapshot']

    def save(id, command, request_id=None, expected=200):
        body=dict(revision=revisions[id],requestId=request_id or str(uuid.uuid4()),command=command)
        code, result=request(routes[id],body); assert code==expected,(code,result)
        if code!=200:return result
        s=result.get('snapshot') or result['view']['snapshot']; revisions[id]=s['revision']; return s

    # Identical entity IDs have independent requirements and durable request keys.
    part_id=initial[first]['parts'][0]['id']; shared_request=str(uuid.uuid4())
    command=dict(type='update-part',partId=part_id,required=7,installed=0,notes='Disposable second-truck isolation')
    s=save(second,command,shared_request); assert snapshot(first)==initial[first]
    first_part=initial[first]['parts'][0]
    save(first,dict(type='update-part',partId=part_id,required=first_part['required'],installed=first_part['installed'],notes=first_part['notes']),shared_request)
    assert snapshot(second)==s
    # Purchasing changes never change the first build; vendor suggestions alone are shared.
    baseline=snapshot(first); purchase=s['acquisition']['parts'][0]
    s=save(second,dict(type='save-acquisition',partId=purchase['id'],fields=dict(onHand=13,ordered=True,vendor='Truck Two Isolation Vendor',url='',orderedDate='',notes='Clone-only sentinel')))
    check=snapshot(first)
    assert check['acquisition']['parts']==baseline['acquisition']['parts']
    assert check['parts']==baseline['parts'] and check['jobs']==baseline['jobs']
    assert 'Truck Two Isolation Vendor' in check['acquisition']['vendors']
    # Separate asset trees, matching sources, usable image/GLB, traversal rejection.
    for id in ids:
        v=request(routes[id])[1]
        assert all(f['available'] and not f['changed'] for f in v['sourceFiles'].values())
        for field in ['thumbnail','model']:
            relative=v['assets']['parts'][0][field]
            code, raw=request('/api/assets/'+id+'/'+relative); assert code==200,(id,code)
            assert raw.startswith(b'glTF') if field=='model' else len(raw)>100
        assert request('/api/assets/'+id+'/%2e%2e%2fprivate.txt')[0] in [403,404]
    # Prepare both builds, then enforce the common physical printer across builds.
    selected={}
    for id in ids:
        v=request(routes[id])[1]
        plate=next(p for p in v['snapshot']['plates'] if p['assignments'] and not p.get('unmappedObjects'))
        f=next(f for f in v['snapshot']['files'] if f['id']==plate['fileId'])
        material=next(m for m in v['config']['materials'] if ('TPU' in m)==('TPU' in f['material']))
        prep=dict(runs=1,material=material,profile=f['profile'],sourceHash=v['sourceFiles'][f['id']]['hash'],notes='Clone-only isolation',savedAt='',items=[dict(mappingId=m['id'],included=n==0,copies=1 if n==0 else 0,planned=1 if n==0 else 0) for n,m in enumerate(plate['assignments'])])
        save(id,dict(type='save-preparation',plateId=plate['id'],preparation=prep)); selected[id]=plate
    first_before=snapshot(first)
    s=save(second,dict(type='start',plateId=selected[second]['id']))
    assert snapshot(first)==first_before
    save(first,dict(type='start',plateId=selected[first]['id']),expected=409)
    job=next(j for j in s['jobs'] if j['status']=='Printing')
    save(second,dict(type='await-inspection',jobId=job['id']))
    results=[dict(mappingId=i['mappingId'],accepted=1,rejected=0) for i in job['items']]
    s=save(second,dict(type='finish',jobId=job['id'],results=results))
    assert sum(p['accepted'] for p in s['parts'])==1
    assert snapshot(first)==first_before
    first_started=save(first,dict(type='start',plateId=selected[first]['id']))
    assert snapshot(second)==s
    first_job=next(j for j in first_started['jobs'] if j['status']=='Printing')
    save(first,dict(type='cancel',jobId=first_job['id'])); assert snapshot(second)==s
    # Refresh second-instance membership without changing the original or copying preparations.
    f=s['files'][0]; before_first=snapshot(first)
    code, refreshed=request(routes[second],dict(action='refresh-file',fileId=f['id'],revision=revisions[second],requestId=str(uuid.uuid4())))
    assert code==200,refreshed
    revisions[second]=refreshed['view']['snapshot']['revision']; assert snapshot(first)==before_first
    for id in ids:
        for kind in ['source','status']:
            code,pdf=request(routes[id]+'/purchasing/report?kind='+kind)
            assert code==200 and pdf.startswith(b'%PDF');(a.output/(id+'-'+kind+'.pdf')).write_bytes(pdf)
    final={id:snapshot(id) for id in ids}
    (a.output/'expected-after-restart.json').write_text(json.dumps(final,sort_keys=True))
    result=dict(passed=True,builds=2,matchingPartIds=101,checks='Fresh state; same-ID writes and request keys; stock isolation and shared vendors; sources and assets; shared printer exclusion; finish isolation; refresh isolation; four scoped reports',maxRequestSeconds=max(durations))
    (a.output/'http-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))


if __name__=='__main__': main()

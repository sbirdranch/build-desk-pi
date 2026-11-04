"""Print lifecycle acceptance on a disposable loopback server; never production."""
import argparse
import json
import urllib.request
import urllib.error
import uuid


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url', default='http://127.0.0.1:4177')
    a = p.parse_args()
    assert a.url in ['http://127.0.0.1:4177', 'http://127.0.0.1:4178']
    token = ''

    def request(route, body=None):
        headers = {'Origin': a.url, 'Content-Type': 'application/json', 'x-builddesk-token': token}
        req = urllib.request.Request(a.url + route, data=json.dumps(body).encode() if body else None, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    _, registry = request('/api/builds')
    id = next(b['id'] for b in registry if b['active'])
    route = '/api/builds/' + id
    code, view = request(route)
    assert code == 200
    token = view['editToken']
    initial = view['snapshot']
    assert not any(j['status'] == 'Printing' for j in initial['jobs']), 'Use an idle disposable fixture'
    plate = next(p for p in initial['plates'] if p['assignments'] and not p.get('unmappedObjects') and view['sourceFiles'][p['fileId']]['available'] and not view['sourceFiles'][p['fileId']]['changed'])
    file = next(f for f in initial['files'] if f['id'] == plate['fileId'])
    material = next(m for m in view['config']['materials'] if ('TPU' in m) == ('TPU' in file['material']))
    prep = dict(runs=1, material=material, profile=file['profile'] or view['config']['defaultProfile'], sourceHash=view['sourceFiles'][file['id']]['hash'], items=[dict(mappingId=m['id'], included=i == 0, copies=1 if i == 0 else 0, planned=1 if i == 0 else 0) for i, m in enumerate(plate['assignments'])], notes='Disposable Phase 3 acceptance', savedAt='')
    revision = initial['revision']
    bad = json.loads(json.dumps(prep));bad['items'][0]['copies'] = None;bad['layoutConfirmed'] = True
    code, _ = request(route, dict(revision=revision, requestId=str(uuid.uuid4()), command=dict(type='save-preparation', plateId=plate['id'], preparation=bad)))
    assert code == 422

    def save(command):
        nonlocal revision
        body = dict(revision=revision, requestId=str(uuid.uuid4()), command=command)
        code, result = request(route, body)
        assert code == 200, result
        snapshot = result.get('snapshot') or result['view']['snapshot']
        revision = snapshot['revision']
        return snapshot, body

    snapshot, _ = save(dict(type='save-preparation', plateId=plate['id'], preparation={**prep, 'layoutConfirmed': False}))
    saved = next(p for p in snapshot['plates'] if p['id'] == plate['id'])['preparation']
    assert 'layoutConfirmed' not in saved
    assert snapshot['parts'] == initial['parts'] and snapshot['acquisition'] == initial['acquisition']
    snapshot, body = save(dict(type='start', plateId=plate['id']))
    job = next(j for j in snapshot['jobs'] if j['status'] == 'Printing')
    assert request(route, body)[1]['replayed']
    assert snapshot['parts'] == initial['parts']
    snapshot, _ = save(dict(type='await-inspection', jobId=job['id']))
    assert snapshot['parts'] == initial['parts']
    results = [dict(mappingId=i['mappingId'], accepted=1, rejected=0) for i in job['items']]
    snapshot, _ = save(dict(type='save-results', jobId=job['id'], results=results))
    assert snapshot['parts'] == initial['parts']
    snapshot, _ = save(dict(type='finish', jobId=job['id'], results=results))
    assert sum(p['accepted'] for p in snapshot['parts']) == sum(p['accepted'] for p in initial['parts']) + 1
    assert snapshot['acquisition'] == initial['acquisition']
    print(json.dumps({'passed': True, 'preparation': 'No acknowledgement; invalid quantities rejected', 'lifecycle': 'Save, Start, replay, inspection draft and Finish', 'protected': 'Original Printing history and Purchasing', 'writes': 'disposable copy only'}))


if __name__ == '__main__':
    main()

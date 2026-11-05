"""Exercise the Purchasing API only on a disposable loopback server (4177/4178)."""
import argparse
import datetime
import json
import pathlib
import urllib.error
import urllib.request
import uuid


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url', default='http://127.0.0.1:4177')
    p.add_argument('--reports', required=True)
    a = p.parse_args()
    assert a.url in ['http://127.0.0.1:4177', 'http://127.0.0.1:4178']
    folder = pathlib.Path(a.reports)
    folder.mkdir(exist_ok=True)
    token = ''

    def request(route, body=None, foreign=False):
        headers = {'Origin': 'https://foreign.invalid' if foreign else a.url}
        if body is not None:
            headers.update({'Content-Type': 'application/json', 'x-builddesk-token': token})
        req = urllib.request.Request(a.url + route, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                raw = r.read()
                return r.status, json.loads(raw) if r.headers.get_content_type() == 'application/json' else raw
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    assert request('/')[0] == 200
    code, registry = request('/api/builds')
    assert code == 200
    id = next(b['id'] for b in registry if b['active'])
    route = '/api/builds/' + id
    code, view = request(route)
    assert code == 200 and view['canEdit']
    token = view['editToken']
    initial = view['snapshot']
    assert 'acquisition' in initial and 'purchasing' not in initial
    part = initial['acquisition']['parts'][0]
    fields = {k: part[k] for k in ['onHand', 'ordered', 'vendor', 'url', 'alternateUrl', 'orderedDate', 'notes']}
    fields.update(alternateUrl='https://alternate.example.com/item', onHand=(part['required'] or 0) + 2, ordered=True, vendor='Acquisition Test Vendor', orderedDate=datetime.date.today().isoformat())
    revision = initial['revision']
    body = dict(revision=revision, requestId=str(uuid.uuid4()), command=dict(type='save-acquisition', partId=part['id'], fields={**fields, 'required': 999999, 'description': 'Must not change'}))
    code, saved = request(route, body)
    assert code == 200, saved
    snapshot = saved.get('snapshot') or saved['view']['snapshot']
    changed = next(p for p in snapshot['acquisition']['parts'] if p['id'] == part['id'])
    assert changed['required'] == part['required'] and changed['description'] == part['description']
    assert changed['onHand'] == fields['onHand'] and changed['ordered'] is True
    assert changed['alternateUrl'] == fields['alternateUrl']
    assert next(p for p in request(route)[1]['snapshot']['acquisition']['parts'] if p['id'] == part['id'])['alternateUrl'] == fields['alternateUrl']
    assert 'Acquisition Test Vendor' in snapshot['acquisition']['vendors']
    assert snapshot['parts'] == initial['parts'] and snapshot['jobs'] == initial['jobs'] and snapshot['audit'] == initial['audit']
    code, replay = request(route, body)
    assert code == 200 and replay['replayed']
    assert request(route, {**body, 'requestId': str(uuid.uuid4())})[0] == 409
    assert request(route, body, foreign=True)[0] == 403
    revision = snapshot['revision']
    for update in [dict(onHand=-1), dict(onHand=1.5), dict(notes='x' * 201), dict(notes='é'), dict(url='javascript:alert(1)'), dict(alternateUrl='javascript:alert(1)'), dict(alternateUrl='https://user:password@example.com'), dict(orderedDate='2026-02-30')]:
        bad = dict(type='save-acquisition', partId=part['id'], fields={**fields, **update})
        assert request(route, dict(revision=revision, requestId=str(uuid.uuid4()), command=bad))[0] == 422
    fields['ordered'] = False
    code, saved = request(route, dict(revision=revision, requestId=str(uuid.uuid4()), command=dict(type='save-acquisition', partId=part['id'], fields=fields)))
    assert code == 200
    changed = next(p for p in (saved.get('snapshot') or saved['view']['snapshot'])['acquisition']['parts'] if p['id'] == part['id'])
    assert changed['ordered'] is False and changed['onHand'] == fields['onHand'] and changed['orderedDate'] == fields['orderedDate']
    assert request(route + '/purchasing', {'action': 'check'})[0] == 405
    before = request(route)[1]['snapshot']['revision']
    for kind in ['source', 'status']:
        code, pdf = request(route + '/purchasing/report?kind=' + kind + '&filter=missing-part')
        assert code == 200 and pdf.startswith(b'%PDF')
        (folder / (id + '-' + kind + '.pdf')).write_bytes(pdf)
    assert request(route)[1]['snapshot']['revision'] == before
    print(json.dumps({'passed': True, 'parts': len(initial['acquisition']['parts']), 'printParts': len(initial['parts']), 'jobs': len(initial['jobs']), 'accepted': sum(p['accepted'] for p in initial['parts']), 'reports': 2, 'checks': 'stock/Ordered independence, protected designer/Printing data, replay, conflicts, origin, validation, retired queue POST, nonmutating full-build reports'}))


if __name__ == '__main__':
    main()

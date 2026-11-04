"""HTTP acceptance writes are restricted to the disposable loopback server on 4177."""
import argparse
import json
import pathlib
import urllib.request
import urllib.error
import uuid


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--stage', required=True)
    p.add_argument('--commit', required=True)
    args = p.parse_args()
    stage = pathlib.Path(args.stage)
    origin = 'http://127.0.0.1:4177'
    def request(path, payload=None, foreign=False):
        headers = {'Origin': 'https://example.invalid' if foreign else origin}
        if payload is not None:
            headers.update({'Content-Type': 'application/json', 'x-builddesk-token': token})
        r = urllib.request.Request(origin + path, data=json.dumps(payload).encode() if payload else None, headers=headers)
        try:
            with urllib.request.urlopen(r, timeout=90) as response:
                data = response.read()
                return response.status, json.loads(data) if response.headers.get_content_type() == 'application/json' else data
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)
    assert request('/')[0] == 200
    assert request('/api/health')[0] == 200
    assert request('/api/builds')[0] == 200
    code, view = request('/api/builds/kitten-745')
    assert code == 200 and view['canEdit']
    snapshot = view['snapshot']
    assert snapshot['revision'] == '0'
    assert len(snapshot['parts']) == 101 and len(snapshot['jobs']) == 29
    assert sum(p['accepted'] for p in snapshot['parts']) == 116
    assert len(snapshot['purchasing']['items']) == 15 and len(snapshot['audit']) == 176
    token = view['editToken']
    part = snapshot['parts'][0]
    payload = dict(revision='0', requestId=str(uuid.uuid4()), command=dict(type='update-part', partId=part['id'], required=part['required'], installed=part['installed'], notes=part['notes']))
    code, saved = request('/api/builds/kitten-745', payload)
    assert code == 200, saved
    assert saved['view']['snapshot']['revision'] == '1'
    assert saved['view']['snapshot']['purchasing'] == snapshot['purchasing']
    code, replay = request('/api/builds/kitten-745', payload)
    assert code == 200 and replay['replayed']
    payload['requestId'] = str(uuid.uuid4())
    assert request('/api/builds/kitten-745', payload)[0] == 409
    assert request('/api/builds/kitten-745', payload, foreign=True)[0] == 403
    purchase = snapshot['purchasing']['parts'][0]
    payload = dict(revision='1', requestId=str(uuid.uuid4()), command=dict(type='purchasing', operation=dict(kind='part', partId=purchase['id'], needed=purchase['needed'], onHand=purchase['onHand'], reason='Disposable HTTP acceptance')))
    code, saved = request('/api/builds/kitten-745', payload)
    assert code == 200 and saved['snapshot']['revision'] == '2', saved
    assert sum(p['accepted'] for p in saved['snapshot']['parts']) == 116
    assert len(list((stage / 'backups').glob('*.db'))) >= 2
    (stage / 'http-passed').write_text(args.commit + '\n')
    print('Passed HTTP reads, Printing/Purchasing saves, replay, conflict, origin and backup checks on disposable DB')


if __name__ == '__main__':
    main()

"""Validation-gated second-truck cutover. Retain the current DB and registry.

Build a new database from the latest stopped production snapshot. Never replace
an existing build's records or roll back over post-cutover edits.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import time
import urllib.request


def load_registration():
    spec=importlib.util.spec_from_file_location('registration',Path(__file__).with_name('register-build-instance.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--stage',type=Path,required=True);p.add_argument('--execute',action='store_true');a=p.parse_args()
    base=Path('/home/preston/build-desk').resolve();stage=a.stage.resolve()
    assert stage.is_relative_to(base/'local-data') and stage!=base/'local-data'
    gates=json.loads((stage/'accepted.json').read_text());assert all(gates[k] is True for k in ['tests','typecheck','build','http','restart','reports','nativeProjects','assets'])
    manifest=stage/'ready/instance.json';m=json.loads(manifest.read_text());id=m['id'];assert id=='kitten-745-instance2'
    assert hashlib.sha256(manifest.read_bytes()).hexdigest()==gates['manifestSha256']
    registry=base/'local-data/builds.pi.json';reg=json.loads(registry.read_text());assert len(reg['builds'])==1 and reg['builds'][0]['id']=='kitten-745'
    assert reg['builds'][0]['store']['kind']=='sqlite'
    source=(base/reg['builds'][0]['store']['path']).resolve();assert source.is_relative_to(base/'local-data')
    models=Path('/mnt/builddesk/BambuProjects/RC_Cat745instance2')
    for f in m['files']:assert hashlib.sha256((models/f['filename']).read_bytes()).hexdigest()==f['sourceHash']
    assert json.loads((stage/'ready/native-validation.json').read_text())['passed'] is True
    root=base/'local-data'/id;assert not root.exists(),'Existing instance must never be overwritten'
    if not a.execute:print('Preflight passed; production unchanged');return
    os.umask(0o077);stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    saved=base/'local-data/releases'/('second-truck-before-'+stamp);saved.mkdir()
    target=base/'local-data'/('build-desk-two-trucks-'+stamp+'.db')
    lock=base/'local-data/second-truck-deploy.lock';fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    service=lambda action:subprocess.run(['systemctl','--user',action,'build-desk'],check=True)
    switched=False;stopped=False;expected=[];registration=load_registration()
    try:
        service('stop');stopped=True
        with sqlite3.connect('file:'+source.as_posix()+'?mode=ro',uri=True) as db:
            before=registration.build_fingerprints(db)
            expected=db.execute('SELECT build_id,revision FROM build_revisions ORDER BY build_id').fetchall()+[(id,0)]
            with sqlite3.connect(saved/'database-before.db') as copy:db.backup(copy)
        shutil.copy2(registry,saved/'registry-before.json');shutil.copy2(base/'local-data/release.json',saved/'release-before.json')
        shutil.copy2(manifest,saved/'instance.json');shutil.copy2(stage/'accepted.json',saved/'accepted.json')
        registration.register(saved/'database-before.db',target,manifest)
        root.mkdir();shutil.copytree(stage/'ready/assets',root/'assets')
        shutil.copy2(stage/'ready/README.txt',root/'README.txt')
        first=reg['builds'][0];second=json.loads(json.dumps(first));second.update(id=id,name=m['name'])
        second['assets']=dict(root=str((root/'assets').relative_to(base)),catalog='catalog.json',references='references.json')
        second['models']=dict(directory=str(models));reg['builds'].append(second)
        for b in reg['builds']:b['store']['path']=str(target.relative_to(base))
        with sqlite3.connect(target) as db:assert before==registration.build_fingerprints(db,excluded=id)
        pending=registry.with_suffix('.pending');pending.write_text(json.dumps(reg,indent=2));os.replace(pending,registry);switched=True
        service('start')
        for attempt in range(30):
            try:
                for b in reg['builds']:
                    with urllib.request.urlopen('http://127.0.0.1:4174/api/builds/'+b['id'],timeout=30) as response:v=json.load(response)
                    assert all(x['available'] and not x['changed'] for x in v['sourceFiles'].values())
                    if b['id']==id:
                        assert len(v['snapshot']['parts'])==101 and len(v['snapshot']['plates'])==24
                        assert not v['snapshot']['jobs'] and v['snapshot']['revision']=='0'
                        assert all(x['accepted']==0 for x in v['snapshot']['parts'])
                        assert all(x['onHand']==0 and not x['ordered'] for x in v['snapshot']['acquisition']['parts'])
                break
            except Exception:
                if attempt==29:raise
                time.sleep(1)
        with sqlite3.connect(target) as db:assert before==registration.build_fingerprints(db,excluded=id)
        record=json.loads((base/'local-data/release.json').read_text());record.update(phase='Phase 4 — second truck; loader pending',database=str(target),previousDatabase=str(source),rollbackDirectory=str(saved),databaseUnchanged=False,existingDataUnchanged=True,baselineRevisions=expected,acceptanceCommit=gates['commit'],verifiedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        (saved/'existing-data-fingerprints.json').write_text(json.dumps(before,indent=2));(saved/'cutover.json').write_text(json.dumps(record,indent=2));(base/'local-data/release.json').write_text(json.dumps(record,indent=2))
        print(json.dumps(record,indent=2))
    except Exception:
        if stopped:
            service('stop')
            safe=not switched
            if switched:
                with sqlite3.connect(target) as db:safe=db.execute('SELECT build_id,revision FROM build_revisions ORDER BY build_id').fetchall()==sorted(expected)
            if safe:
                if (saved/'registry-before.json').exists():shutil.copy2(saved/'registry-before.json',registry)
                if (saved/'release-before.json').exists():shutil.copy2(saved/'release-before.json',base/'local-data/release.json')
            service('start')
            if not safe:print('Post-cutover edits detected. Retained new database and registry; reconcile before rollback.')
        raise
    finally:lock.unlink(missing_ok=True)


if __name__=='__main__':main()

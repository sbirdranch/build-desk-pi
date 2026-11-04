"""Atomic code/registry/schema cutover for the accepted third vehicle.

Always rebuild from the latest stopped production snapshot. Keep prior code,
registry and schema-3 database; never roll back over newer user revisions.
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
import tarfile
import time
import urllib.request


def existing_rows(db):
    return {r[0]:db.execute('SELECT * FROM "'+r[0]+'" ORDER BY rowid').fetchall() for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()}


def compare_existing(before,db,new_id):
    for table,rows in before.items():
        columns=[r[1] for r in db.execute('PRAGMA table_info("'+table+'")')]
        key='id' if table=='builds' else 'build_id' if 'build_id' in columns else None
        sql='SELECT * FROM "'+table+'"';args=[]
        if key:sql+=' WHERE "'+key+'" != ?';args=[new_id]
        actual=db.execute(sql+' ORDER BY rowid',args).fetchall()
        assert (actual[:len(rows)] if table=='schema_migrations' else actual)==rows,table+' changed'
    assert db.execute('SELECT count(*) FROM fabrication_parts WHERE build_id!=?',(new_id,)).fetchone()[0]==0


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--stage',type=Path,required=True);p.add_argument('--commit',required=True);p.add_argument('--execute',action='store_true');a=p.parse_args()
    base=Path('/home/preston/build-desk').resolve();stage=a.stage.resolve();assert stage.is_relative_to(base/'local-data') and stage!=base/'local-data'
    gates=json.loads((stage/'accepted.json').read_text());assert gates['commit']==a.commit
    assert all(gates[k] is True for k in ['tests','typecheck','build','migration','http','restart','reports','ui','assets','printFaces','nasModels'])
    manifest=stage/'ready/instance.json';m=json.loads(manifest.read_text());id=m['id'];assert id=='kitten-980-loader'
    assert hashlib.sha256(manifest.read_bytes()).hexdigest()==gates['manifestSha256']
    assert len(m['parts'])==114 and sum(bool(p.get('fabrication')) for p in m['parts'])==26
    registry=base/'local-data/builds.pi.json';reg=json.loads(registry.read_text());assert [b['id'] for b in reg['builds']]==['kitten-745','kitten-745-instance2']
    databases={(base/b['store']['path']).resolve() for b in reg['builds']};assert len(databases)==1
    source=databases.pop();assert source.is_relative_to(base/'local-data')
    with sqlite3.connect('file:'+source.as_posix()+'?mode=ro',uri=True) as db:assert db.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0]==3
    for name in ['package-lock.json','web/package-lock.json']:assert (base/name).read_bytes()==(stage/name).read_bytes()
    models=Path('/mnt/builddesk/BambuProjects/RC_Kitten980WheeledLoader')
    for file in m['files']:assert hashlib.sha256((models/file['filename']).read_bytes()).hexdigest()==file['sourceHash']
    hashes=json.loads((stage/'asset-hashes.json').read_text())
    for name,sha in hashes.items():assert hashlib.sha256((stage/'ready/assets'/name).read_bytes()).hexdigest()==sha
    destination=base/'local-data'/id;assert not destination.exists(),'Never overwrite an existing build'
    if not a.execute:print('Preflight passed; production unchanged');return
    os.umask(0o077);stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');saved=base/'local-data/releases'/('loader-before-'+stamp);saved.mkdir()
    target=base/'local-data'/('build-desk-loader-'+stamp+'.db');lock=base/'local-data/loader-deploy.lock';fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    service=lambda action:subprocess.run(['systemctl','--user',action,'build-desk'],check=True)
    env=dict(os.environ,PATH='/home/preston/.local/node/bin:'+os.environ['PATH']);moved=[];stopped=False;switched=False;expected=[]
    directories=['web/src','web/scripts','web/tests','web/.next','tools','docs','config/designer']
    try:
        service('stop');stopped=True
        with sqlite3.connect('file:'+source.as_posix()+'?mode=ro',uri=True) as db:
            before=existing_rows(db);expected=db.execute('SELECT build_id,revision FROM build_revisions ORDER BY build_id').fetchall()+[(id,0)]
            with sqlite3.connect(saved/'database-before.db') as copy:db.backup(copy)
        shutil.copy2(registry,saved/'registry-before.json');shutil.copy2(base/'local-data/release.json',saved/'release-before.json')
        subprocess.run(['tar','--exclude=web/.next/cache','-cf',str(saved/'code-before.tar'),*directories,'web/server.mjs','web/next.config.mjs','web/package.json','web/package-lock.json'],cwd=base,check=True)
        subprocess.run(['tar','-czf',str(saved/'runtime-before.tar.gz'),'local-data/builds.pi.json','local-data/kitten-745','local-data/kitten-745-instance2','local-data/printers','config','assets/generated'],cwd=base,check=True)
        with (saved/'migration.log').open('w') as log:subprocess.run(['node','--import','tsx','scripts/migrate-fabrication.ts','--source',str(saved/'database-before.db'),'--output',str(saved/'schema4-before-loader.db')],cwd=stage/'web',env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
        subprocess.run(['python3',str(stage/'tools/register-build-instance.py'),'--source',str(saved/'schema4-before-loader.db'),'--output',str(target),'--manifest',str(manifest)],check=True)
        with sqlite3.connect(target) as db:compare_existing(before,db,id);assert not db.execute('PRAGMA foreign_key_check').fetchall()
        destination.mkdir();shutil.copytree(stage/'ready/assets',destination/'assets');shutil.copy2(stage/'ready/README.txt',destination/'README.txt');shutil.copy2(manifest,destination/'import-source.json')
        for name,sha in hashes.items():assert hashlib.sha256((destination/'assets'/name).read_bytes()).hexdigest()==sha
        for name in directories:
            old=base/name;previous=saved/(name.replace('/','-')+'-before');old.rename(previous);moved.append((old,previous))
            shutil.copytree(stage/name,old,ignore=shutil.ignore_patterns('cache') if name=='web/.next' else None)
        loader=json.loads(json.dumps(reg['builds'][-1]));loader.update(id=id,name=m['name']);loader['assets']=dict(root=str((destination/'assets').relative_to(base)),catalog='catalog.json',references='references.json');loader['models']=dict(directory=str(models));loader['workflow'].update(defaultProfile='Kitten 980 PETG',materials=['PETG','PETG HF']);reg['builds'].append(loader)
        for build in reg['builds']:build['store']['path']=str(target.relative_to(base))
        pending=registry.with_suffix('.pending');pending.write_text(json.dumps(reg,indent=2));os.replace(pending,registry);switched=True;service('start')
        for attempt in range(30):
            try:
                for build in reg['builds']:
                    with urllib.request.urlopen('http://127.0.0.1:4174/api/builds/'+build['id'],timeout=30) as response:view=json.load(response)
                    assert all(f['available'] and not f['changed'] for f in view['sourceFiles'].values())
                    if build['id']==id:
                        s=view['snapshot'];assert s['revision']=='0' and len(s['parts'])==114 and not s['jobs'] and not any(p.get('preparation') for p in s['plates'])
                        assert all(p['accepted']==0 for p in s['parts']);assert len(view['assets']['references'])==3
                        assert len(s['acquisition']['parts'])==59 and all(p['onHand']==0 and not p['ordered'] for p in s['acquisition']['parts'])
                break
            except Exception:
                if attempt==29:raise
                time.sleep(1)
        with sqlite3.connect(target) as db:compare_existing(before,db,id);assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        record=dict(commit=a.commit,branch='Refinement_v2',phase='Phase 4 — loader and fabricated components',database=str(target),previousDatabase=str(source),schema=4,rollbackDirectory=str(saved),baselineRevisions=sorted(expected),existingDataUnchanged=True,validated=True,deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        for name in ['accepted.json','asset-hashes.json']:shutil.copy2(stage/name,saved/name)
        (saved/'cutover.json').write_text(json.dumps(record,indent=2));(base/'local-data/release.json').write_text(json.dumps(record,indent=2));print(json.dumps(record,indent=2))
    except Exception:
        if stopped:
            service('stop');safe=not switched
            if switched:
                with sqlite3.connect(target) as db:safe=db.execute('SELECT build_id,revision FROM build_revisions ORDER BY build_id').fetchall()==sorted(expected)
            if safe:
                if (saved/'registry-before.json').exists():shutil.copy2(saved/'registry-before.json',registry)
                for old,previous in reversed(moved):
                    if old.exists():old.rename(saved/('failed-'+previous.name))
                    previous.rename(old)
                if (saved/'release-before.json').exists():shutil.copy2(saved/'release-before.json',base/'local-data/release.json')
            service('start')
            if not safe:print('New user revisions exist. Retained current code/database; preserve latest data before reconciling rollback.')
        raise
    finally:lock.unlink(missing_ok=True)


if __name__=='__main__':main()

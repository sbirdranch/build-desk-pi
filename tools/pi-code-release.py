"""Validation-gated code-only Pi release. Preserve the selected database on rollback."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import tarfile
import time
import urllib.request


def database_digest(file):
    with sqlite3.connect('file:' + str(file) + '?mode=ro', uri=True) as db:
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        return {name: hashlib.sha256(json.dumps(db.execute('SELECT * FROM "' + name + '" ORDER BY rowid').fetchall(), ensure_ascii=False).encode()).hexdigest() for name in tables}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', required=True)
    parser.add_argument('--commit', required=True)
    a = parser.parse_args()
    base = pathlib.Path('/home/preston/build-desk').resolve()
    stage = pathlib.Path(a.stage).resolve()
    assert stage.is_relative_to(base / 'local-data') and stage != base / 'local-data'
    assert (stage / 'http-passed').exists() and (stage / 'build-passed').exists()
    assert 'ℹ fail 0' in (stage / 'tests.log').read_text()
    for name in ['package-lock.json', 'web/package-lock.json']:
        assert (base / name).read_bytes() == (stage / name).read_bytes(), 'Dependency changes need a different deployment procedure'
    os.umask(0o077)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    saved = base / 'local-data/releases' / ('printing-before-' + stamp)
    saved.mkdir()
    registry = json.loads((base / 'local-data/builds.pi.json').read_text())
    databases = {(base / b['store']['path']).resolve() for b in registry['builds']}
    assert all(p.is_relative_to(base / 'local-data') for p in databases)
    directories = ['web/src', 'web/scripts', 'web/.next', 'tools', 'docs']
    moved = []
    service = lambda action: subprocess.run(['systemctl', '--user', action, 'build-desk'], check=True)
    service('stop')
    try:
        fingerprints = {str(db): database_digest(db) for db in databases}
        for i, db in enumerate(databases):
            with sqlite3.connect('file:' + str(db) + '?mode=ro', uri=True) as source, sqlite3.connect(saved / ('database-before-' + str(i) + '.db')) as target:
                source.backup(target)
        shutil.copy2(base / 'local-data/release.json', saved / 'release-before.json')
        subprocess.run(['tar', '-czf', str(saved / 'runtime-before.tar.gz'), 'local-data/builds.pi.json', 'local-data/kitten-745', 'local-data/printers', 'config', 'assets/generated'], cwd=base, check=True)
        subprocess.run(['tar', '--exclude=web/.next/cache', '-cf', str(saved / 'code-before.tar'), *directories, 'web/server.mjs', 'web/next.config.mjs', 'web/package.json', 'web/package-lock.json'], cwd=base, check=True)
        for name in directories:
            old = base / name
            previous = saved / (name.replace('/', '-') + '-before')
            old.rename(previous)
            moved.append((old, previous))
            shutil.copytree(stage / name, old, ignore=shutil.ignore_patterns('cache') if name == 'web/.next' else None)
        assert fingerprints == {str(db): database_digest(db) for db in databases}, 'Production data changed during stopped deployment'
        service('start')
        for attempt in range(30):
            try:
                with urllib.request.urlopen('http://127.0.0.1:4174/api/builds/' + registry['builds'][0]['id'], timeout=15) as response:
                    view = json.load(response)
                assert all('layoutConfirmed' not in p.get('preparation', {}) for p in view['snapshot']['plates'])
                break
            except Exception:
                if attempt == 29:
                    raise
                time.sleep(1)
        record = json.loads((base / 'local-data/release.json').read_text())
        record.update(commit=a.commit, rollbackDirectory=str(saved), phase='Printing refinement', databaseUnchanged=True, deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        (base / 'local-data/release.json').write_text(json.dumps(record, indent=2))
        (saved / 'cutover.json').write_text(json.dumps(record, indent=2))
        (saved / 'database-fingerprints.json').write_text(json.dumps(fingerprints, indent=2))
        print(json.dumps(record, indent=2))
    except Exception:
        service('stop')
        for old, previous in reversed(moved):
            if old.exists():
                old.rename(saved / ('failed-' + old.name + '-' + previous.name))
            previous.rename(old)
        if (saved / 'release-before.json').exists():
            shutil.copy2(saved / 'release-before.json', base / 'local-data/release.json')
        service('start')
        raise


if __name__ == '__main__':
    main()

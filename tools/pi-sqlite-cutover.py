"""Offline, validation-gated cutover for the documented user-owned Pi install.

Run only after isolated tests/build/HTTP acceptance. Never delete or replace a DB.
Rollback automatically only while its revision is zero; preserve later writes.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    base = pathlib.Path('/home/preston/build-desk').resolve()
    stage = pathlib.Path(args.stage).resolve()
    assert stage.is_relative_to(base / 'local-data') and stage != base / 'local-data'
    assert (stage / 'build-passed').read_text().strip() == args.commit
    assert (stage / 'http-passed').read_text().strip() == args.commit
    assert 'ℹ fail 0' in (stage / 'tests.log').read_text()
    registry = base / 'local-data/builds.pi.json'
    config = json.loads(registry.read_text())
    assert len(config['builds']) == 1, 'This cutover is qualified for one existing build'
    build = config['builds'][0]
    assert build['active'] and build['store']['kind'] == 'excel'
    workbook = (base / build['store']['path']).resolve()
    assert workbook.is_relative_to(base / 'local-data')
    assert not pathlib.Path(str(workbook) + '.builddesk.lock').exists()
    assert not (workbook.parent / ('~$' + workbook.name)).exists()
    for name in ['package-lock.json', 'web/package-lock.json']:
        assert (base / name).read_bytes() == (stage / name).read_bytes()
    if not args.execute:
        print('Preflight passed; --execute performs the authorized cutover')
        return
    os.umask(0o077)
    lock = base / 'local-data/sqlite-cutover.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    saved = base / 'local-data/releases' / ('sqlite-before-' + stamp)
    saved.mkdir()
    target = base / 'local-data' / ('build-desk-' + stamp + '.db')
    env = dict(os.environ, PATH='/home/preston/.local/node/bin:' + os.environ['PATH'])
    switched = False
    code_saved = False
    stopped = False
    paths = ['web/src', 'web/server.mjs', 'web/next.config.mjs', 'tools', 'web/.next']
    def service(action):
        subprocess.run(['systemctl', '--user', action, 'build-desk'], check=True)
    def run_node(label, command):
        with (saved / (label + '.log')).open('w') as log:
            subprocess.run(['node', '--import', 'tsx', *command], cwd=stage / 'web', env=env,
                           stdout=log, stderr=subprocess.STDOUT, check=True)
    try:
        service('stop')
        stopped = True
        subprocess.run(['tar', '-czf', str(saved / 'data-before.tar.gz'),
                        'local-data/kitten-745', 'local-data/printers',
                        'local-data/builds.pi.json', 'local-data/release.json',
                        'config', 'assets/generated'], cwd=base, check=True)
        subprocess.run(['tar', '--exclude=web/.next/cache', '-cf', str(saved / 'code-before.tar'),
                        *paths], cwd=base, check=True)
        code_saved = True
        shutil.copy2(registry, saved / 'registry-before.json')
        shutil.copy2(workbook, saved / 'final-tracker.xlsx')
        source_hash = hashlib.sha256(workbook.read_bytes()).hexdigest()
        (saved / 'source.sha256').write_text(source_hash + '\n')
        run_node('migration', ['scripts/migrate-sqlite.mjs', '--workbook', str(saved / 'final-tracker.xlsx'),
                              '--output', str(target), '--build-id', build['id'], '--name', build['name'],
                              '--printer-id', build.get('printer', {}).get('id', 'build-' + build['id'])])
        run_node('validation', ['scripts/validate-sqlite.ts', '--database', str(target), '--registry', str(registry)])
        assert hashlib.sha256(workbook.read_bytes()).hexdigest() == source_hash
        # Source and ARM64 build were validated in isolation. Preserve machine config and all assets.
        for name in ['web/src', 'web/scripts', 'web/.next', 'tools']:
            shutil.copytree(stage / name, base / name, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('cache') if name == 'web/.next' else None)
        for name in ['web/server.mjs', 'web/next.config.mjs']:
            shutil.copy2(stage / name, base / name)
        build['store'] = dict(kind='sqlite', path=str(target.relative_to(base)), schema='build-desk-v2')
        pending = saved / 'registry-after.json'
        pending.write_text(json.dumps(config, indent=2))
        shutil.copy2(pending, registry.with_suffix('.pending'))
        os.replace(registry.with_suffix('.pending'), registry)
        switched = True
        service('start')
        for attempt in range(30):
            try:
                with urllib.request.urlopen('http://127.0.0.1:4174/api/builds/' + build['id'], timeout=10) as r:
                    live = json.load(r)
                assert live['snapshot']['revision'] == '0'
                assert live['snapshot']['parts'] and live['snapshot']['jobs']
                break
            except Exception:
                if attempt == 29:
                    raise
                time.sleep(1)
        workbook.chmod(0o444)
        record = dict(commit=args.commit, branch='Refinement_v2', database=str(target),
                      rollbackDirectory=str(saved), sourceSha256=source_hash, validated=True,
                      deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        (base / 'local-data/release.json').write_text(json.dumps(record, indent=2))
        (saved / 'cutover.json').write_text(json.dumps(record, indent=2))
        print(json.dumps(record, indent=2))
    except Exception:
        if stopped:
            service('stop')
            safe = True
            if switched:
                try:
                    with sqlite3.connect('file:' + str(target) + '?mode=ro', uri=True) as db:
                        safe = db.execute('SELECT MAX(revision) FROM build_revisions').fetchone()[0] == 0
                except Exception:
                    safe = False
            if safe:
                if code_saved:
                    subprocess.run(['tar', '-xf', str(saved / 'code-before.tar')], cwd=base, check=True)
                if (saved / 'registry-before.json').exists():
                    shutil.copy2(saved / 'registry-before.json', registry)
                service('start')
                print('Previous Excel service restored; all migration artifacts retained')
            else:
                print('Service stopped: SQLite may contain newer writes. Preserve DB and reconcile before rollback.')
        raise
    finally:
        lock.unlink()


if __name__ == '__main__':
    main()

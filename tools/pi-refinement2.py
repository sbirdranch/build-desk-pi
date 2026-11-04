"""Install an accepted Purchasing release on the documented user-owned Pi.

No in-place schema upgrade: retain old code, dependencies, registry and DB.
Automatic rollback is allowed only if no post-cutover revisions were recorded.
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
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--stage', required=True)
    p.add_argument('--commit', required=True)
    p.add_argument('--execute', action='store_true')
    a = p.parse_args()
    base = pathlib.Path('/home/preston/build-desk').resolve()
    stage = pathlib.Path(a.stage).resolve()
    assert stage.is_relative_to(base / 'local-data') and stage != base / 'local-data'
    gates = json.loads((stage / 'accepted.json').read_text())
    assert gates['commit'] == a.commit and all(gates[k] is True for k in ['tests', 'build', 'migration', 'http'])
    registry = base / 'local-data/builds.pi.json'
    config = json.loads(registry.read_text())
    assert all(b['store']['kind'] == 'sqlite' for b in config['builds'])
    sources = {(base / b['store']['path']).resolve() for b in config['builds']}
    assert len(sources) == 1, 'This release uses a single shared database'
    source = sources.pop()
    assert source.is_relative_to(base / 'local-data')
    with sqlite3.connect('file:' + str(source) + '?mode=ro', uri=True) as db:
        assert db.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0] == 2
    if not a.execute:
        print('Preflight passed; production unchanged')
        return
    os.umask(0o077)
    lock = base / 'local-data/refinement2-deploy.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    saved = base / 'local-data/releases' / ('refinement2-before-' + stamp)
    saved.mkdir()
    target = base / 'local-data' / ('build-desk-refinement2-' + stamp + '.db')
    env = dict(os.environ, PATH='/home/preston/.local/node/bin:' + os.environ['PATH'])
    moved = []
    stopped = switched = False
    revisions = []
    files = ['web/server.mjs', 'web/next.config.mjs', 'web/package.json', 'web/package-lock.json', 'README.md']
    directories = ['web/src', 'web/scripts', 'web/fonts', 'web/.next', 'web/node_modules', 'tools', 'docs']

    def service(action):
        subprocess.run(['systemctl', '--user', action, 'build-desk'], check=True)

    def run_node(label, command):
        with (saved / (label + '.log')).open('w') as log:
            subprocess.run(['node', '--import', 'tsx', *command], cwd=stage / 'web', env=env,
                           stdout=log, stderr=subprocess.STDOUT, check=True)

    try:
        service('stop')
        stopped = True
        with sqlite3.connect('file:' + str(source) + '?mode=ro', uri=True) as db:
            revisions = db.execute('SELECT build_id,revision FROM build_revisions ORDER BY build_id').fetchall()
            with sqlite3.connect(saved / 'database-before.db') as copy:
                db.backup(copy)
        shutil.copy2(registry, saved / 'registry-before.json')
        subprocess.run(['tar', '-czf', str(saved / 'runtime-before.tar.gz'),
                        'local-data/kitten-745', 'local-data/printers', 'local-data/builds.pi.json',
                        'local-data/release.json', 'config', 'assets/generated'], cwd=base, check=True)
        code_paths = [n for n in files + directories if (base / n).exists() and n != 'web/node_modules']
        subprocess.run(['tar', '--exclude=web/.next/cache', '-cf', str(saved / 'code-before.tar'), *code_paths], cwd=base, check=True)
        run_node('migration', ['scripts/migrate-acquisition.ts', '--source', str(saved / 'database-before.db'), '--output', str(target)])
        run_node('validation', ['scripts/validate-acquisition.ts', '--database', str(target), '--baseline', str(saved / 'database-before.db')])
        # Replace complete runtime trees so retired queue routes/tools cannot linger.
        for name in directories:
            old, new = base / name, stage / name
            previous = saved / (name.replace('/', '-') + '-before')
            if old.exists():
                old.rename(previous)
            moved.append((old, previous))
            if name == 'web/node_modules':
                new.rename(old)
            else:
                shutil.copytree(new, old, ignore=shutil.ignore_patterns('cache') if name == 'web/.next' else None)
        for name in files:
            if (base / name).exists():
                backup_file = saved / (name.replace('/', '-') + '-before')
                shutil.copy2(base / name, backup_file)
            shutil.copy2(stage / name, base / name)
        # All legacy queue material is preserved, but no longer lives in the active runtime.
        legacy = base / 'local-data/kitten-745/order-updates'
        if legacy.exists():
            legacy.rename(saved / 'legacy-order-updates')
        for b in config['builds']:
            b['store']['path'] = str(target.relative_to(base))
        pending = registry.with_suffix('.pending')
        pending.write_text(json.dumps(config, indent=2))
        os.replace(pending, registry)
        switched = True
        service('start')
        for attempt in range(35):
            try:
                for b in config['builds']:
                    with urllib.request.urlopen('http://127.0.0.1:4174/api/builds/' + b['id'], timeout=20) as r:
                        view = json.load(r)
                    assert 'acquisition' in view['snapshot'] and 'purchasing' not in view['snapshot']
                break
            except Exception:
                if attempt == 34:
                    raise
                time.sleep(1)
        record = dict(commit=a.commit, branch='Refinement_v2', database=str(target),
                      previousDatabase=str(source), rollbackDirectory=str(saved), baselineRevisions=revisions,
                      validated=True, deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        (base / 'local-data/release.json').write_text(json.dumps(record, indent=2))
        (saved / 'cutover.json').write_text(json.dumps(record, indent=2))
        print(json.dumps(record, indent=2))
    except Exception:
        if stopped:
            service('stop')
            safe = not switched
            if switched:
                try:
                    with sqlite3.connect('file:' + str(target) + '?mode=ro', uri=True) as db:
                        safe = db.execute('SELECT build_id,revision FROM build_revisions ORDER BY build_id').fetchall() == revisions
                except Exception:
                    safe = False
            if safe:
                for old, previous in reversed(moved):
                    if old.exists():
                        old.rename(saved / ('failed-' + str(old.relative_to(base)).replace('/', '-')))
                    if previous.exists():
                        previous.rename(old)
                for name in files:
                    previous = saved / (name.replace('/', '-') + '-before')
                    if previous.exists():
                        shutil.copy2(previous, base / name)
                legacy = saved / 'legacy-order-updates'
                if legacy.exists():
                    legacy.rename(base / 'local-data/kitten-745/order-updates')
                if (saved / 'registry-before.json').exists():
                    shutil.copy2(saved / 'registry-before.json', registry)
                service('start')
                print('Previous SQLite runtime restored; all candidate data retained')
            else:
                print('Service stopped: preserve the latest SQLite DB and reconcile newer writes before rollback')
        raise
    finally:
        lock.unlink()


if __name__ == '__main__':
    main()

"""Stage and release Purchasing refinements on the verified user-owned Pi.

Upgrades a fresh SQLite backup, checks all prior columns and tables unchanged,
retains the old database/code, and only rolls back before new revisions exist.
"""
import argparse
import datetime
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import time
import urllib.request

BASE = pathlib.Path('/home/preston/build-desk')
ENV = dict(os.environ, PATH='/home/preston/.local/node/bin:' + os.environ['PATH'])


def service(action):
    subprocess.run(['systemctl', '--user', action, 'build-desk'], check=True)


def view(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def wait(url):
    for attempt in range(45):
        try:
            return view(url)
        except Exception:
            if attempt == 44:
                raise
            time.sleep(1)


def migrate(stage, source, target):
    with sqlite3.connect('file:' + str(source) + '?mode=ro', uri=True) as old, sqlite3.connect(target) as new:
        old.backup(new)
    subprocess.run(['node', '--input-type=module', '-e',
                    "import {DatabaseSync} from 'node:sqlite'; import {initializeSchema} from './src/server/sqlite-schema.mjs'; const db=new DatabaseSync(process.argv[1]); initializeSchema(db); db.close();", str(target)],
                   cwd=stage / 'web', env=ENV, check=True)
    with sqlite3.connect('file:' + str(source) + '?mode=ro', uri=True) as old, sqlite3.connect(target) as new:
        for (table,) in old.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
            columns = [r[1] for r in old.execute('PRAGMA table_info("' + table + '")')]
            projection = ','.join('"' + c + '"' for c in columns)
            query = 'SELECT ' + projection + ' FROM "' + table + '" ORDER BY rowid'
            previous = old.execute(query).fetchall()
            actual = new.execute(query).fetchall()
            if table == 'schema_migrations':
                assert all(row in actual for row in previous)
            else:
                assert actual == previous, table + ' changed'
        assert new.execute("SELECT COUNT(*) FROM purchase_parts WHERE alternate_url != ''").fetchone()[0] == 0
        assert new.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not new.execute('PRAGMA foreign_key_check').fetchall()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--deploy', action='store_true')
    args = parser.parse_args()
    stage = pathlib.Path(args.stage).resolve()
    assert stage.is_relative_to(BASE / 'local-data') and stage != BASE / 'local-data'
    registry = BASE / 'local-data/builds.pi.json'
    original = registry.read_bytes()
    config = json.loads(original)
    sources = {(BASE / b['store']['path']).resolve() for b in config['builds']}
    assert len(sources) == 1 and all(b['store']['kind'] == 'sqlite' for b in config['builds'])
    source = sources.pop()
    assert source.is_relative_to(BASE / 'local-data')
    assert json.loads((BASE / 'local-data/release.json').read_text())['commit'] == '529010223b8056305abcf194cabd4c68a4281621', 'Unexpected production release'
    for name in ['package-lock.json', 'web/package-lock.json']:
        assert (BASE / name).read_bytes() == (stage / name).read_bytes(), 'Dependencies changed'

    def run(label, command, cwd=stage):
        with (stage / (label + '.log')).open('w') as log:
            subprocess.run(command, cwd=cwd, env=ENV, stdout=log, stderr=subprocess.STDOUT, check=True)

    if not args.deploy:
        for name in ['node_modules', 'web/node_modules']:
            if not (stage / name).exists():
                (stage / name).symlink_to(BASE / name, target_is_directory=True)
        run('tests', ['npm', 'test'])
        run('typecheck', ['npm', '--prefix', 'web', 'run', 'typecheck'])
        # Pi 3 memory is limited; keep the old release available after the build.
        service('stop')
        try:
            run('build', ['npm', 'run', 'app:build'])
        finally:
            service('start')
        wait('http://127.0.0.1:4174/api/health')
        target = stage / 'acceptance.db'
        assert not target.exists()
        migrate(stage, source, target)
        isolated = json.loads(original)
        for b in isolated['builds']:
            b['store']['path'] = str(target)
            b['assets'] = {k: str((BASE / v).resolve()) for k, v in b['assets'].items()}
            b.pop('printer', None)
        (stage / 'registry.json').write_text(json.dumps(isolated))
        reports = stage / 'reports'
        reports.mkdir(exist_ok=True)
        with (stage / 'http-server.log').open('w') as log:
            process = subprocess.Popen(['node', 'web/server.mjs'], cwd=stage,
                env=dict(ENV, PORT='4177', BUILDDESK_HOST='127.0.0.1', BUILDDESK_REGISTRY=str(stage / 'registry.json')),
                stdout=log, stderr=subprocess.STDOUT)
            try:
                wait('http://127.0.0.1:4177/api/health')
                run('http', ['python3', 'tools/verify-acquisition-http.py', '--reports', str(reports)])
            finally:
                process.terminate()
                process.wait(timeout=30)
        (stage / 'accepted.json').write_text(json.dumps(dict(commit=args.commit, tests=True, build=True, migration=True, http=True)))
        print('Staged tests, typecheck, ARM64 build, migration preservation, disposable HTTP save/reload/reports passed', flush=True)
        return

    gates = json.loads((stage / 'accepted.json').read_text())
    assert gates == dict(commit=args.commit, tests=True, build=True, migration=True, http=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    saved = BASE / 'local-data/releases' / ('purchasing-ui-before-' + stamp)
    saved.mkdir(mode=0o700)
    target = BASE / 'local-data' / ('build-desk-purchasing-ui-' + stamp + '.db')
    names = ['web/src', 'web/scripts', 'web/.next', 'tools', 'docs', 'README.md']
    moved = []
    switched = False
    service('stop')
    try:
        with sqlite3.connect(source) as db, sqlite3.connect(saved / 'database-before.db') as backup:
            db.backup(backup)
            revisions = db.execute('SELECT build_id,revision FROM build_revisions ORDER BY build_id').fetchall()
        (saved / 'registry-before.json').write_bytes(original)
        shutil.copy2(BASE / 'local-data/release.json', saved / 'release-before.json')
        migrate(stage, source, target)
        for name in names:
            old = BASE / name
            previous = saved / name.replace('/', '-')
            old.rename(previous)
            moved.append((old, previous))
            if (stage / name).is_dir():
                shutil.copytree(stage / name, old, ignore=shutil.ignore_patterns('cache') if name == 'web/.next' else None)
            else:
                shutil.copy2(stage / name, old)
        for b in config['builds']:
            b['store']['path'] = str(target)
        registry.write_text(json.dumps(config, indent=2))
        switched = True
        service('start')
        for b in config['builds']:
            current = wait('http://127.0.0.1:4174/api/builds/' + b['id'])
            assert all(p['alternateUrl'] == '' for p in current['snapshot']['acquisition']['parts'])
        record = json.loads((BASE / 'local-data/release.json').read_text())
        record.update(commit=args.commit, applicationCommit=args.commit, phase='Purchasing UI refinements', schema=5,
                      database=str(target), previousDatabase=str(source), rollbackDirectory=str(saved),
                      deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), existingDataUnchanged=True)
        (BASE / 'local-data/release.json').write_text(json.dumps(record, indent=2))
        (saved / 'cutover.json').write_text(json.dumps(record, indent=2))
        print(json.dumps(record, indent=2))
    except Exception:
        service('stop')
        if switched:
            with sqlite3.connect(target) as db:
                assert db.execute('SELECT build_id,revision FROM build_revisions ORDER BY build_id').fetchall() == revisions, 'New writes exist; retain upgraded database and investigate before rollback'
        registry.write_bytes(original)
        for old, previous in reversed(moved):
            if old.exists():
                old.rename(saved / ('failed-' + previous.name))
            previous.rename(old)
        shutil.copy2(saved / 'release-before.json', BASE / 'local-data/release.json')
        service('start')
        raise


if __name__ == '__main__':
    main()

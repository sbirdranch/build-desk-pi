"""Add an offline prepared build to a NEW consistent SQLite copy, never in place."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import sqlite3


def build_fingerprints(db, excluded=None):
    result = {}
    for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        columns = [r[1] for r in db.execute('PRAGMA table_info("' + table + '")')]
        key = 'id' if table == 'builds' else 'build_id' if 'build_id' in columns else None
        sql = 'SELECT * FROM "' + table + '"'
        args = []
        if excluded and key:
            sql += ' WHERE "' + key + '" != ?'; args = [excluded]
        result[table] = hashlib.sha256(json.dumps(db.execute(sql + ' ORDER BY rowid', args).fetchall(), ensure_ascii=False).encode()).hexdigest()
    return result


def register(source, output, manifest_path):
    source, output = Path(source).resolve(), Path(output).resolve()
    assert source != output and source.is_file() and not output.exists(), 'A new output file is required'
    raw = Path(manifest_path).read_bytes(); m = json.loads(raw)
    id = m['id']; assert re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', id)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with sqlite3.connect('file:' + source.as_posix() + '?mode=ro', uri=True) as original:
        assert original.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert original.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0] == 3
        assert not original.execute('SELECT id FROM builds WHERE id=?', (id,)).fetchone(), 'Build already registered'
        before = build_fingerprints(original)
        # Exclusive reservation prevents accidental replacement of a prior output.
        with output.open('xb'): pass
        with sqlite3.connect(output) as db:
            original.backup(db)
    with sqlite3.connect(output) as db:
        db.execute('PRAGMA foreign_keys=ON'); db.execute('BEGIN IMMEDIATE')
        db.execute('INSERT INTO builds VALUES(?,?,?,?,?)', (id, m['name'], 1, m['printerId'], now))
        db.execute('INSERT INTO build_revisions VALUES(?,?,?)', (id, 0, now))
        for p in m['parts']:
            assert p['required'] is None, 'Fresh STL imports must not infer assembly quantities'
            db.execute('INSERT INTO print_parts VALUES(?,?,?,?,?,?,?,?,?,?)', (id,p['id'],p['name'],p['section'],p['source'],p['material'],None,0,0,p['notes']))
        for f in m['files']:
            assert re.fullmatch(r'[0-9a-f]{64}', f['sourceHash'])
            assert Path(f['filename']).name == f['filename'] and f['filename'].endswith('.3mf')
            db.execute('INSERT INTO model_files VALUES(?,?,?,?,?,?,?,?,?)', (id,f['id'],f['filename'],f['revision'],f['profile'],f['material'],f['section'],f['sourceHash'],now))
        for p in m['plates']:
            db.execute('INSERT INTO plates VALUES(?,?,?,?,?,?,?)', (id,p['id'],p['fileId'],p['number'],p['name'],p['section'],'[]'))
            for x in p['assignments']:
                assert type(x['copies']) is int and x['copies'] > 0
                db.execute('INSERT INTO plate_assignments VALUES(?,?,?,?,?,?,?)', (id,x['id'],p['id'],x['partId'],x['copies'],0,'Saved STL instances; preparation quantities require review.'))
        for p in m['purchases']:
            assert p['required'] is None or type(p['required']) is int and p['required'] >= 0
            db.execute('INSERT INTO purchase_parts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', (id,p['id'],p['category'],p['description'],p['specification'],p['requirement'],p['required'],0,0,None,'',None,''))
        db.execute('INSERT INTO runtime_compatibility VALUES(?,?,?,?)', (id,'{}','[]','{}'))
        snapshot = dict(build=dict(id=id,name=m['name']),revision='0',recordedAt=now,
            parts=[dict(p,opening=0,accepted=0,installed=0) for p in m['parts']],
            files=[dict(f,importedAt=now) for f in m['files']],
            plates=[dict(p,unmappedObjects=[],assignments=[dict(x,confirmed=False,note='Saved STL instances; preparation quantities require review.') for x in p['assignments']]) for p in m['plates']],
            jobs=[],audit=[],acquisition=dict(parts=[dict(p,onHand=0,ordered=False,vendor='',url='',orderedDate='',notes='') for p in m['purchases']],vendors=[r[0] for r in db.execute('SELECT display_name FROM vendors ORDER BY normalized_name')]),
            importProvenance=m)
        db.execute('INSERT INTO migration_sources VALUES(?,?,?,?)', (id,hashlib.sha256(raw).hexdigest(),json.dumps(snapshot),now))
        empty = json.dumps(dict(parts=[],items=[],ledger=[]))
        db.execute('INSERT INTO purchasing_archives VALUES(?,?,?,?,?)', (id,now,hashlib.sha256(empty.encode()).hexdigest(),empty,json.dumps(dict(buildId=id,freshImport=True,parts=len(m['purchases']),archivedItems=0,archivedLedger=0))))
        assert before == build_fingerprints(db, excluded=id), 'Existing build or global data changed'
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        assert not db.execute('SELECT * FROM print_jobs WHERE build_id=?', (id,)).fetchall()
        assert not db.execute('SELECT * FROM plate_preparations WHERE build_id=?', (id,)).fetchall()
        db.commit()
    return dict(buildId=id,parts=len(m['parts']),files=len(m['files']),plates=len(m['plates']),purchases=len(m['purchases']),existingDataUnchanged=True,output=str(output))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['source','output','manifest']: p.add_argument('--'+name, type=Path, required=True)
    a = p.parse_args(); print(json.dumps(register(a.source,a.output,a.manifest),indent=2))

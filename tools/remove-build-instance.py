"""Remove one build from a NEW SQLite copy; preserve all other rows and the source.

Stop the owning application before switching its registry to the output. Keep
the source database and original registry together as a reversible backup.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3


DELETE_ORDER = [
    'inspection_drafts', 'print_job_items', 'print_jobs', 'preparation_items',
    'plate_preparations', 'plate_assignments', 'plates', 'model_files',
    'fabrication_parts', 'print_parts', 'purchase_parts', 'write_requests',
    'runtime_compatibility', 'purchasing_archives', 'migration_sources',
    'build_revisions', 'builds',
]


def retained_fingerprints(db, build_id):
    result = {}
    tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
    for (table,) in tables:
        columns = [r[1] for r in db.execute('PRAGMA table_info("' + table + '")')]
        key = 'id' if table == 'builds' else 'build_id' if 'build_id' in columns else None
        if key and table not in DELETE_ORDER:
            raise ValueError('Unsupported build-scoped table: ' + table)
        sql = 'SELECT * FROM "' + table + '"'
        args = []
        if key:
            sql += ' WHERE "' + key + '" != ?'
            args = [build_id]
        rows = db.execute(sql + ' ORDER BY rowid', args).fetchall()
        result[table] = hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()
    return result


def remove(source, output, build_id):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_file() or source == output or output.exists():
        raise ValueError('An existing source and a new, distinct output are required')
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as original:
        assert original.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
        assert not original.execute('PRAGMA foreign_key_check').fetchall()
        assert original.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0] == 4
        assert original.execute('SELECT id FROM builds WHERE id=?', (build_id,)).fetchone(), 'Build not found'
        assert original.execute('SELECT count(*) FROM builds').fetchone()[0] > 1, 'Cannot remove the last build'
        assert not original.execute("SELECT id FROM print_jobs WHERE build_id=? AND status IN ('Printing','Awaiting inspection')", (build_id,)).fetchall(), 'Build has unfinished jobs'
        before = retained_fingerprints(original, build_id)
        with output.open('xb'):
            pass
        with sqlite3.connect(output) as db:
            original.backup(db)
    removed = {}
    with sqlite3.connect(output) as db:
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        for table in DELETE_ORDER:
            key = 'id' if table == 'builds' else 'build_id'
            removed[table] = db.execute('DELETE FROM "' + table + '" WHERE "' + key + '"=?', (build_id,)).rowcount
        assert before == retained_fingerprints(db, build_id), 'Retained or global data changed'
        assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        for table in DELETE_ORDER:
            key = 'id' if table == 'builds' else 'build_id'
            assert not db.execute('SELECT 1 FROM "' + table + '" WHERE "' + key + '"=?', (build_id,)).fetchone()
        db.commit()
    return dict(buildId=build_id, output=str(output), removed=removed,
                retainedDataUnchanged=True, retainedFingerprints=before)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--build-id', required=True)
    a = p.parse_args()
    print(json.dumps(remove(a.source, a.output, a.build_id), indent=2))

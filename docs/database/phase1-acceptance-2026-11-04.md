# Phase 1 acceptance — November 4, 2026

Status: SQLite production cutover completed and verified at 11:39 AM EST.
Branch: `Refinement_v2`. Application source: `fa630ca` (following SQLite integration `d9df184` and preservation of deployed Purchasing fixes).

## Executed validation

- Established pinned-host SSH using the existing ignored deployment key and `docs/raspberry-pi.md`; confirmed ARM64 Node 24.22.0 and the systemd user installation.
- Compared live source against the repository baseline. Carried the deployed email-item matching and Drive consent fixes into this branch; preserved the live object-match configuration.
- Windows: 75/75 tests, including the real workbook clone test; TypeScript and optimized build passed.
- Pi: 75/75 tests, including the real workbook clone test; TypeScript and an on-device optimized ARM64 build passed. Production was stopped during that build and restarted afterward on its original workbook.
- Migrated a copied production workbook to a new disposable database. Compared every business field through the SQLite reader, including original preparation flags, historical job snapshots, drafts, notes, audit and full current Purchasing state. All 570 explicitly checked normalized records and 101 accepted totals matched; integrity and foreign-key checks passed.
- Tested concurrent starts for a shared printer, durable replay, stale revisions, failed-transaction rollback, inspection completion, independent build inventory, WAL-aware backup/restore and subsequent writes to a restored copy.
- Isolated Pi HTTP server on loopback port 4177: page/health/build reads, Printing and Purchasing saves, request replay, HTTP 409 for stale revisions, HTTP 403 for a foreign origin, and automatic backup creation passed. All writes used a disposable database; the server was stopped afterward.

## Controlled cutover and live result

After all gates passed, `tools/pi-sqlite-cutover.py` stopped production, backed up code and runtime data, copied the final workbook, migrated it into a new database, reran full semantic and restore validation, installed the staged source/ARM64 build, atomically changed the registry and restarted the existing user service. No parallel Excel writer was used.

| Item | Verified result |
|---|---|
| Database | `/home/preston/build-desk/local-data/build-desk-20261104T163820Z.db` |
| Runtime schema | `build-desk-v2`, SQLite schema version 2 |
| Printed parts / files / plates / assignments | 101 / 7 / 26 / 102 |
| Jobs / historical job items | 29 / 102 |
| Accepted units / installed units | 116 / 0 |
| Purchasing parts / items | 51 / 15 |
| Audit entries | 176 |
| Initial production revision | 0; no test writes to production |
| Database size at cutover | 798,720 bytes |
| Model sources / printer | All 7 readable / telemetry live |
| LAN page, data, representative GLB | HTTP 200; LAN editing enabled |
| Original workbook | Unchanged; retained read-only |

Final workbook SHA-256: `de7da19aa410b0fe9a3da5497cccef5e94b24eafb1959275d55b904134002d81`.

After startup, the live database again passed full source-snapshot comparison and a restore/write/replay exercise confined to a disposable restored copy. The UI data endpoint matched source Purchasing and audit data. Source models and generated assets were not modified.

## Backups and rollback

Pi rollback directory: `/home/preston/build-desk/local-data/releases/sqlite-before-20261104T163820Z`.

- `data-before.tar.gz`: stopped production workbook, workbook history, purchasing cache/config, printer data, registry, release metadata, generated assets and repaired object mappings.
- `code-before.tar`: previous runtime source and production build, excluding build cache and dependencies. Dependency lockfiles were confirmed identical before deployment.
- `final-tracker.xlsx`, `registry-before.json`, `registry-after.json`, migration/validation logs, source hash and cutover record.
- `cutover-database.db`: consistent SQLite online backup after acceptance; not a raw copy of a live database with potentially separate journal/WAL state.
- `backup-manifest.json`: hashes of all ten retained backup files. Both archives were fully read back successfully (194 code/build files and 758 runtime/asset files). All ten backup files were copied to the Windows worktree's ignored `local-data/phase1/rollback-copy/sqlite-before-20261104T163820Z` and matched SHA-256. No credentials or production-derived data are in Git.

Runtime saves first generate and verify a SQLite online backup under `local-data/backups`. Backup failure blocks the save. Initial policy retains all versions; pruning is deliberately deferred until storage use has been observed.

For rollback, stop the service first and preserve a **new consistent backup of the current SQLite database**. If its build revision is still zero, restore `code-before.tar` and `registry-before.json`, verify the unchanged workbook and restart the old service. The cutover tool performs this automatically on a failed cutover only while the DB is known to contain no subsequent writes. If any revision has advanced, keep the latest database and reconcile its changes before returning to Excel; never replace newer history with the cutover workbook.

## Scope retained for later work packages

Phase 1 preserves the current Purchasing workflow in a build-scoped compatibility payload; its existing inventory, order aliases and ledger remain writable in SQLite. The normalized simplified Purchasing projection is reserved for WP-02 and is not the active Phase 1 source. Four migration warnings about inferring future Ordered checkboxes were reviewed; no such inference changes current order state. WP-02 will remove the legacy order workflow separately.

The existing preparation confirmation value is preserved, including false; removing that UI field remains WP-03. Multiple-build runtime isolation and shared-printer exclusion passed synthetic tests. Real second/third designer packages have not been supplied and their import qualification remains separate from this existing-build cutover. Reboot and extended-load qualification are not claimed.

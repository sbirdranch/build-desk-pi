# Test-truck retirement and loader defaults

Completed November 4, 2026 (01:39 UTC November 5). The user explicitly requested removal of the disposable 745 Truck 2 after testing, then requested a required quantity of one for loader components whose requirement was still unset.

## Production changes

- Removed `kitten-745-instance2` from the private Builds registry and every scoped table in the current database. This removes 101 parts, seven tracked files, 24 plates, 101 assignments, 50 Purchasing rows and associated revision/import/archive records. It had no jobs or production history. Test NAS projects and cached assets remain available for recovery.
- Current builds are `kitten-745` and `kitten-980-loader`. All existing/global rows excluding the retired build were fingerprint-identical during retirement, including the user's latest loader changes at revision 4. Both remaining API snapshots/assets/source-file mappings were unchanged. The removed build's API reports Build not found; the UI selector contains only the two retained builds.
- Subsequently, the normal SQLiteStore `update-parts` command set exactly 82 loader component requirements from null to one. All 32 requirements already entered were preserved, including fabricated metal design quantities. No Purchasing quantities, accepted/installed counts, fabrication progress, notes, models, preparations or jobs changed. The original truck snapshot was identical. The save generated the standard verified backup, audit record and loader revision 5.

These user-requested defaults are convenience values, not verified designer BOM quantities. Review quantities when preparing a physical print or assembly.

Current database: `/home/preston/build-desk/local-data/build-desk-active-20261105T013902Z.db`, schema 4. Both retained builds use this through `local-data/builds.pi.json`. Application code is unchanged; no application rebuild was needed.

## Validation and preservation

`tools/remove-build-instance.py` removes only from a new consistent SQLite copy. It keeps foreign keys enabled, deletes in dependency order, verifies absence of all targeted rows, compares every retained/global table fingerprint and checks integrity/foreign keys. It rejects in-place changes, overwriting an output, absent builds, the last build and unfinished jobs. The real cloned database passed removal; missing-build/in-place/overwrite rejection and unchanged source hashes were checked.

A temporary loopback server with the reduced cloned database/registry passed both retained build views and removal rejection before production changed. The production service was then stopped, its latest database backed up, a fresh reduced copy prepared, and the registry atomically switched. The old database remains intact. Live APIs, matching retained snapshots, database checks and browser selector verification passed. The subsequent quantity command passed on a disposable clone before applying to production; per-part comparison proved that only previously null requirements changed. Final live loader data has all 114 component requirements set.

Rollback set: `/home/preston/build-desk/local-data/releases/retire-truck2-before-20261105T013902Z`. It contains `database-before.db` (three builds, loader revision 4), `registry-before.json`, prior release metadata, removal fingerprints and a post-retirement database. The original three-build database also remains in place. Matching off-Pi copies are in the Windows checkout's ignored `local-data/retire-truck2/retire-truck2-before-20261105T013902Z`.

The final two-build, loader-revision-5 snapshot is retained on the Pi at `local-data/retire-truck2-final-20261105T0139` and in the corresponding Windows ignored directory, with current registry, before/after quantity snapshots and a result manifest. Transferred SHA-256 values, restored database integrity/foreign keys, build membership and retained row comparisons passed. Standard runtime backups also retain the state immediately before the quantity save.

To restore Truck 2, preserve current data and stop the service first. The pre-retirement database/registry pair can restore the complete prior three-build state, but it predates the loader's quantity defaults and any later edits. Prefer merging only the retired build's scoped records and its registry entry into a new copy of current schema-4 data, preserving all subsequent edits. Never replace current data with an older snapshot without reconciling those changes. To undo only the quantity defaults, use the recorded 82 changed IDs and before values; preserve all other and subsequent changes.

Historical [three-build acceptance](loader-acceptance-2026-11-04.md) remains valid evidence of the completed test. Removal does not undo that validation.

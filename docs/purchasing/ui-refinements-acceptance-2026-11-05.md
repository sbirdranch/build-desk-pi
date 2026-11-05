# Purchasing UI refinements — November 5, 2026

Deployed and verified at 8:27 AM EST on the existing Raspberry Pi, `preston@192.168.0.119`, application `/home/preston/build-desk`, user service `build-desk`. Application commit `b3a76173cee471654bdf124dbeda61e87518fb6d`, branch `Refinement_v2`, pushed to `sbirdranch/build-desk-pi`. Feature commit: `d20b801`.

## Behavior

Left-hand rows show description, on-hand/required quantities and a 13px status decorator, without ID, category or visible availability text. Desktop rows have a 38px minimum height; narrow screens retain 44px targets. Status uses the Printing tree's green and circle size: Ordered has a green ring with a dark center, Available has solid green, and unavailable uses a dashed gray ring. Tooltips and accessible names explain status; selected rows and keyboard focus remain distinct. Available takes precedence over the independent Ordered marker.

Parts Status contains mutually exclusive Not Yet Available / Ordered / Available groups. Vendor appears between description and Required. Alternate URL is a separate editable, validated HTTP(S) field, persisted per build/part and included as a clickable column in Parts Source List. Save/discard/navigation guards include the field. Missing Alternate URL in an old client command is rejected to prevent silently erasing a newer saved value; reload existing browser sessions after deployment.

Schema 5 adds `purchase_parts.alternate_url` with an empty-string default. Migration is explicit and idempotent. Designer reimports continue to preserve purchasing fields.

## Validation

- Local and Pi suites: 58 passed, zero failed, one workbook-dependent test skipped in the default suite.
- Separate local real-workbook clone-only regression: passed; original unchanged.
- Local and Pi TypeScript checks and optimized production builds passed; Pi build used matching existing ARM64 dependencies. Lockfiles matched production.
- Migration tested from schema 4 and against a production database backup. Every existing table and column value was preserved; only the new column and schema migration record were added. Integrity and foreign-key checks passed. Repeated migration did not alter user fields.
- Disposable HTTP save/reload verified Alternate URL persistence, stock/Ordered independence, protected designer/Printing data, replay, revision conflicts, origin checks, invalid links/dates/quantities and both PDF reports.
- Isolated browser save/reload verified the Alternate URL editor and Ordered ring. Desktop and narrow layouts were reviewed; the narrow document had no horizontal overflow. Browser viewport overrides were reset.
- Sample PDFs were rendered and inspected. Text checks confirmed all three groups, vendor column order, each part exactly once, and a clickable alternate-link annotation. Maximum-length report pagination tests passed.
- Live LAN page, health, both build APIs and all four report downloads returned HTTP 200 after deployment. Live UI showed compact rows and the blank Alternate URL editor. No test edits were made to production.
- Final live database comparison against the stopped pre-cutover backup confirmed all preexisting values unchanged. Kitten 745: revision 1, 51 Purchasing entries, 101 printed parts, 29 jobs. Loader: revision 5, 59 Purchasing entries, 114 component types, zero jobs. Printer monitoring remained connected.

## Release and rollback

Current database: `/home/preston/build-desk/local-data/build-desk-purchasing-ui-20261105T132749Z.db`.
Previous database retained: `/home/preston/build-desk/local-data/build-desk-active-20261105T013902Z.db`.
Rollback directory: `/home/preston/build-desk/local-data/releases/purchasing-ui-before-20261105T132749Z`.

The directory retains the consistent pre-cutover database backup, registry, release record and previous source/scripts/build/tools/docs/README. The release procedure is `tools/pi-purchasing-ui-release.py`; it gates cutover on tests, typecheck, ARM64 build, migration preservation and isolated HTTP acceptance. It takes a fresh stopped backup at cutover, avoiding a stale acceptance copy. Automatic rollback refuses to replace newer revisions.

For manual rollback, stop the user service and back up the current database first. The old application requires schema 4, so code-only rollback cannot use the schema-5 database directly. Restore the saved code/build and registry only if no subsequent user writes exist. If new writes exist, retain the current database and reconcile them before any database rollback. Never overwrite newer history with the saved database.

Tests/build/HTTP logs, report checks and cutover metadata are copied to ignored Windows `local-data/purchasing-ui`. The temporary isolated server and SSH forwarding session were stopped. Synced `sources/` and unrelated older checkouts were not modified.

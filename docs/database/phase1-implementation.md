# Phase 1 — SQLite Foundation Implementation Record
Date: 2026-11-03
Branch: Refinement_v2
State: First implementation slice committed, **not yet accepted or deployed**.

## Files delivered
- `web/src/server/sqlite-schema.mjs`: schema v1, normalized tables, relational constraints and indexes. Uses SQLite foreign keys and integer quantity checks.
- `web/src/server/sqlite-schema.d.mts`: TypeScript declaration.
- `web/scripts/migrate-sqlite.mjs`: **one-shot, write-new-file-only** Excel to SQLite migration from an exported/backup workbook.
- `web/tests/sqlite-schema.test.ts`: schema/bootstrap, independent builds, shared vendor name, inventory isolation and job/inspection constraints.
- `web/tests/sqlite-migration.test.ts`: synthetic workbook migration and accepted-count comparison, original input unchanged, existing destination refused, read-back through SQLite snapshot loader.
- `web/src/server/sqlite-read.ts`: read-only SQLite-to-Snapshot adapter for migration comparisons; not yet the transactional runtime store.
- `.github/workflows/refinement-v2-ci.yml`: Node 24 GitHub Actions validation for application tests, typecheck and production build.

## Operation and safety
This is NOT an application cutover. Current runtime still routes through `excel-store.ts` and the production Pi workbook is authoritative. No live Pi registry, workbook or service was changed.

When the developer has a copy of the real workbook on an appropriate test host and installed web dependencies:
```sh
cd web
npm ci --ignore-scripts
npm test
npm run typecheck
npx tsx scripts/migrate-sqlite.mjs \
  --workbook ../local-data/migration-fixture/Master-Tracker-COPY.xlsx \
  --output ../local-data/migration-fixture/kitten-745-test.db \
  --build-id kitten-745 --name "Kitten 745"
```
The named example input MUST be a backup/copy and the output path MUST NOT exist. The importer rejects existing output and never modifies the workbook. It produces a `.migration-report.json` and `.legacy-purchasing.json` beside the test DB. Treat all three as sensitive, local production-derived data; store under ignored `local-data` and do not commit them.

The importer currently migrates one build into a newly created SQLite file. The shared database will support multiple build IDs, but combining subsequent real builds, runtime adapter, final cutover tooling and rollback integration are additional implementation tasks.

## Verification implemented (but execution remains necessary)
- SQL foreign-key integrity and whole-number checks.
- Unique stable IDs scoped by build.
- Historical job snapshots and inspection drafts retained.
- Source hash and named row counts reported.
- Completed-job accepted totals recalculated from opening + valid completed lines and compared per printed part.
- Per-record field comparison for printed parts, model files, plates, assignments, saved preparations, preparation items, jobs, job lines, inspection drafts and selected purchasing fields.
- Legacy Purchasing orders/ledgers archived as separate JSON, not imported into the new active acquisition schema.
- Ordered checkbox intentionally starts false for ambiguous legacy orders; date, vendor, on-hand, link, and designer fields preserved where possible; exceptions/warnings reported.

## Known limitations / acceptance blockers
1. **GitHub Actions has executed the test suite, TypeScript check and production build successfully** on Node 24 (run 41680928760). Subsequent read-adapter commit has its own validation run; this does not substitute for Pi/actual-workbook testing. GitHub API access cannot directly run the Pi's Node runtime or read its ignored workbook.
2. **Actual production workbook clone not yet verified.** Migration is not proven until row-level comparison passes against that specific file. Unknown/malformed legacy records may reveal additional compatibility work.
3. **SQLite runtime adapter is not yet wired.** Current `createStore`, registry type restrictions and API routes are Excel-only; do not change registry to `kind=sqlite` yet.
4. **Purchasing schema is forward-looking** for WP-02. Existing separate historic order detail is retained in archive; current order flags cannot safely be inferred.
5. Driver `node:sqlite` must be smoke-tested on the Pi's installed Node 24 version and memory budget.
6. Shared-printer start exclusion must be made transaction-safe with the eventual adapter.
7. Existing workbook snapshot `layoutConfirmed` is intentionally not migrated as an attestation. WP-03 must adapt validation before SQLite is used to start jobs.
8. Backup/restore implementation, multi-build app read/write adapter, and controlled live cutover remain incomplete.

## Next engineering work
- Run tests/typecheck with actual repo dependencies; repair failures.
- Obtain read-only copy of current production workbook and run migration, review all warnings/differences.
- Implement full transactional SQLite `DataStore` load/commit and persistent request-id replay while preserving domain semantics; do not switch production before acceptance.
- Validate SQLite consistent backup/restore and cross-build printer exclusion.
- Test second fresh Kitten model and third loader when their designer packages become available.

## Acceptance gate
Do not declare Phase 1 complete or replace Excel until migration tests on real workbook, data comparisons, Pi smoke test, SQLite adapter regression tests, and restore exercise all pass. Maintain the approved branch and separate, backed-up production.

# WP-01 — SQLite Data Architecture and Migration Plan
Version: 0.1, technical design candidate
Date: 2026-11-03
Branch: Refinement_v2
Status: DBA analysis / proposed schema. **Not implemented or verified against live Pi database.** No code, runtime, or live data changes under this work package yet.

## 1. Decision and constraints
- Replace Excel as Build Desk's authoritative writable datastore with **SQLite on the Pi's local filesystem**.
- Favor **one small database file** for all builds, with explicit build-scoped primary/foreign keys. The three planned vehicles are (a) current Kitten 745, (b) new instance of exactly the same designer model with fresh source data, (c) a distinct loader model.
- The app remains a single-user LAN service on Raspberry Pi 3 B+. No external DB server, distributed system, global inventory or accounts.
- Do **not** share physical inventory between builds, even when part names/IDs refer to the same hardware. Share only vendor-name suggestions.
- Source STL/3MF, references, photos, GLBs, preview caches, printer credentials, NAS paths and telemetry snapshots stay on disk/NAS, not as SQLite BLOBs.
- Capture production print-job history and inspection records. Do not carry forward the obsolete detailed Purchasing order/receipt/shipment event ledger into the active schema. Retain a backup/archive and best-effort migration of relevant current purchasing information.
- Read model designer's parts packages as source data, but save each build's independent purchasing progress and status against its own imported identities.
- Distinguish **Printing parts** from **Purchasing parts**: they are different source tables today (`Printed Parts Checklist` vs `Parts Checklist`), with different meaning for required/on hand/completed. No implicit aliasing or counter synchronization.

## 2. Evidence traced to repository code
- `web/src/core/types.ts`: `Snapshot` includes Printing `parts`, `files`, `plates`, `jobs`, `audit`, and Purchasing; `Preparation` has `runs/material/profile/sourceHash/items/notes/savedAt`; `JobItem` freezes file, plate, profile, planned and inspection results.
- `web/src/server/excel-store.ts`: decodes `Printed Parts Checklist`, `3MF Project Register`, `Part-to-Plate Mapping`, `Print Job History`, `Build Desk Preparations`, `Build Desk Result Drafts`, `Build Desk Change Log`, and `Build Desk File Imports`; purchasing is decoded separately. Existing successful-save behavior is revision validation, request-id replay, backup and atomic replacement.
- `web/src/server/purchasing-store.ts`: Purchasing currently originates in `Parts Checklist` and `Order Log`; existing `Build Desk Purchase Items/Ledger` are legacy, not the desired future schema.
- `web/src/core/domain.ts`: `recalculate()` sets Printing accepted = `opening` + valid accepted units from completed jobs only. Completed job items must have accepted + rejected = planned. An inspection draft does **not** count toward accepted totals. Manual reprints retain their original mapping but have `runs=0`.
- `web/src/server/printer-slot.ts`: uses a cross-build printer lock and checks that no other build on the same physical printer has a job in `Printing`. Keep this invariant when storage is consolidated.
- `web/src/server/registry.ts`: currently insists on one Excel path per build and has no SQLite adapter. `web/src/app/api/builds/[id]/route.ts` and related routes import `createStore` from `excel-store`; the adapter and direct imports must change.
- Current Pi documentation reports a local user service, a Pi-local workbook, and source files on a read-only NAS automount. Live ignored registry `local-data/builds.pi.json` was **not** inspected for this design.

## 3. Logical ownership and row model
Use stable TEXT IDs for domain entities, not implicit Excel row numbers. All subordinate business tables have `build_id` and composite unique/foreign keys to prevent cross-build references. Keep submitted IDs stable across migration. Prefer explicit FKs with `ON DELETE RESTRICT` for production history, no cascading deletion of jobs.

### Configuration and source
1. **builds**: `id` PK, `name`, `active`, `printer_id` nullable, `created_at`. Runtime machine-specific mount paths, renderer, default materials, model directory and printer connection settings remain in registry/configuration, not duplicated as authoritative database settings. App-level build identity must agree with registry.
2. **print_parts**: (`build_id`,`id`) PK; section, name, source, material, required_qty nullable, opening_accepted_qty, installed_qty, notes. `accepted_qty` is **derived**, not a writable source-of-truth column; compute from opening plus valid completed job lines. If cached for speed, it must be maintained in the same transaction and reconcilable, not an independent editable counter.
3. **model_files**: (`build_id`,`id`) PK; filename, revision_label, profile, material, section, source_sha256, last_imported_at. Model bytes remain on NAS.
4. **plates**: (`build_id`,`id`) PK; file_id, plate_number, name, section, and unmapped-object metadata (small JSON array acceptable). UNIQUE(`build_id`,`file_id`,`plate_number`).
5. **plate_assignments**: (`build_id`,`id`) PK; plate_id, part_id, imported_copies nullable, `confirmed` as a legacy/mapping-derived split-unit verification field only if still functionally necessary, note. Do not confuse mapping quantity validity with redundant layout-review attestation. UNIQUE within plate/part if domain retains this constraint.
6. **file_imports**: (`build_id`,`file_id`) PK; exact source hash, imported_at, unmapped/metadata as appropriate. May be folded into `model_files` if there is no distinct behavior after analysis; avoid storing source hash with conflicting meanings.

### Saved preparations and durable print history
7. **plate_preparations**: (`build_id`,`plate_id`) PK; runs, material, profile, source_hash, notes, saved_at. **Do not add a new layoutReviewed/layoutConfirmed field.** WP-03 removes acknowledgement; save validations must still require valid positive planned/copy quantities and no unknown mappings for a Start.
8. **preparation_items**: (`build_id`,`plate_id`,`mapping_id`) PK; included boolean, copies nullable, planned_qty nullable. FK to preparation and assignment; membership must match plate.
9. **print_jobs**: (`build_id`,`id`) PK; kind (`plate`/`manual`), status (`Printing`,`Awaiting inspection`,`Completed`,`Cancelled`), started_at, finished_at nullable. Do not assume a job only ever has one part.
10. **print_job_items**: (`build_id`,`job_id`,`line_no`) PK, plus part_id, mapping_id, file_id, file_revision, filename, plate_number/name, runs, planned_qty, accepted_qty nullable, rejected_qty nullable, profile, material, notes. **Immutable start-time snapshots:** do not rejoin through mutable plates/files to render the historical name/quantity/profile. Store the redundant snapshot values intentionally. FKs to jobs; do not require historical mapping to remain currently active.
11. **inspection_drafts**: (`build_id`,`job_id`,`mapping_id`) PK; accepted_qty nullable, rejected_qty nullable. Drafts must not affect accepted totals until job is completed. Preserve existing drafts on migration.

### Simplified Purchasing
12. **purchase_parts**: (`build_id`,`id`) PK; designer part ID, designer description, designer required_qty (read-only to purchasing UI), on_hand_qty, ordered_flag, vendor_id nullable, product_url, ordered_date nullable, notes <= 200 ASCII. Only user-editable fields are on_hand, ordered, vendor, link, date and notes. `available` is **derived** from on_hand >= required; do not persist a second checkbox or quantity-ordered.
13. **vendors**: `id` PK; display_name, normalized_name UNIQUE. Shared *names only* across builds. No catalog parts, stock, account data or purchasing history. Choose/enter vendor in a combo box.
14. **purchase_source_imports** (optional narrow metadata): `build_id`, source_file hash/imported_at, and minimal source part identity mapping to support rare reimports. Prefer no broad import versioning framework. Best-effort preserve annotations for unmistakable same-build part identity.

### Operational metadata
15. **write_requests**: (`build_id`,`request_id`) PK; request hash / operation type, result summary, optional result payload, committed_at and revision. Preserve duplicate-request idempotency from `ExcelStore.commit`; never count a completed job twice after retry.
16. **build_revisions**: `build_id` PK; monotonically incrementing revision INTEGER, updated_at. Return as the existing snapshot revision string for compatibility. Check the expected revision in the same write transaction; conflicts remain HTTP 409.
17. **schema_migrations**: version PRIMARY KEY, applied_at, checksum/description. Migrations must be ordered, transactional and repeatable for fresh installs, with guarded one-time application.

Optional generic audit **not needed for Purchasing**. Do not introduce a full event-sourcing or per-field history system. Retain the immutable domain print-job history, inspection details and minimal write-request table, with logs/backup snapshots for diagnostics.

## 4. High-level relationships
```text
builds
 ├── print_parts
 ├── model_files ── plates ── plate_assignments ── print_parts
 │                   └── plate_preparations ── preparation_items
 ├── print_jobs ── print_job_items (frozen per-run snapshots)
 │               └── inspection_drafts
 ├── purchase_parts ── vendors (shared vendor names only)
 ├── build_revisions / write_requests
 └── purchase_source_imports (if required)
```

Purchasing and Printing are **separate domain entities**, even if their source records have identical textual part IDs. There is no global inventory or part alias table. Build instance identity, not model type, scopes every quantity and status.

## 5. Non-negotiable constraints and indexes
- `PRAGMA foreign_keys=ON` **on every connection**; verify with `PRAGMA foreign_key_check`.
- `CHECK` required/available/opening/installed/planned/accepted/rejected/plate-runs are integral and nonnegative, with required null permitted where legacy Printing permits it. Available/on-hand may exceed required.
- `CHECK` Ordered and Included are 0/1; `CHECK` accepted + rejected = planned when Completed must be enforced by the command transaction (spanning parent/child rows); reject negative or incomplete results.
- Unique (`build_id`,`id`) across entities and composite foreign keys. `ON DELETE RESTRICT` for historical jobs; archival/soft-hiding preferred over deleting used parts/files.
- Index job items by (`build_id`,`part_id`) and jobs by (`build_id`,`status`); plate assignments by (`build_id`,`plate_id`) and (`build_id`,`part_id`); purchasing by (`build_id`,`ordered_flag`); optional index vendor normalized_name.
- Single physical printer: one active `Printing` job across all builds with the same printer_id. Keep existing mutex behavior or enforce via transactional query against `builds.printer_id` **inside the same write transaction**, since a build-local index cannot protect across builds.
- DB file under ignored `local-data` on Pi-local disk, not NAS/SMB. No direct database writes from browser.

## 6. Driver, transactions and concurrency
- Prefer Node 24 built-in `node:sqlite` to avoid native third-party package installation on ARM64, **conditional on a Pi smoke test**, since Node 24's module is still labeled Release Candidate. `DatabaseSync` has synchronous APIs; keep operations short and avoid holding locks during NAS reads/rendering, model parsing, network calls or PDF work. Re-evaluate driver only if actual Pi testing reveals issues.
- Enable WAL only after validating storage and backup handling; configure busy timeout, foreign keys, a sensible synchronous durability mode, and checkpoint on orderly backup/maintenance. WAL sidecar files are not individually safe as backups.
- `BEGIN IMMEDIATE` then check build revision and request id, validate domain command, write related tables and idempotency result, increment revision, COMMIT. ROLLBACK on any failure. Never run a domain operation as many separate autocommit writes.
- Stale clients receive 409. Duplicate request IDs must yield the previous stored result without repeating the operation.
- Keep the existing single server and direct LAN editing protections. If multiple processes could write concurrently, rely on SQLite transactions and durable unique keys rather than process-local mutexes alone.
- At startup run integrity checks; before applying schema migrations, take a verified database backup.

Official reference for foreign-key enforcement: https://www.sqlite.org/foreignkeys.html
Node 24 built-in API: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
WAL file constraints: https://www.sqlite.org/fileformat.html

## 7. Migration procedure (dry-run first)
1. Freeze a **copy** of Pi workbook/config and recorded external asset manifests. Keep the existing Excel authoritative for production until acceptance. Never treat Git checkout as production-data backup.
2. Read source through existing `ExcelStore.decode` into an immutable `Snapshot`; separately capture all legacy Purchasing source records for archival comparison. Export a machine-readable migration manifest (source workbook SHA-256, per-tab counts, source build IDs, timestamp and transformation version).
3. Validate source: unique part/file/mapping/job IDs per build; valid references; job status consistency; every completed job item with valid accepted/rejected counts; baseline count of accepted units per part; outstanding drafts and preparations.
4. Create a **new disposable SQLite file** with migrations. Insert build, Printing entities, print history, inspection drafts, preparations, and simplified Purchasing in one guarded migration operation; preserve original IDs and result timestamps. Use explicit field mapping, not Excel row positions as identities.
5. For Purchasing, map designer ID/description/requirement, on-hand, vendor, link, order date, notes when unambiguous. **Existing old orders do not reliably encode the future independent Ordered flag**: mark ambiguous flags as requiring user review instead of inventing state. Notes may need review/truncation to 200 ASCII; preserve full originals in archive. Legacy source `onHand=null` must be distinguished from 0 until user enters an actual quantity (do not silently pretend absence means zero).
6. Verify original and SQLite snapshots by business semantics, not file hashes: part counts, 3MF files, active plate memberships, completed/cancelled/printing/awaiting jobs, drafts, accepted totals, installed totals, notes, and source hashes. Allow documented intentional differences only for removed acknowledgement and Purchasing-only legacy fields.
7. Test app reads/commands against disposable DB, including stale revision rejection, idempotency, job completion totals, manual reprint 0-run semantics, concurrent printer lock, build isolation, report isolation, vendor sharing and rollback.
8. Test the **three-build pattern** with two independent Kitten 745 instances (fresh designer source) and a different loader model; do not fabricate a live third-model dataset. Validate in fixtures before real source arrives.
9. Benchmark on Pi 3 for loading a build, committing preparation, completing a job, rendering overview query and making a backup. Confirm acceptable latency/memory with NAS asset access unchanged.
10. Once user accepts, coordinate controlled cutover: stop app writes, take final workbook backup, migrate final snapshot, verify counts, atomically switch runtime registry/adapter and restart, check health and representative records. Do **not** use parallel live Excel/SQLite writers. Keep old workbook read-only for rollback.
11. Rollback requires stopping service, restoring prior adapter/config and preserving any SQLite-only user writes after cutover, with explicit reconciliation before reverting (never discard newer production changes).

## 8. Backup/restore policy
- Simple rotation: one daily **consistent SQLite online backup** when data changed, plus backup immediately before schema migration/cutover. Retain e.g. 14 recent daily versions and a pre-upgrade snapshot; finalize storage footprint after measuring real database size.
- Backup outside the live DB write path and preferably copy to NAS **after** generating a consistent local snapshot; source DB stays on local disk. Use the SQLite backup API, not copying just `.db` while WAL writes may exist.
- After each backup, open the backup and validate `PRAGMA integrity_check`, `foreign_key_check`, schema version, and row totals. Test an actual restore to a temporary file. Make restore procedure an operator command with service stopped.
- Protect with filesystem permissions, Git ignore. No HA, cloud, replication, or redundant DB server needed.

## 9. Design verification and signoff gates
**Repo inspection completed:** exact TypeScript domain types, Excel decoder/save boundary, legacy Purchasing decoder, registry and API route, and printer slot code inspected. **Not completed:** direct inspection of live workbook, Pi private runtime registry, real 3MF content, and real second/third build datasets. This is a technically grounded proposal, not evidence of migrated records or working SQLite adapter.

Pre-implementation gates:
- Assert SQL DDL syntax/foreign keys/checks/indexes using an in-memory SQLite test and integrate into automated tests.
- Create migration field-by-field mapping and loss report for actual current workbook clone.
- Confirm any stored duplicate IDs, malformed history, nulls and legacy metadata on that clone.
- Smoke-test chosen Node SQLite driver on actual Pi/Node runtime.
- Decide precise on-hand missing-value UX (NULL vs zero) without silent data distortion.
- Test import and same-build annotation preservation with fresh designer files.
- Finalize a controlled and reversible cutover checklist.

## 10. Approved functional decisions inherited from work packages
- WP-02: Ordered user checkbox independent of inventory; Available derived on_hand>=required; no quantity ordered; vendor dropdown across builds; date-change prompt on each Ordered toggle; Notes <=200 ASCII; compact UI; reports build-scoped; no email/Drive integration.
- WP-03: Remove layout review attestation and tracking counters, retaining actual print preparation/quantity gates; change progress visualization, not the meaning of print metrics.
- WP-04: Three separate build instances, including two instances of identical Kitten model and one distinct loader; no cross-build inventory mapping. Existing production Kitten remains untouched during tests.

## 11. Recommended implementation sequence
1. Add validated SQLite schema/migrations + test fixtures; no runtime switch.
2. Add importer/dry-run and row-level comparison report.
3. Add SQLite DataStore adapter under existing domain contract; verify operations and idempotency.
4. Remove attestation dependency and simplify Purchasing domain/UI via their own WP-03/WP-02 work packages.
5. Multi-build synthetic and real-data tests; performance and restore drills.
6. Documentation updates reflecting **current delivered code only** and staged production cutover.

## 12. DBA decisions vs remaining evidence
**DBA decision:** one shared database file, build-scoped records, intentional historical job-item snapshots, no full purchasing ledger, vendor names shared, SQLite transactions and testable backups. No user schema-field-by-field approval is needed unless new functional behavior emerges.

**Evidence still needed before implementation approval:** current production workbook and Pi registry, semantic migration loss report, real designer second/third datasets, and tested Node SQLite driver on Pi. Do not claim these have been verified yet.

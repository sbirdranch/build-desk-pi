# WP-02 acceptance — November 4, 2026

Status: deployed and technically verified; user UI review pending.
Branch: `Refinement_v2`. Application: `f432130` (main implementation `4c654f3`, HTTP acceptance `035cd3c`, report continuation `9892cd5`, mobile search `f432130`). No main merge.

## Executed checks

- Windows and actual Pi: **54/54 tests passed**, including the real-workbook clone test and the maximum-length report regression. TypeScript and optimized production builds passed on both hosts. Final application builds were performed on the Pi with its ARM64 dependencies and production stopped.
- A fresh consistent production copy passed schema-3 migration, every-field acquisition mapping, protected Printing/request/revision/audit/preparation comparisons, archive hash checks, integrity and foreign-key checks, and a disposable restore/write/replay/stale-revision exercise. The same comparisons passed again against the final stopped snapshot and the live production database after startup.
- Concurrency, shared-printer exclusion, atomic failure rollback, independent inventory, vendor-name sharing, source reimport preservation and Printing lifecycle regressions passed. Purchasing saves leave designer source fields and Printing records unchanged.
- Isolated Pi HTTP server on loopback 4177 passed real reads/saves, required-field protection, independent Ordered/stock behavior, vendor persistence, duplicate replay, stale HTTP 409, foreign-origin HTTP 403, invalid-count/date/URL/notes HTTP 422, and rejection of the retired queue POST with HTTP 405. Both reports exported without changing the revision. All test writes used disposable data.
- Desktop browser: compact editor, explicit Save, repeated Ordered/date choices, stock/Available independence, disabled clean Save, and Save/Discard/Stay navigation were exercised on a disposable installation. Live desktop overview and narrow-screen rendering were checked after deployment. Mobile search remains visible, data-entry controls are disabled, and content does not overflow horizontally. No test edits were made to production.
- Source and status PDFs each contain all **51** selected-build parts despite filters. All 18 populated source URLs have clickable annotations. Every baseline page was rendered and visually inspected: Source List 5 landscape pages; Status 4. Maximum-length valid text/URLs continue across pages without loss (3,970 literal test characters retained in Source; 2,000 in Status), and report input remains unchanged.

## Live data and behavior

| Item | Result |
|---|---|
| Active DB | `/home/preston/build-desk/local-data/build-desk-refinement2-20261104T175420Z.db` |
| Schema | 3, runtime registry schema `build-desk-v2` |
| Purchasing | 51 parts; all prior requirements, stock, source descriptions/specifications and relevant user fields preserved |
| Available stock | 9 of 630 required units; 5 part types Available |
| Ordered | Initially unchecked; independent manual flags |
| Legacy archive | All 15 order items and 32 ledger entries retained with the full original payload and SHA-256 |
| Printing | 101 parts, 29 jobs, 116 accepted units; source records and audit/preparations unchanged |
| Models / printer | All 7 sources readable; telemetry live |
| Initial revision | 0, unchanged by deployment and report export |
| LAN access | HTTP 200; desktop editing available at `http://192.168.0.119:4174/` |

Ten migration warnings identify legacy ordering evidence that cannot establish the user's new independent Ordered choice. All dates and raw prior orders are retained; no flag is inferred. There were no notes-conversion or invalid-link/date warnings in this production migration.

Server startup and Purchasing endpoints no longer ingest queues or contact Gmail/Drive. Retired OAuth/queue tools and active queue configuration paths are absent; the old ignored queue files and credentials are retained in the rollback directory. No matching Pi user/system timers, user cron references or local Codex automations were found. With the user's separate approval, ChatGPT Scheduled was inspected: **Dump Truck Order Watch was already Paused**, with a Resume action. It was left disabled; unrelated tasks were untouched.

## Rollback evidence

Main rollback directory: `/home/preston/build-desk/local-data/releases/refinement2-before-20261104T175420Z`.

The previous schema-2 DB remains intact at `/home/preston/build-desk/local-data/build-desk-20261104T163820Z.db`. The rollback directory contains consistent before/after database backups, the old registry, runtime/config/assets archive, code/build archive, package manifests, migration/validation logs and cutover record. Old source/build/dependency trees and the legacy queue directory are also retained there.

All **13 backup files** were copied to the Windows worktree's ignored `local-data/phase2/rollback-copy/refinement2-before-20261104T175420Z` and matched the Pi's SHA-256 manifest. Both archives were fully read back: 256 code/build files and 758 runtime/asset files. Production data, credentials and preview screenshots remain Git-excluded.

A final CSS-only mobile-search correction retained another code/build/database rollback point at `/home/preston/build-desk/local-data/releases/purchasing-search-before-20261104T180137Z`. It rebuilt on ARM64, restarted successfully, and was verified in the live browser. That correction did not migrate, replace or write production data.

Rollback of the main upgrade must first stop production and preserve a new consistent backup of the current DB. Returning to the schema-2 database is automatic only while its recorded build revisions have not advanced from the baseline. After user edits, preserve and reconcile those newer acquisition values before restoring the earlier DB; never discard them. Reverting the CSS-only correction uses compatible schema-3 code and leaves the database selected and intact.

UI screenshots and PDF QA artifacts are under ignored `local-data/phase2`. The production browser was left on Purchasing for the user's review.

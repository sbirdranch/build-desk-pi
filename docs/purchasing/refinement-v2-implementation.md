# Purchasing refinement (WP-02)

Deployed on `Refinement_v2`; see [November 4 acceptance and rollback evidence](refinement-v2-acceptance-2026-11-04.md). User UI review is pending.

## Delivered behavior

One searchable list with All, Not Available, Ordered and Available filters; compact detail editing; explicit Save; Save/Discard/Stay guards for part, module and build navigation. Designer ID, description, specification and required quantity are read-only. The overview alone shows two mechanical dial gauges. Text values and counts accompany the instruments. Mobile views retain read-only behavior and responsive reflow.

Ordered is independent of on-hand and calculated Available. Every toggle opens a date-choice dialog. Keep existing date preserves even a blank date; Update date proposes the browser's local current date and permits editing it. All choices remain drafts until Save. Notes accept up to 200 ASCII characters. URLs accept HTTP/HTTPS links or blank; embedded credentials and other schemes are rejected. Blank dates/vendors/links are permitted. Unknown historical quantities remain null and visibly Unknown; clearing on-hand preserves that explicit unknown state.

Available requires known on-hand and required values with on-hand >= required. A known zero requirement is Available with known nonnegative stock, but zero/unknown requirements are excluded from both gauge denominators. Empty/zero-denominator gauges show 0%. Unit progress caps extra stock at each requirement. Ordered progress counts positive-required part types; flags and filter counts remain independent and may overlap Available.

Vendor suggestions are case/whitespace-insensitive, shared names only. Existing canonical spelling is reused; changing a part's vendor does not rename any other record or share inventory.

## Storage and migration

Schema version 3 activates normalized `purchase_parts` as the acquisition source. The legacy `Snapshot.purchasing` and its compatibility payload are absent from active Purchasing views; `Snapshot.acquisition` contains only simple part records and vendor names. Printing commands and preparation fields are unchanged in this work package.

`migrate-acquisition.ts` creates a consistent new database copy, never upgrades the source in place, archives the complete current Purchasing payload with SHA-256, and populates the simple records from the **current** legacy payload rather than the stale Phase 1 simplified projection. It preserves part IDs/descriptions/specifications/requirements, stock, vendors, valid product URLs/dates and best-effort notes. It compares all protected Printing tables, request records, build revisions, historical audit and preparation payloads. Legacy order items, aliases, prices, shipments and ledger are retained in the archive and the stopped production backup, not in a live order workflow.

Ordered starts unchecked: a historic order/date cannot establish the user's independent manual flag. A report identifies parts with prior order evidence for manual review. Notes that require ASCII conversion/truncation and any invalid URL/date are reported and preserved in full in the archive.

`validate-acquisition.ts` checks field mappings and protected tables against the source, verifies archive hashes and DB integrity, and exercises consistent restore, disposable writes, replay and stale revisions. It never writes to the supplied source database. Runtime saves keep the existing verified online backups and revision/request safeguards; purchasing saves do not append a large audit or event ledger.

## Designer import and reimport

`import-purchase-parts.ts` is an offline, write-new-copy operation. It accepts the existing designer `Parts Checklist` workbook layout (ID/category/description/specification/requirement/required columns), or a JSON array of `{id, description, required, category?, specification?, requirement?}`. Validate an unfamiliar designer package before mapping it; arbitrary spreadsheet columns are not inferred.

Stable designer IDs are scoped to the chosen build. A same-ID reimport updates only designer fields and preserves all user stock, Ordered, vendor, URL, date and notes. Duplicate IDs and invalid source quantities are rejected. Missing source rows are retained, not deleted. New rows start with zero on-hand and an unchecked Ordered flag. No cross-build alias or inventory matching is performed.

```sh
cd web
node --import tsx scripts/import-purchase-parts.ts \
  --database ../local-data/current-copy.db --output ../local-data/import-candidate.db \
  --build-id kitten-745 --source ../local-data/designer-parts.json
```

## PDF reports

Both landscape reports run locally in Node using PDFKit and bundled DejaVu Sans (license included). Parts Source List includes all build parts, required quantities, vendors and clickable product URLs. Parts Status places Not Yet Available first, then Available, with stock, requirement and Ordered markers. Unknown quantities stay explicit. Build name, generation date, repeated headers, pagination and a total summary are included. Search/filter parameters do not restrict exports; exports do not mutate state.

## Legacy removal

Removed the email event parser/review endpoints, Drive queue loader/checker, OAuth utility, order process launchers, shipment/receipt/correction UI and commands, and the corresponding tests, fixtures and obsolete docs. Server startup has no queue hook. The old queue POST actions are no longer supported. Minimal legacy workbook decoding/types remain solely for archive migration and designer workbook ingestion; they expose no live order mutation commands.

The Pi's user timers were inspected and none were configured. No matching local Codex automation directory existed. The separately authorized ChatGPT Scheduled inspection confirmed Dump Truck Order Watch was already Paused and it remains disabled. External email/Drive producers are not contacted by Build Desk. Existing ignored legacy queue files and credentials are archived during deployment and removed from the active runtime path; they are never committed.

## Deployment and rollback procedure

Stage a `git archive` release under the Pi's ignored `local-data`, install its own Linux ARM64 dependencies, run tests/typecheck/migration/restore, build on the Pi with production stopped and restart the old service, then run isolated HTTP acceptance with a disposable database on port 4177. Only after all four gates pass may `tools/pi-refinement2.py --execute` deploy it.

The deployer stops production, makes a consistent final DB backup, archives the old runtime/config/assets and code, migrates a **new** DB and revalidates against that final backup. It retains the old dependency/source/build trees, installs the staged runtime, retires queue files, switches the registry atomically and verifies live reads. The original database remains intact at its previous path.

If acceptance fails and build revisions have not advanced, the deployer restores the old trees/dependencies/registry and restarts the prior SQLite service. If new writes exist, it stops instead and preserves both DBs for explicit reconciliation. Never roll back to the older DB after new edits without preserving and reconciling those edits. Rollback artifacts and a manifest should also be copied to Windows and verified.

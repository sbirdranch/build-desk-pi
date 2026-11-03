# WP-02 — Purchasing Redesign Requirements
Version: 0.5 (planning baseline)
Date: 2026-11-03
Project: Build Desk Pi — Refinement_v2
Status: Agreed requirements plus explicitly open decisions; no implementation authorized by this document.

## Purpose and scope
Replace the current elaborate order management and email-driven update system with a simple, manually maintained parts-acquisition tracker for model truck builds. Preserve Build Desk's existing palette, theme, typography, overall two-pane workspace and navigation; apply a restrained mechanical/industrial/steampunk treatment chiefly to the overview's circular instrument gauges. Do not create a separate enterprise purchasing application.

## Authoritative inputs and build scope
- Continue importing/populating required purchased parts from the model designer's build-data package.
- Designer-provided part ID/number, description and required quantity are read-only in Purchasing. Their import/mapping is owned by the build-data ingestion workflow, not manual edits.
- Purchasing values are maintained per selected build, even when part IDs coincide between builds.
- Vendor suggestions are shared across all builds.
- PDF exports include **all** purchased-part records for the selected build, regardless of current list filter or search.

## Per-part fields
| Field | Rule |
| --- | --- |
| Part ID / number | Designer-supplied, read-only |
| Description | Designer-supplied, read-only |
| Quantity required | Designer-supplied, read-only, integer |
| Quantity on hand / available quantity | User-editable, nonnegative integer, may exceed requirement |
| Available | Read-only, system-derived: checked iff on-hand >= required; does not mutate Ordered |
| Ordered | User-controlled independent boolean; can check/uncheck at any time for any reason; means user considers ordering handled, not shipping status |
| Vendor | Choose a previously saved vendor (shared across builds) or type a new vendor name |
| Product URL | User-editable URL/link to product page |
| Date ordered | Default to current date on initial transition to Ordered=true, unless already populated; user may edit date subsequently |
| Notes | User-editable plain ASCII text, maximum 200 characters |

No ordered quantity, order line accounting, fulfillment stages, shipment statuses, carrier tracking, delivery monitoring, or automatic receipt processing. The Ordered checkbox is not linked to quantity required, quantity on hand, Available, or any external system. It stays as the user left it even when on-hand changes; turning it off does not change inventory.

On-hand and required quantities determine the system Available checkbox; a partially stocked part remains not fully Available, while its on-hand number shows partial progress. Excess units are recorded but capped at required quantity for acquisition-progress computation.

## Interaction and layout
- Preserve current application appearance, two-pane patterns, and existing unsaved-navigation Save / Discard / Stay safeguards.
- Purchasing overview shows mechanical circular radial/dial gauges only there, not persistently atop the parts list. Dark instrument faces, graduated ticks, metallic-style bezels and needles should harmonize with current colors; no bar gauges for overview progress.
- One searchable parts list with filters: All, Not Available, Ordered, Available.
- Filters intentionally overlap. Ordered items also appear in Available if requirements are met; Ordered is a flag, not a mutually exclusive acquisition state.
- On selecting a part, show read-only designer attributes and editable purchasing fields in detail pane.
- **Visual distinction (accepted):** Ordered appears as an active user-editable checkbox; Available appears as a clearly read-only/system-calculated checkbox or noninteractive status indicator.
- Persist changes with an explicit Save action; do not save every control change immediately. Avoid writing the user-entered Order date until they Save.

## Overview calculations
- Available units progress = 100 * SUM(min(onHand, required)) / SUM(required), computed over selected build's required parts. Cap each part's contribution at required quantity, so extras cannot push percentage over 100.
- Ordered progress = 100 * count(required part records with Ordered=true) / count(required part records), because no ordered quantity is tracked. Clearly label this gauge as a count of part types, not units.
- Show useful supporting counts and links into status filters. Define empty-build/zero-required behavior before implementation; do not divide by zero.
- Gauge numbers must be backed by real records; any mockup values are illustrative only.

## PDF reports
1. **Parts Source List**: all parts of the selected build; part ID, description, required quantity, vendor and product URL, including blanks where not sourced. Make populated URLs clickable. Prefer readable landscape table and sane pagination.
2. **Parts Status**: all parts of the selected build, partitioned into Not Yet Available (onHand < required) and Available (onHand >= required), with part ID, description, required/on-hand quantities and Ordered marker. Incomplete section first, and a brief total summary.

Both reports identify build and generation date. Produce locally on Pi without cloud integration. Report export must not mutate stored data.

## Remove legacy purchasing subsystem
- Remove automatic Gmail integration, Order Watch / Google Drive queue ingestion, OAuth authorization/setup utilities, queue review/acknowledgement, email-derived update parsing, and corresponding scheduled/trigger hooks, tests, configuration and obsolete docs.
- Remove purchasing shipment/receipt/correction-ledger and complex order-management user flows no longer relevant to this feature. **Do not silently erase historical production records during migration**; define legacy preservation/archival before destructive removal.
- Simplify purchasing-specific audit/history: no extensive change ledger. Retain only safeguards needed for reliable saves, backups, migration verification, and Print tracking correctness.
- Do not disturb print-job history, accepted quantities, build isolation, NAS model references, or printer monitoring.

## Dependencies and implementation guards
- WP-01 datastore design/migration must account for Purchasing's simple per-part record and shared vendor suggestions.
- Work on branch Refinement_v2; no main merge until acceptance. Current production on Pi is separate from repository; inspect actual ignored Pi runtime registry and preserve a verified data backup before migration.
- Use disposable stores and synthetic/clone fixtures for automated tests, not live Pi data.
- Keep technical design, migration procedure and implementation notes outside user-facing README; README describes only current delivered functionality.

## Acceptance tests (initial)
1. Import a designer's required purchased parts without manual retyping; designer values cannot be edited via Purchasing.
2. Toggle Ordered on/off repeatedly, save and reload; no quantity or Available side effects.
3. Initial marking Ordered defaults date once; editing date and subsequent toggles retain intended stored date per finalized date policy.
4. Update on-hand below/equal/above requirement and validate derived Available, shortfall and capped progress.
5. Verify unsaved change navigation and explicit Save, durable reload and rejected invalid integers.
6. Verify each status filter, overlap and search; show ordered as interactive, available as system-controlled.
7. Save/select new vendor and reuse suggestion on another build without sharing part purchasing data.
8. Verify gauges with mixed complete, partial, excess and zero-stock parts; appropriate zero-denominator behavior.
9. Export both PDFs and verify all selected-build parts independent of filters; report sections/links and no cross-build leakage.
10. Demonstrate no Gmail/Drive queue calls, authentication/setup code or automatic order-watch behavior.
11. Preserve existing build data and printing histories during migration and upgrade/rollback.
12. Validate responsive read-only behavior and acceptable Raspberry Pi 3 performance.

## Open decisions, not assumptions
1. **Source mapping**: exact format/fields of the designer-supplied parts package; identifiers, changes/removals and reimport merge policy, especially how to preserve user purchasing annotations.
2. **Quantity ownership**: whether on-hand in Purchasing must share one authoritative quantity with existing Parts Checklist/Printing and how to reconcile legacy quantities on migration (must not create conflicting on-hand counters).
3. **Date semantics**: what should happen to a manually entered order date when Ordered is unchecked and later rechecked; initial default is agreed.
4. **Vendor normalization**: whitespace/case-insensitive matching and whether vendor name edits propagate to prior part records. Simple case-insensitive suggestions proposed; not yet approved.
5. **Missing/invalid input**: empty on-hand defaults, blank vendor/date/URL, invalid URL handling, and whether a part with required=0 is included in acquisition metrics.
6. **Editing efficiency**: whether Ordered can be toggled directly in list with an explicit Save, or only from the detail pane.
7. **Legacy data**: archive/preservation method for existing orders, shipment/receipt ledger and audit data before removing integration code.
8. **Report polish**: exact columns, sort order and whether notes/order dates should be included (not part of the agreed minimum).
9. **Dashboard presentation**: exact gauge cosmetics, supporting counts and whether ordered count should include already-available parts (default is yes, because independent and all required part records count).
10. **SQLite schema and migration**: WP-01 will settle one DB vs per-build files and shared vendor persistence.

## Out of scope
Automated Gmail, Google Drive or vendor monitoring; shipping/receiving workflow; order quantities, per-order bookkeeping or prices; extensive change log; vendor contact/CRM; cloud reporting or database service; changing Printing workflow in WP-02.

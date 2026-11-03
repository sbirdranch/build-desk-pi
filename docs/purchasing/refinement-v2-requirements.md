# WP-02 — Purchasing Redesign Requirements
Version: 0.6 (planning baseline)
Date: 2026-11-03
Project: Build Desk Pi — Refinement_v2
Status: Agreed requirements plus explicitly open decisions; no implementation authorized by this document.

## Purpose and scope
Replace the current elaborate order management and email-driven update system with a simple, manually maintained parts-acquisition tracker for model truck builds. Preserve Build Desk's existing palette, theme, typography, overall two-pane workspace and navigation; apply a restrained mechanical/industrial/steampunk treatment chiefly to the overview's circular instrument gauges. Do not create a separate enterprise purchasing application.

## Authoritative inputs and build scope
- Continue importing/populating required purchased parts from the model designer's build-data package.
- Designer-provided part ID/number, description and required quantity are read-only in Purchasing. Their import/mapping is owned by the build-data ingestion workflow, not manual edits.
- Each model build maintains its **own independent parts acquisition records and on-hand quantities**, even when different designers use different names for identical physical hardware. Do not introduce cross-build inventory pooling, identity resolution, alias mapping, or automatic matching of equivalent purchased parts. A new build can be populated from its designer's parts package and its purchasing entries updated from scratch by the user.
- If a designer's package is reimported, preserve existing user-entered purchasing fields where an unambiguous same-build part identity exists; avoid overwriting notes, Ordered, vendor, product URL or on-hand values. Reimport/version changes are expected to be rare; don't build an elaborate synchronization system.
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
| Date ordered | Default to current date on first check of Ordered when blank. Whenever the user changes Ordered in either direction, ask whether to update the Order date field. Keep the stored date unchanged unless the user chooses to update it; date is always manually editable. Apply any chosen date change only upon explicit Save. |
| Notes | User-editable plain ASCII text, maximum 200 characters |

No ordered quantity, order line accounting, fulfillment stages, shipment statuses, carrier tracking, delivery monitoring, or automatic receipt processing. The Ordered checkbox is not linked to quantity required, quantity on hand, Available, or any external system. It stays as the user left it even when on-hand changes; turning it off does not change inventory.

On-hand and required quantities determine the system Available checkbox; a partially stocked part remains not fully Available, while its on-hand number shows partial progress. Excess units are recorded but capped at required quantity for acquisition-progress computation.

## Interaction and layout
- Preserve current application appearance, two-pane patterns, and existing unsaved-navigation Save / Discard / Stay safeguards.
- Purchasing overview shows mechanical circular radial/dial gauges only there, not persistently atop the parts list. Dark instrument faces, graduated ticks, metallic-style bezels and needles should harmonize with current colors; no bar gauges for overview progress.
- One searchable parts list with filters: All, Not Available, Ordered, Available.
- Filters intentionally overlap. Ordered items also appear in Available if requirements are met; Ordered is a flag, not a mutually exclusive acquisition state.
- On selecting a part, show read-only designer attributes and editable purchasing fields in detail pane.
- **Vertical density:** use a compact, space-efficient layout and place related fields on the same horizontal row where practical (for example Ordered/Available indicators, Required/On hand quantities, Vendor/Order date). Avoid unnecessarily tall cards, excessive padding and long vertical scrolling; respect narrower screens with responsive reflow. Keep Save actions accessible.
- **Visual distinction (accepted):** Ordered appears as an active user-editable checkbox; Available appears as a clearly read-only/system-calculated checkbox or noninteractive status indicator.
- Persist changes with an explicit Save action; do not save every control change immediately. Avoid writing the user-entered Order date until they Save.
- On **every** manual toggle of Ordered (check or uncheck), prompt the user whether they want to update Date ordered. Do not unilaterally clear or overwrite an existing date. On the first check when the date is blank, the proposed default is today's date; present the proposed update through the prompt. Exact prompt wording/control behavior can be finalized in UI design.

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
- Remove purchasing shipment/receipt/correction-ledger and complex order-management user flows no longer relevant to this feature. **Best-effort preservation:** attempt to carry forward or archive legacy purchasing records during migration. Some old fields may lack a meaningful mapping to the simplified model; their loss is acceptable once reviewed and documented, and must not block the project. Never compromise printing records or existing live data without backup.
- Simplify purchasing-specific audit/history: no extensive change ledger. Retain only safeguards needed for reliable saves, backups, migration verification, and Print tracking correctness.
- Do not disturb print-job history, accepted quantities, build isolation, NAS model references, or printer monitoring.

## Dependencies and implementation guards
- WP-01 datastore design/migration must account for Purchasing's simple per-build parts records, **no cross-build inventory sharing**, and a shared vendor suggestion list (vendor names only).
- Work on branch Refinement_v2; no main merge until acceptance. Current production on Pi is separate from repository; inspect actual ignored Pi runtime registry and preserve a verified data backup before migration.
- Use disposable stores and synthetic/clone fixtures for automated tests, not live Pi data.
- Keep technical design, migration procedure and implementation notes outside user-facing README; README describes only current delivered functionality.

## Acceptance tests (initial)
1. Import a designer's required purchased parts without manual retyping; designer values cannot be edited via Purchasing.
2. Toggle Ordered on/off repeatedly, save and reload; no quantity or Available side effects.
3. Every Ordered toggle asks whether to update order date; confirm and decline branches, first-check blank-date default, manual date edit, explicit Save, and repeated toggles are tested. No automatic date erasure.
4. Update on-hand below/equal/above requirement and validate derived Available, shortfall and capped progress.
5. Verify unsaved change navigation and explicit Save, durable reload and rejected invalid integers.
6. Verify each status filter, overlap and search; show ordered as interactive, available as system-controlled.
7. Save/select new vendor and reuse suggestion on another build without sharing part purchasing data or on-hand inventory.
8. Verify gauges with mixed complete, partial, excess and zero-stock parts; appropriate zero-denominator behavior.
9. Export both PDFs and verify all selected-build parts independent of filters; report sections/links and no cross-build leakage.
10. Demonstrate no Gmail/Drive queue calls, authentication/setup code or automatic order-watch behavior.
11. Preserve existing build data and printing histories during migration and upgrade/rollback.
12. Validate responsive read-only behavior and acceptable Raspberry Pi 3 performance.
13. Validate compact density on desktop (related fields side-by-side and minimal unnecessary scrolling), with usable reflow on narrower screens.
14. Test distinct designer names for the same physical hardware in two builds; records and quantities remain independent. Test best-effort preservation of same-build purchasing annotations on an unambiguous reimport.

## Open decisions, not assumptions
1. **Source mapping**: exact format/fields of the designer-supplied parts package and how to recognize a part during rare same-build reimports. Preserve user annotations when straightforward; don't require cross-build alias matching.
2. **Quantity isolation**: Cross-build inventory sharing is explicitly prohibited. Determine whether existing same-build Parts Checklist and Purchasing quantities refer to the same acquisition concept; avoid accidental coupling to print-part completion while preserving historic data. Starting purchasing information anew for another build is acceptable.
3. **Date UI details**: Date handling is decided: ask on every Ordered toggle; retain existing date unless user elects an update; first check proposes today's date when empty. Decide concise prompt wording and how to handle an initially blank date when the user declines.
4. **Vendor normalization**: whitespace/case-insensitive matching and whether vendor name edits propagate to prior part records. Simple case-insensitive suggestions proposed; not yet approved.
5. **Missing/invalid input**: empty on-hand defaults, blank vendor/date/URL, invalid URL handling, and whether a part with required=0 is included in acquisition metrics.
6. **Editing efficiency**: whether Ordered can be toggled directly in list with an explicit Save, or only from the detail pane.
7. **Legacy data**: choose best-effort field mapping and optional archival backup for existing orders/receipts; unmappable fields are not a project blocker. Document what was and wasn't preserved.
8. **Report polish**: exact columns, sort order and whether notes/order dates should be included (not part of the agreed minimum).
9. **Dashboard presentation**: exact gauge cosmetics, supporting counts and whether ordered count should include already-available parts (default is yes, because independent and all required part records count).
10. **SQLite schema and migration**: WP-01 will settle one DB vs per-build files and shared vendor persistence.

## Out of scope
Automated Gmail, Google Drive or vendor monitoring; shipping/receiving workflow; order quantities, per-order bookkeeping or prices; extensive change log; vendor contact/CRM; cloud reporting or database service; changing Printing workflow in WP-02.

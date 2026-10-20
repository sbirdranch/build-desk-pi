# Build Desk Purchasing requirements and implementation plan

Version: 1.1 approved workspace and quantity-edit decisions, 2026-10-16.
Status: implementation authorized; readiness and remaining dependencies are tracked in implementation.md.
Audience: the AI session implementing the Build Desk application effort.

## Read first

Read `../order-update-coordination.md` and this file. `../order-watch/requirements.md` is implemented by another session. Consult repository AGENTS.md, README.md and ARCHITECTURE.md before changes. Never modify synced project reference files under `sources/`. Preserve unrelated user changes. Use the connected GitHub integration for remote operations where supported; do not assume shell Git authentication is inherited from it.

## Goal and current baseline

Implement the first usable Purchasing module behind the existing disabled Purchasing navigation button. It should let the user inspect purchased components and orders, enter/correct purchases, explicitly record receipts, and review structured order updates produced by ChatGPT. The release is a local purchasing tracker, not a checkout or vendor-ordering system.

Observed application: Node.js, TypeScript, Next.js and React, with an ExcelJS adapter and `DataStore.load/commit` boundary. `web/src/components/Workbench.tsx` currently renders Purchasing as a disabled planned module; `web/src/server/excel-store.ts` primarily decodes printing data. Extend the normalized domain and adapter rather than treating purchased components as printed parts.

Active build: `kitten-745`; configuration: `config/builds.json`; authoritative workbook: `local-data/kitten-745/Master Tracker.xlsx`. Runtime data and backups are Git-excluded. The retired Google Sheet is not a synchronization target. Purchasing uses `Parts Checklist` and `Order Log`, never `Printed Parts Checklist`.

Existing saves already lock the workbook, reject stale fingerprints/Excel owner files, create backups, validate a candidate workbook and replace atomically. Reuse those protections for Purchasing. Preserve unrelated tabs, formulas, formatting and printing history.

## Release scope

### Purchasing workspace

#### Approved workspace design

- Purchasing is part of the existing Build Desk GitHub application. Commit and push requirements, implementation and supporting documentation to its repository; preserve unrelated changes.
- Clicking the top Purchasing module button opens this workspace. Follow Printing's colors, typography and general layout: title area, left list frame, main details and summary bar.
- Land on an overview with drill-down metrics: quantities, outstanding orders, remaining parts to source and pending updates. Put parts needing purchase prominently on the overview so the user need not hunt for them. Retain an Overview action on detail screens.
- The left frame has Parts and Orders tabs. Parts lists the project's purchased-component requirements. Provide search and status filters; use text/color/icon decorators for sourcing and fulfillment state, including partial state and attention needs.
- Selecting a part makes its specification and quantities primary, with associated orders below. Selecting an order makes order identity and fulfillment primary, with its parts below. Related entities are navigable in both directions; preserve list filters and provide Back navigation.
- Allow a new manual order from the overview/Orders view or from a part, preselecting that part. Orders support multiple items and unlinked items.
- Place the existing single changing Check for Order Updates / Review Order Updates (grouped count) action in the application header where Printing shows the current tracked print. Hide that print information while Purchasing is selected and use a compact button. Completed checkmark decorators are green. This is one action, not two buttons. Reviewing cached work does not fetch again.
- Allow explicit manual edits of Qty Needed and Qty On Hand, with validation and before/after audit. An on-hand correction requires a reason and is an inventory adjustment, distinct from a purchase receipt. Qty On Order and Qty To Source are calculated and read-only.
- Record receipts from order detail, supporting several items in one confirmation and partial receipts. Preserve receipt history on correction.

| ID | Requirement |
| --- | --- |
| PU-01 | Enable Purchasing navigation with a build-scoped workspace consistent with the existing application. Preserve Printing and Assembly behavior. |
| PU-02 | Provide purchased-parts and orders views with search, status filtering, useful quantity summaries and detail selection. Show unlinked order items explicitly. Avoid treating an unknown quantity or price as zero. |
| PU-03 | Part detail shows requirement/specification, needed/on-hand/on-order/to-source quantities, supplier/date information and linked order items. Order detail shows order number, item/variant, quantities, supplier/seller, price/currency, tracking, shipment status, receipts and source references. |
| PU-04 | Support manual creation and correction of orders/items, linking/relinking to existing purchased parts, and leaving a part link blank. Use the same validation and approval preview as imported records. Manual entry can record other vendors without expanding the AliExpress email watch. |
| PU-05 | Provide explicit user receipt entry per item: quantity and date, with validation against remaining ordered quantity. Partial receipts are supported. Corrections must be auditable; do not silently erase prior receipts or inventory. |
| PU-06 | Keep purchase actions distinct from print production. Never change printed quantities, accepted-print totals, printed required quantities, or installed quantities through Purchasing. Order imports also preserve purchased Qty Needed; only explicit manual part edits may change it. |

### Queue checks and notification

| ID | Requirement |
| --- | --- |
| PU-07 | Connect directly to Google Drive using user authorization; no Drive desktop application, paid service, paid trial, public app hosting, or OpenAI API subscription is required by the design. Verify the actual authorization path before claiming readiness. |
| PU-08 | Check configured queues once on application server startup and on explicit user request. Do not implement periodic order polling, background refresh timers, or order checks driven by printer telemetry/browser focus. Persist the last successful check time. Avoid duplicate checks caused by component remounting. |
| PU-09 | Provide a visible application-level pending-order notification, including while Printing is selected, with count and action to open Purchasing review. Counts represent grouped orders; show event count separately only if useful. |
| PU-10 | Purchasing has one changing action: `Check for Order Updates` when nothing is pending; `Review Order Updates` when pending items exist. Revert after all items are resolved. Review opens the cached queue rather than silently doing a new Drive check. |
| PU-11 | A manual check always gives explicit results: found updates, no new updates, or an actionable error. Show checking state, suppress duplicate requests and retain the last good pending cache on failure. Never present a failed check as an empty queue. |
| PU-12 | Startup errors are visible without blocking unrelated local app use. With no Internet or revoked authorization, existing local purchases and downloaded pending work remain available. Unfetched work cannot be claimed absent. |

### Review and approval

| ID | Requirement |
| --- | --- |
| PU-13 | Group pending events into one review per vendor/order, retaining item-level shipment facts and source history. Show current workbook values alongside proposed values and clearly identify new rows, links and calculated consequences. |
| PU-14 | Present `OK`, `Modify`, and `Dismiss`. OK validates and commits the displayed proposal. Modify opens editable data, then a refreshed preview requiring confirmation. Closing leaves work pending. Dismiss changes no purchase/inventory data and records the disposition. |
| PU-15 | Prefer dropdowns/searchable selectors for part/order matching, supplier where known and other enumerations. Status is never free text. Text remains appropriate for actual identifiers, item descriptions and notes; dates use date inputs and quantities/prices validated numeric inputs. |
| PU-16 | Permit matching an existing order/item or creating a new order/item. The same order ID may have multiple items; never use order number alone as a line-item key. Missing matches may remain unlinked. Do not create new checklist part definitions automatically. |
| PU-17 | Resolve partial shipments per item, and per shipment allocation if one item is split. Do not apply a whole-order shipment/delivery message to unspecified items without evidence or user selection. |
| PU-18 | Latest trustworthy event time informs the proposal. Older queued messages must not regress a later shipment state or overwrite user-confirmed receipt. Surface conflicting facts and require correction/choice. Do not hide material conflicts behind a latest-message rule. |
| PU-19 | Only explicit receipt entry by the user may set Received or increase received/on-hand quantities. OK on a carrier-delivery event is not receipt confirmation. Received is unavailable as an AI-proposed status. |
| PU-20 | Validate against the workbook revision at approval time. If relevant state has changed, regenerate the preview and require review again. Retain pending work if Excel is open, validation fails or saving fails. |
| PU-21 | Record applied/dismissed event IDs and source message IDs durably, with user-approved modifications and before/after values. After successful commit, move files to Processed; after durable dismissal, move to Dismissed. Retry a failed move without reapplying data. |

## Status and quantity semantics

Approved shipment/fulfillment labels: Ordered, Shipped, Delivered by carrier, Received, Cancelled. Payment is not a status. Refunds/returns remain notes in this release. UI may display derived `Partially shipped` / `Partially received` summaries, but these are aggregate descriptions, not arbitrary editable status values.

Represent split fulfillment with item/shipment quantities, not a single flag that loses partial state. Order-level summaries derive from those quantities. Received requires full applicable item receipt; partial receipt preserves the outstanding quantity. Cancellation must identify quantity; do not cancel already received units. Over-receipt and pack/unit ambiguity require resolution rather than guessing.

## Existing purchased-component workbook columns

Parts Checklist: Part ID, Category, Part, Specification, Requirement, Qty Needed, Qty On Hand, Qty On Order, Qty To Source, Status, Chosen Supplier, Ordered Date, Received Date, Bernie Link, Notes, Source, Pack Size, Packs To Buy, Planned Purchase Qty, Planned Surplus.

Order Log: Order ID, Part ID, Supplier, Seller, Order Date, Ordered Qty, Unit Price, Line Subtotal, Shipping, Tax / Duties, Total, Received Date, Received Qty, Order Link / Number, Notes, Part Name (auto).

The existing Order Log lacks explicit item IDs, currency, shipment status/history, cancellation quantities, and processed-event IDs. Design an additive schema migration before coding. Prefer app-owned related tabs keyed by stable build/order/item IDs, retaining existing columns for interoperability. Do not repurpose Notes as the only structured store. Existing Order ID values must be preserved even if repeated across multiple item rows.

### Parts Checklist updates after approval

| Field | Rule |
| --- | --- |
| Qty On Order | Sum outstanding noncancelled quantities across linked order items, less confirmed receipts. Shipment/delivery alone does not reduce outstanding inventory. Recompute; never repeatedly increment on each email. |
| Qty To Source | `max(0, Qty Needed - Qty On Hand - Qty On Order)` when inputs are known. Preserve unknowns as unknown. |
| Status | Derive a sourcing summary from quantities using an enumerated vocabulary; do not write carrier shipment labels over sourcing status. Preserve/explicitly map the workbook's existing vocabulary during migration. |
| Chosen Supplier | Fill when blank and established by the purchase. Replacement or multiple-supplier ambiguity must be visible and resolved by the user. |
| Ordered Date | Earliest valid linked purchase date. Cancellation must not erase purchase history. |
| Qty On Hand / Received Date | Update only from explicit user receipts/corrections. Preserve opening on-hand balances; do not replace them with receipt totals. Proposed default for summary date: latest actual receipt date. |

Preserve Part ID, category, name/specification, requirement, Qty Needed, reference links, notes/source and purchasing-plan fields during order import. Existing manual notes are not overwritten. The order review shows both Order Log and Parts Checklist effects before approval. New order items without a part link update only order data.

Pack size and unit basis must be explicit. Two packs of five are ten component units, not two components. Unknown conversions block inventory-affecting approval until the user resolves them. Do not multiply money fields by pack size without evidence.

## Architecture and operational requirements

- Add a Drive queue provider on the server, a versioned handoff validator, a deterministic proposal builder, and purchasing domain commands through the existing store boundary.
- Keep OAuth client configuration and refresh tokens private and Git-excluded; never expose them through client props, logs, fixtures or downloaded documents. Use least privilege sufficient to access the existing shared parent and move queue records. Verify that chosen scopes actually cover pre-existing files.
- Google OAuth setup is a dependency: personal-account consent, redirect URI, token persistence/refresh and testing-mode expiry must be proven. Do not leave a seven-day development consent setup masquerading as durable production authorization. Stop and report any requirement for paid billing or trial enrollment.
- Retain loopback-only editing, same-origin/token protections, archived-build restrictions and build isolation. LAN/phone views remain read-only. Define the manual Drive-check action as host-only because it changes local cached state; show last recorded results elsewhere.
- Keep raw downloaded queue files in ignored local-data, parse them as untrusted data and constrain size/schema. Render text safely. No arbitrary file paths, commands, instructions or workbook formulas may execute from email or JSON content.
- Record event disposition in the same atomic workbook commit as purchase changes. A local cache alone cannot be the idempotency authority. Include a durable move-retry record so restarting after commit is safe.
- Receipts and adjustments need their own durable ledger or equivalent auditable representation. Preserve opening inventory and migration provenance; distinguish preexisting purchases/receipts from imported events.
- No distributed transaction is possible across Drive and Excel: commit locally first, then acknowledge by moving. Reconcile after crashes as specified in the coordination document.

## Proposed delivery phases

1. **Baseline and schema:** inspect current workbook formulas/data validations and existing purchased rows, define stable item identity and additive migration, document mappings and preserve a baseline backup. Confirm the shared contract and free Google authorization path.
2. **Local Purchasing:** enable workspace, purchased parts/orders/details, manual entry/linking, user receipt workflow and safe saves. This provides a usable module independently of the watch.
3. **Queue ingestion:** direct Drive authorization, startup/manual checks, cache, grouping, deduplication, top-level flag and changing Check/Review action.
4. **Review and completion:** before/after proposals, OK/Modify/Dismiss, conflict handling, idempotent commits, Processed/Dismissed moves and retries.
5. **Joint acceptance:** fixtures from the shared contract, then one explicitly approved real end-to-end event. Update README/ARCHITECTURE/configuration documentation and hand off activation instructions to the watch session.

## Acceptance and validation

Run repository checks appropriate to changes: domain/store integration tests, `npm test`, `npm --prefix web run typecheck`, `npm run app:build`, and focused UI verification. Use disposable workbook copies and isolated queue fixtures; do not inject fictional purchases into the live tracker.

Required scenarios: new purchase, existing purchase update, repeat event, forwarded duplicate, multiple items sharing an order number, multiple orders linked to a part, partial shipment/receipt/cancellation, unlinked item, unknown pack size, unknown prices, supplier conflict, late/stale event, explicit receipt only, Modify, Dismiss, close-without-action, stale workbook, Excel lock, invalid schema, Drive outage, revoked authorization, no-results feedback, successful commit followed by failed move/restart, cross-build isolation and unchanged printed-part/history data. Verify startup/manual-only checks without introducing a timer. Confirm cached work survives restart and no API secrets reach the browser.

## Implementation decisions still to resolve, not new scope questions

The application session must inspect and document exact legacy status mappings, existing formula behavior, safe added-tab schema, initial inventory/receipt baselines and mixed-supplier summary handling. Use the defaults above unless actual data exposes a material ambiguity; surface exceptions instead of silently fabricating values. OAuth and queue writer feasibility remain technical readiness gates. Report limitations plainly.


## Purchasing form simplification — 2026-10-16

User-approved interface update: Vendor is the only supplier identity shown or edited. Hide Supplier, Seller, Currency, Unit price, Line subtotal, Shipping and Tax / duties from order edit, review and detail views. Retain Total; assume USD when currency is unknown, preserving an explicit existing currency. Preserve stored legacy detail fields. Remove supplier selection and supplier-only review warnings from the purchasing interface. Provide Remove item for accidentally added unsaved rows when another row remains; existing saved purchases retain their history and are not deleted through this control.

Review and Modify must provide an explicit Cancel action that closes without saving or dismissing queue events. Keep the dialog close control visible during scrolling; previews also provide Cancel.

Single-item order events must populate the proposed Total from facts.order_total, defaulting unknown currency to USD. Preserve explicit currencies and surface conflicting stored totals. Never copy a whole multi-item order total onto each item. Suppress currency/extraction boilerplate from review evidence.

Order current/proposed reviews use one combined item table showing description/variant, linked part, ordered/received/outstanding quantities, status and total. Place Dismiss at the far right of review actions, visually separated from Cancel/Modify/OK, and require an explicit Are you sure confirmation before submitting dismissal. Cancelling confirmation leaves review and pending updates unchanged.

Components per pack stays editable; editing it selects Pack, while choosing Component resets conversion to one. Purchasing saves must not read printing model files or depend on NAS availability; return the committed snapshot directly. Show Saving progress and save failures next to Confirm and save.

# Purchasing implementation and handoff

Updated: 2026-10-16. Requirements baseline: 1.1.

## Delivered behavior

Purchasing opens from the existing application header. It reuses Printing's typography, colors, list/detail workspace and footer conventions. Its landing overview identifies parts still needing purchase, outstanding orders and unknown quantities. Metrics filter the Parts/Orders sidebar. Detail views link parts and orders in both directions; Overview and Back preserve list filters. Part sourcing decorators and order fulfillment labels include partial state. Completed checkmarks use green. Selecting the top-level Printing vehicle opens its overview without collapsing the tree; its disclosure control still toggles expansion.

Manual orders support multiple items, existing-part links or unlinked items, vendor/supplier/seller, dates, unknown prices/currency, pack conversion, cancellation quantities and shipment allocations. All edits have a preview and explicit save. Qty Needed and Qty On Hand are editable; on-hand corrections require a reason. Qty On Order and Qty To Source are calculated. Receipt entry records purchase-unit counts and converts packs to component inventory only with an explicit known conversion. Carrier delivery never changes on-hand quantities.

Local changes run through DataStore.commit, preserving workbook locking, Excel-owner checks, request replay, stale revisions, backups, serialization verification and atomic replacement. Purchasing saves do not rewrite printing tabs. Host-only editing and archived-build restrictions also apply to queue checks and review.

The compact application-header button replaces the tracked-print display while Purchasing is selected and checks when no work is pending and opens cached review when work is pending. Pending grouped orders are also shown on the top Purchasing navigation button while Printing is selected. The custom server initiates one queue check on startup. Browser mounts, focus and printer telemetry do not initiate Drive checks. GET reads the local cache only.

Queue ingestion has bounded downloads, schema validation, build isolation, grouping, conservative item matching, source evidence, conflict review, signed previews bound to workbook revision, Modify/re-preview, OK and Dismiss. Disposition is committed with purchasing changes before Drive moves. Startup/manual checks retry acknowledgments. Failed authorization retains cached work and reports a visible error. Applied/dismissed events do not reapply. Previously processed cached records missing from a restored workbook raise a backup-reconciliation warning; they are never replayed automatically.

## Additive workbook schema and migration

The workbook remains master-tracker-v1; purchasing's related-table schema is version 1. There is no eager write merely from opening Purchasing. The first approved purchasing save adds:

| Location | Meaning |
| --- | --- |
| Order Log column Q: Build Desk Item ID | Stable item key; repeated original Order ID values remain unchanged. Existing rows get deterministic legacy-row identities at their first save; new items use UUIDs. Subsequent row moves retain identity through column Q. |
| Build Desk Purchase Items | Item ID, current Order Log row, structured item JSON. JSON spans consecutive rows with the same ID if needed to respect Excel's cell text limit. |
| Build Desk Purchase Ledger | Entry ID and structured JSON, similarly chunked. Includes an opening migration snapshot, receipts, inventory adjustments, before/after changes and event dispositions with pending Drive moves. |
| Build Desk Change Log | Existing save audit, extended semantic hashes including purchasing data. |

Order Log's original columns remain the interoperability view. Received quantities are cumulative purchase-unit counts; Parts Checklist inventory is component units. Existing legacy rows preserve their current component-unit convention (the five inspected orders are single-component purchases). New pack purchases require explicit pack size. Legacy opening inventory already includes any historical receipts: migration does not add those receipts again. The opening migration ledger retains the initial normalized purchase and inventory snapshot.

Existing Parts Checklist sourcing labels are retained: Confirm quantity, On hand, Ordered, Sourcing, Need to source. These are distinct from shipment states. Sourcing formulas retain readable cached results. Required quantities, on-hand values, notes, links and planning fields are preserved unless explicitly changed. The on-order column becomes the sum of linked outstanding noncancelled purchase quantities converted to components. Unknowns remain blank/unknown. Blank chosen supplier is filled only when linked purchases establish one unique supplier. Existing choices remain intact; mixed suppliers are surfaced in the order preview.

Receipts retain date and quantity in the ledger. Correct an inventory count through the reasoned part adjustment workflow; order edits cannot erase receipt totals or relink already received items. Correct receipt quantities records a signed quantity adjustment with a mandatory reason, updates outstanding and on-hand totals, and retains the original receipt ledger entries.

## Google authorization readiness

**Not connected or accepted against real Drive data yet.** No application OAuth client, refresh token or verified queue-folder IDs were supplied. ChatGPT connector credentials are not available to the local application. The Order Watch automation has not been changed or activated by this implementation.

Host setup helper:

```powershell
node tools/authorize-order-drive.mjs kitten-745 <desktop-client-json> <Pending-folder-id> <Processed-folder-id> <Dismissed-folder-id>
```

The helper uses Google's desktop loopback authorization-code flow with PKCE and state checking. It verifies that all three folders are writable before saving credentials to ignored `local-data/kitten-745/order-updates/drive.local.json`. It never prints token values. Credential storage relies on the host account's private filesystem access. Configuration is not returned to the browser or committed to Git.

Authorization now requests full Google Drive access (`drive`). On October 26, 2026, renewed `drive.readonly` plus `drive.metadata` consent permitted reads but Google rejected moves of connector-created queue files with HTTP 403 `appNotAuthorizedToFile`. Full Drive consent is broader than the app operations: it permits viewing, editing, creating and deleting Drive files. The user must approve this broader scope explicitly; the queue code continues to read and move only configured queue records. `drive.file` alone is not assumed to cover future files created by the separate ChatGPT connector. These are restricted scopes; personal-use configuration, actual consent acceptance, refresh-token longevity and eligibility must be verified before production readiness is claimed. Do not enroll in paid billing, a paid service or a trial. A seven-day Testing authorization is not a durable solution.

Official references checked during implementation:

- https://developers.google.com/identity/protocols/oauth2/native-app
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth

The setup code has no paid dependency, but the user's actual no-cost authorization path has **not** been proven. After setup, test a separate fixture location, restart/refresh behavior, revoked consent, moving a test event, and finally one user-reviewed real event before enabling the watch.

## Shared contract

Consumer reads `docs/order-updates/order-event-v1.schema.json` directly. A narrow schema interpreter fails closed on unsupported keywords; production additionally validates event identity and business constraints. `docs/order-updates/fixtures` contains a valid partial shipment and a prohibited Received example. Tests also cover malformed events, forwarded duplicates, ambiguous allocation and workbook disposition. Fixtures must never be published to the live queue.

The previously written coordination document remains the producer/consumer ownership contract. Its illustrative fixture identifier is documentation-only; production validation requires the canonical hash. Optional fields accepted by the machine schema are `source.gmail_url`, `facts.note` and `facts.original_order_reference`; other extensions require a contract revision.

## Remaining release gates and limitations

- Verify folder IDs, actual OAuth consent and refresh durability; no live Google queue integration has been claimed.
- Confirm producer scheduled-runtime write capability and validate both efforts against the checked-in schema and expanded fixtures. Do not activate the email watch prematurely.
- Perform one explicitly approved real end-to-end event and verify workbook effects and folder disposition.
- Backup restoration is detected using retained acknowledged raw events. It currently requires an explicit administrator comparison/reconciliation; no automatic replay or restoration wizard is provided.
- Receipt corrections support audited signed quantity changes. Relinking a received item requires reversing its receipts first.
- Mixed suppliers preserve the existing checklist choice; Edit quantities includes a selector for the known linked suppliers.
- Event `supersedes_event_ids` are retained/validated but explicit correction semantics require manual conflict resolution; the consumer does not silently replace historical decisions.
- Exact prices are stored as decimal strings. The release does not sum mixed currencies or infer order-total allocation across items.

## Validation record

Verified during this implementation:

- `npm test`: 41 tests passed, including receipt reversals, pack conversion, unknown inventory, duplicate/forwarded events, schema fixtures, durable dispositions, failed remote-move retry, stale/locked saves, immutable audit values and stable item IDs after row reordering. Existing printing tests pass unchanged.
- `npm --prefix web run typecheck`: passed.
- `npm run app:build`: passed.
- Browser acceptance on a workbook clone: overview, selected part, manual quantity preview/save, manual order preview, pending notification, cached review, Modify with part association, regenerated preview, approval, cleared notification, linked order detail, partial receipt save and signed receipt-correction preview.
- Browser save testing exposed an ExcelJS row-removal edge case in metadata rewriting; metadata rows are now cleared and reused. A regression test covers repeated saves and row reordering.
- `node --check` on queue and authorization helpers: passed. `git diff --check`: passed.

Use `node tools/start-purchasing-test.mjs` for an isolated clone/cache server on port 4175. Ensure that port is free first. Its files and PID are under ignored web/test-output/purchasing-browser. Automated integration work uses disposable workbooks/cache directories; fictional purchases are never added to the live tracker. No real OAuth refresh, Drive folder move or producer activation was tested.

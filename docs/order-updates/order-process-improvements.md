# Order process improvements

Branch: `order-process-improvements` (Git does not allow spaces in branch names).

An unmatched email line no longer appears as an additional purchase row. Review asks the user to update a specific existing item or add a new item. Matching rebuilds the proposal on the server against current saved values. Unknown fields cannot erase known fields; conflicting quantities, amounts, variants and shipment allocations remain review conflicts. Selecting a linked part no longer replaces the purchase description.

Approved source aliases are stored in existing item JSON metadata, scoped by vendor and order. They survive workbook reload and ordinary order edits. A changed title or variant without a known alias still requires confirmation; this does not introduce fuzzy or single-item auto-matching. Stable proposed item IDs allow confirmation and shipment messages in a previously unseen order to be matched before the first save.

## Validation and historical replay

The three JSON fixtures under `web/tests/fixtures/order-process` are actual immutable Drive events read on October 26, 2026. They contain source identifiers and concise item evidence, not full emails. Existing workbook baselines used in tests are constructed samples, not verified live records.

- Order 8215721892594099: worm-gear motor shipment, quantity 1. Explicit matching keeps one linked item and preserves the known total and other saved fields.
- Order 8215721892474099: six 6-mm couplers in global transit. Explicit matching keeps six purchased units and one shipment allocation.
- Order 8215721892514099: 37GB555 gearmotor update with unknown shipment quantity. Identity can be resolved, but quantity remains a conflict rather than being inferred.
- A read-only sample of the October 26 confirmations identified order 8216126315974099 as one 250-mm T8 lead screw, total $5.20. A derived consumer test verifies one new purchase and no duplicate on replay. This is not a published producer event or proof of build relevance.
- Order 8216126315854099 has placeholder item content. No event was fabricated or published for it.

Tests additionally cover ambiguous variants, explicit new items, cross-order rejection, saved aliases, receipt/cancellation preservation, and title changes before the first order save.

## Manual acceptance

Run `npm run build` in `web`, then `node tools/start-order-process-test.mjs` from the repository root. The sample app is available at http://127.0.0.1:4176. The launcher creates a disposable workbook and cached event queue under ignored `web/test-output/order-process`. It has no Drive credentials and disables printer monitoring. The `latest.json` file records its process ID and sample directory.

Open Purchasing and review the three sample orders. Choose the existing item for each source. Verify that the motor and couplers keep one row, links and totals; the gearmotor still needs an explicit shipment quantity. Preview and save only in this sample app. Close/reopen a review to abandon an unsaved match. A fresh launcher run creates a fresh sample workbook; stop the previous sample process before reusing its port.

Production deployment, Watch scheduling, Gmail cleanup, live purchasing changes and merging are separate from this branch. New emails and retained Drive records were read only.

# Phase 3 — Printing refinement acceptance

Date: November 4, 2026. Branch: `Refinement_v2`.
Status: deployed and verified; broader styling polish remains deferred by the user.
Application commits: `4b2643a` (functional refinement) and `3092128` (compact desktop gauge grid).

## Changes and functional audit

Removed the layout acknowledgement checkbox, its type field, Save/Start dependency, live reader output, and draft propagation. The old flag is not synthesized as true. Historical source snapshots and rollback databases retain their original bytes/fields, while new preparation saves persist the actual preparation data without an attestation. No database schema migration was needed.

The removed flag previously controlled validation of positive quantities. `core/preparation.ts` now supplies one functional definition used by Save, Start and browser readiness. It checks integral runs in 1..100, configured compatible material, a nonblank profile, readable/current source revision, exact and unique preparation membership, valid whole-number copies/planned quantities, and positive copies/planned output for included parts. Start additionally requires at least one included part and no unknown plate objects. Duplicate included part mappings and changed imported source revisions are rejected. Printer-slot exclusion and the print/inspection lifecycle remain in force. Excluded rows may retain unknown quantities; they cannot become included output without valid numbers.

Preparation Save rejects incomplete included output instead of relying on an acknowledgement tick to activate those checks. Users can exclude an unresolved row, enter its complete-unit quantities later, and save before starting. Physical layout review remains part of the Bambu Studio workflow; it is not recorded as a separate checkbox.

Readiness labels now describe a usable saved preparation. Split-component quantity guidance remains substantive, and a saved-quantity indicator is derived from preparation values rather than acknowledgement state.

Printing overview uses the existing shared instrument component without changing its appearance or the progress calculation module. The four metrics remain completed part types, plates, files and sections. Each shows its original numerator/denominator and percentage; empty builds remain 0%. Overview section rows use inline file/part details and compact count/percentage text instead of extra bars. Section-detail unit progress, navigation, inspection, model references and Purchasing behavior are retained. Desktop gauges fit a single row; narrow screens reflow to two columns.

## Executed validation

- Windows and Pi: **56/56 tests passed**, including real-workbook clone-only save, preparation without a flag, false/forged true legacy flags, independent Save/Start rejection of invalid preparation data, stale sources, unmapped objects, empty inclusion, shared-printer exclusion, replay, atomic rollback, inspection and Purchasing regressions.
- TypeScript and optimized production builds passed on Windows and Pi. ARM64 build used existing matching Linux dependencies with the production service stopped, then restarted the previous release before isolated acceptance.
- Isolated HTTP workflow on a disposable database: invalid included copies rejected despite a forged true flag; valid preparation with a historical false flag saved with no flag in output; Start/replay, Awaiting inspection, draft and Finish passed. Accepted totals changed only at Finish, and Purchasing remained identical. No fictional jobs or results were written to production.
- Live desktop: all four gauges render with unchanged metrics; section names and file/part details are inline; the preparation editor retains inclusion, quantities, runs, material, profile, notes and Save, with no acknowledgement checkbox.
- Live narrow-screen check at 390 pixels: two gauge columns, no horizontal document overflow; viewport reset afterward. The browser was left on the live Printing overview for review.

## Production preservation and rollback

Deployed November 4 at 1:41 PM EST. The existing schema-3 database and registry path remained selected:
`/home/preston/build-desk/local-data/build-desk-refinement2-20261104T175420Z.db`.

**Every application database table matched its pre-deployment SHA-256 fingerprint**, both through stopped installation and again after live UI verification. This protects the user's current Purchasing state as well as Printing history, preparations, audits, archive records and request/revision metadata. No live preparation or history migration was performed. The reader exposes 13 saved preparations with zero acknowledgement fields. Live counts: 101 printed parts, 29 jobs, 116 accepted units, 51 purchased parts; printer telemetry remains live.

Rollback directory:
`/home/preston/build-desk/local-data/releases/printing-before-20261104T184116Z`.

It retains the previous source/build/tools/docs trees, a consistent database backup, previous release record, complete runtime/config/assets archive, code archive and database fingerprints. Dependencies were checked identical and left in place. The six backup files were copied to Windows in ignored `local-data/phase3/rollback-files.tar` and matched SHA-256. The nested archives were fully read back: 227 code/build files and 665 runtime/asset files.

This is a code-only release. A rollback restores the previous code/build while keeping the current production database selected, preserving any subsequent user edits. Do not restore the older database snapshot over newer writes. Returning to the old UI may require its legacy acknowledgement again for preparations saved without that obsolete field; quantities and history remain preserved. Older schema-2 rollback artifacts from prior phases are also retained but are not the rollback target for this release.

Screenshots and test/build logs remain under ignored `local-data/phase3`; no production data or credentials are committed. No main merge was performed.

## Phase 4 input update

The user reports the duplicate haul-truck project and loader project ready for the second and third vehicle tests. Their folders and actual contents have not yet been inspected. Phase 4 should inventory those supplied packages and establish independent tracking state; readiness is not evidence that either dataset has already been imported or validated.

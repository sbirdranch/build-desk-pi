# Second truck acceptance — November 4, 2026

Status: second-truck validation and production cutover complete at 2:44 PM EST.
Phase 4 remains open for the distinct loader. Application source: `f4815f6` on
`Refinement_v2`. Broad visual changes remain deferred.

## Verified result

Production: `http://192.168.0.119:4174/`, documented systemd user service.
Registry: `/home/preston/build-desk/local-data/builds.pi.json`.
Current schema-3 SQLite database:
`/home/preston/build-desk/local-data/build-desk-two-trucks-20261104T194433Z.db`.

| Field | Original Kitten 745 | Kitten 745 — Truck 2 |
|---|---:|---:|
| Build ID | kitten-745 | kitten-745-instance2 |
| Printed parts | 101 | 101 |
| Files / plates | 7 / 26 | 7 / 24 |
| Jobs / accepted units | 29 / 116 | 0 / 0 |
| Preparations | 14 | 0 |
| Purchasing entries | 51 | 50 |
| Production revision | 1, preserved | 0, fresh |

Every pre-existing application table fingerprint, including global vendors,
matched before/after registration. The cutover used the latest stopped source,
not the earlier test database. No test edits or test vendor names reached
production. Every live model source is readable and matches its imported hash;
printer telemetry is connected. Both builds retain `h2d-main`, so tracked starts
remain mutually exclusive. The overview now displays only Parts complete and
Plates complete; file/section completion gauges were removed.

Browser acceptance confirmed the original 116 accepted units and both remaining
gauges, the second truck's zero accepted units and 24 plates, separate 51/50-entry
Purchasing views, correct selected-build PDF links and navigation back to Truck 2.
Screenshot retained locally at `local-data/phase4/truck2-overview.png`.

## Validation executed before cutover

- All 154 source inventory files were rehashed against the supplied folder;
  all 101 selected designer STL hashes match the original geometry inputs.
- Seven independent unsliced 3MF drafts passed native Bambu Studio reopen/export
  checks for object and plate membership, printer, process and material settings.
  Every copied NAS project matched its prepared SHA-256. Source package and
  original truck models were never modified.
- 125 GLBs and 250 image references passed integrity checks. Truck 2 has its own
  asset root, `local-data/kitten-745-instance2/assets`, outside the original root.
- Windows: 55 tests passed, one optional real-workbook test skipped; TypeScript
  and optimized build passed. Pi: the same 55 tests passed plus the separately
  selected real-workbook clone test (56 unique tests), TypeScript and native ARM64
  optimized build passed. Test counts were checked, not just process exit codes.
- Offline import matched every fresh Printing and Purchasing field through the
  actual SQLite reader. Output overwrite and duplicate identity were rejected;
  a missing-part foreign key rolled back without partially registering a build.
- Disposable Pi HTTP acceptance exercised matching part IDs and request IDs,
  scoped requirements and stock, shared vendor suggestions, model availability,
  image/GLB serving, path containment, preparation, common-printer exclusion,
  finish/cancel and membership refresh. The other build remained unchanged at
  each scoped operation. The test process was stopped afterward.
- Complete snapshots for both test builds matched after restarting the isolated
  process. Peak observed server RSS was 215,792 KiB; the slowest measured HTTP
  request was 2.628 seconds. These are short acceptance observations, not a
  sustained load qualification.
- Four PDF exports passed exact build-specific part-ID set comparisons (51
  original, 50 second). Second-truck stock/Ordered and vendor sentinels appeared
  only in its relevant reports. Reports did not mutate either build.
- The original production table fingerprints still matched the test baseline
  immediately before deployment. All gates were recorded in the private stage's
  `accepted.json`; manifest SHA-256:
  `63a99889fb477ca67f4404d80d3e47f84a993fae9b447cb6485e40783acad021`.

## Backups and rollback

Code/runtime rollback:
`/home/preston/build-desk/local-data/releases/printing-before-20261104T194334Z`.

Database/registry rollback:
`/home/preston/build-desk/local-data/releases/second-truck-before-20261104T194433Z`.
The prior database at
`local-data/build-desk-refinement2-20261104T175420Z.db` remains intact.

Off-Pi portable rollback archive:
`local-data/phase4/rollback-files.tar` in the Windows refinement checkout.
SHA-256: `cefec816f331789e142b3880f7bb51104a8bc2efb68d2fc62a6e7f328fd8c0c6`.
All 16 contained files matched their manifest hashes. Fully read both nested
archives (232 code files, 665 runtime files). Restored both one-build backups and
the current two-build database; all passed integrity and foreign-key checks.
The restored two-build copy also accepted a scoped Purchasing write and durable
replay while preserving the original truck and second-truck Printing state.
Those restore-test writes were confined to the disposable local copy.

Follow the rollback safeguards in [Second truck preparation](second-truck-import.md).
Preserve the current database and registry before any rollback. Restore the old
registry directly only while revisions remain at the recorded cutover baseline
(original 1, second 0). Newer edits require reconciliation; never replace them
with the old snapshot. Original NAS sources, model projects, assets and code
directories are retained, alongside the new independent projects and local assets.

## Remaining review

The drafts are not sliced or physically print-qualified. Confirm assembly
quantities, plate orientation/supports/copies and material assignments in Bambu
Studio. Printed-part assembly requirements intentionally remain unknown, and the
designer's conflicting bearing counts remain unknown in Purchasing. No existing
tracking quantities were treated as authoritative designer requirements. See
[source preparation](second-truck-import.md) for the precise interpretation.

The user will review the application UI. The loader requires its actual source
folder and repeats these isolation checks with a genuinely different dataset;
three-vehicle Phase 4 acceptance is not yet claimed.

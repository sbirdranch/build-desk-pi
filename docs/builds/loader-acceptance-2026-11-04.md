# Loader and three-build acceptance — November 4, 2026

All three builds are deployed on the production Pi. Both loader buckets are included and existing truck data is preserved. The subsequent vehicle-selector contrast defect is fixed with explicit dark native select/option backgrounds and light text. Broad styling remains deferred.

## Dataset and geometry

See [source preparation](loader-import.md) for provenance and reproduction tools. All 299 inventoried source files match the original NAS hashes. Eight new 3MFs are saved in `X:\BambuProjects\RC_Kitten980WheeledLoader`, beside the second truck's folder: seven tracked projects (22 plates) and one untracked three-model window-template resource. All eight passed native Bambu Studio reopen/export validation.

The 88 printable component meshes and three template meshes retain the designer's print faces. Transforms allow bed-plane rotation/translation, without tilt, flip, mirror or scaling. Maximum vertex differences were 0.000058410 mm and 0.000054346 mm, within the 0.001 mm tolerance. These are unsliced PETG review projects; physical spools, supports, quantities and slicing still require review.

The loader has 114 physical component types: 88 printable and 26 fabricated metal types (48 metal pieces). Fabricated parts have separate completion quantities and Hand made/Outsourced methods; they never enter print projects or Purchasing. All progress and stock start at zero. Printed assembly requirements remain explicitly unconfirmed. Both buckets' repeated STL basenames resolve through saved source paths. The overview has three credited references: one designer render and two finished-model photographs, cached with original bytes and actual WebP format.

## Validation

- Windows: 56 tests passed, one optional real-workbook test skipped; strict TypeScript and optimized build passed. Pi: all 57 tests passed, including a clone-only test of the actual workbook, strict TypeScript and the ARM64 production build.
- Schema 3 to 4 migration creates a new copy and compares all 18 existing tables. Business rows remain identical; schema migrations append the new record. Integrity and foreign-key checks pass. Loader registration preserves prior build/global rows.
- Isolated HTTP tests cover fabrication completion/installation validation, forbidden fabricated print mappings, replay, three-build preparation/start exclusion, finish/cancel and scoped Purchasing. Only vendor suggestions are shared. Refresh preserves fabricated progress and resolves both buckets' distinct source paths.
- Six PDFs contain exactly the selected build's Purchasing IDs: 51 original truck, 50 second truck, 59 loader. Loader fabricated IDs are absent; exports leave tracking data unchanged.
- Browser validation covers three-build switching, Purchasing/report context, fabricated details without manual-print actions, images/credit and a fabricated quantity/method save on a disposable clone. Complete snapshots match after process restart, including that browser edit. Acceptance writes never target production.
- Cached assets validate 136 GLBs (114 parts/22 plates), 272 image references and three original references. The loader has a separate asset root.
- Short Pi acceptance recorded peak RSS 213,380 KiB and maximum measured request time 7.301 seconds, including PDF generation. Extended load and reboot qualification are not claimed.

The loader's gated source commit is `f7cde6cfb0b71b8c22f841051b890196f5a31444`. All acceptance gates passed before cutover. Contrast-only commit `8b81ef544d92aadfebabf975f2145a3e8b7d3d31` passed its Pi build and live selector check. Computed text/background colors are `#e8edf1` / `#18232b` on the select and all three options. Native popup pixels are not captured by the in-app browser screenshot; explicit computed colors and live selection were checked.

## Production and rollback

Current database: `/home/preston/build-desk/local-data/build-desk-loader-20261104T212844Z.db`, schema 4, selected by three scoped entries in private `local-data/builds.pi.json`. All live endpoints pass. Original truck: 101 parts/26 plates, 29 jobs, 116 accepted units. Second truck: 101 parts/24 plates, no production history. Loader: 114 parts/22 plates, 26 fabricated records, 59 Purchasing entries and no history/completion. Baseline revisions are original 1, second 0, loader 0.

Full loader rollback directory: `/home/preston/build-desk/local-data/releases/loader-before-20261104T212844Z`. This retains consistent schema-3 and schema-4-before-loader copies, previous registry/release metadata, code/runtime archives and acceptance evidence. The previous schema-3 production database also remains in place. Pair old code with its schema-3 registry/database. Stop the service and preserve current schema-4 data before rollback. If revisions exceed the baseline, reconcile those edits or use compatible schema-4 code rather than restoring old data over them.

Contrast-only rollback directory: `/home/preston/build-desk/local-data/releases/printing-before-20261104T221510Z`. This holds a consistent three-build database backup and preceding schema-4 code/runtime archives. All application table fingerprints matched during this stopped code-only deployment. To undo CSS, restore preceding code while retaining the current schema-4 database/registry.

An off-Pi copy is retained under the Windows checkout's ignored `local-data/loader/portable-backup`, with its Pi counterpart `local-data/loader-portable-20261104T2215`. It includes both rollback sets, current loader assets, registry/release metadata and a consistent current three-build database. All transferred SHA-256 values matched. All files in four nested code/runtime archives were read successfully. Four databases were restored into separate verification files; each passed integrity and foreign-key checks (two pre-loader copies and two three-build copies). Archive SHA-256: `981c2661454ae12f26eff89ee291fb399c6433d181ba118d5d5462bc7bd82de4`. `verified-restores.json` records the checks. These private runtime/backup files are excluded from Git.

The service is `systemctl --user ... build-desk`; use the established SSH procedure in [raspberry-pi.md](../raspberry-pi.md). Designer files and previous project folders remain untouched. Development stays on `Refinement_v2`, without a main-branch merge.

# Assembly and Print preview deployment — 2026-11-15

Deployed to the existing Pi user service at http://192.168.0.119:4174/ at 5:27 PM America/New_York. Source: local `main` at `59da9e4`, including the uncommitted Media fallback fix and its regression tests. No commit or push was performed. Other checkouts were untouched.

## Release contents and data

- Assembly module and schema 6 from the existing unpushed commit, enabled for Kitten 745 with the hash-verified 87-page manual and 98 work items. Loader remains unconfigured for Assembly.
- Print detail still-image fallback when WebGL or a model is unavailable; normal automatic 3D remains enabled.
- Built natively on the Pi using its installed ARM64 dependencies. Private configuration, object mappings, generated assets, printer settings and NAS paths were preserved.
- A fresh stopped copy of the production database was upgraded and selected at cutover. Every pre-existing application table matched its pre-cutover row fingerprint; only schema metadata and the new Assembly table changed. Integrity and foreign-key checks passed. No production test edits were made.
- Cutover preserved truck revision 94 (101 parts, 29 jobs, 51 Purchasing items) and Loader revision 8 (114 parts, 0 jobs, 59 Purchasing items).

## Verification

Pi: 62 tests passed, one optional real-workbook test skipped, zero failures; TypeScript and optimized production build passed. Staged HTTP checks covered both builds, thumbnails, full-size stills, GLBs, manual hash and isolated Assembly save/reload.

Post-deployment Edge browser checks passed with WebGL enabled and disabled: plate/part previews, decoded full-size fallback, navigation, Assembly overview, Step 89b page-77 PDF link, PDF bytes, editable step controls, Purchasing navigation and Loader unavailable view. No uncaught browser errors. Screenshots were visually inspected. The systemd user service is active.

Private evidence, scripts and screenshots are retained in ignored `local-data/assembly-qa/deploy/`. Source manifest SHA-256: `5da139765ffbf209946ad41e71159fcd391024cd3230ec7d3dfe43ac66eeb221`.

## Recovery

Pi rollback directory: `/home/preston/build-desk/local-data/preview-assembly-rollback-20261115T222706Z`. It retains previous source/build directories, replaced files, registry/release metadata, a consistent pre-upgrade database snapshot and source/fingerprint manifests. The original schema-5 production database also remains unchanged.

Selected schema-6 database: `/home/preston/build-desk/local-data/build-desk-assembly-20261115T222706Z.db`.

A rollback to schema-5 code requires compatible schema-5 data and registry. Stop the service and preserve the latest schema-6 database first; do not restore an older snapshot over newer production edits. The previous `current-backup-1.0.0` recovery snapshot predates Assembly and is not a current schema-6 backup. The deployment script refuses automatic data rollback if existing-table fingerprints show subsequent writes.

User acceptance completed: the user confirmed that images are fixed and the first Assembly pass is complete and tested, and authorized pushing the code to the remote repository.

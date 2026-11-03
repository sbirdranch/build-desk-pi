# WP-04 — Multiple Build Validation
Version: 0.1 (planning baseline)
Date: 2026-11-03
Project: Build Desk Pi — Refinement_v2
Status: Planning; second model dataset not yet identified. No production actions authorized.

## Objective
Verify the existing multiple-build capability with a second, real designer-supplied model dataset while retaining the current Kitten 745 build and its data unchanged. This is validation and targeted repair, not permission to replace the build architecture wholesale.

## Verified repository baseline
- Current versioned build registry describes one active build, `kitten-745`, with an Excel adapter.
- The Raspberry Pi runtime has a separate, Git-ignored `local-data/builds.pi.json` registry; its exact current contents must be inspected on-device before deployment.
- The design supports per-build IDs, datastore descriptors, asset roots/catalogs, model directories, workflow options and printer identity, selected through a build picker.
- The documented backend enforces build-scoped data and assets; identical part IDs in different builds must not collide.
- The existing architecture limits simultaneous tracked printing on the same physical printer across builds.
- No New Build wizard exists; build registration is configuration-based. These are design/documentation statements, not proof of end-to-end testing on a second real dataset.
- Target device is Pi 3 B+; model source files are on a read-only NAS mount and local production data/assets are on the Pi.

## Requirements
1. Keep the current Kitten 745 production data and history, including jobs, accepted counts, preparations, and assets. Take and verify a backup before any migration or live registry changes.
2. Add one distinct model build using actual designer files/data supplied or selected by the user; do not invent a dataset or silently use another variant as the test model.
3. Assign a unique stable build ID and separate build-scoped data, models and asset references. Part names/IDs may overlap or differ without cross-build mapping or inventory pooling.
4. Purchasing inventory and statuses are independent per build. Only vendor name suggestions are shared per WP-02.
5. Preserve selected-build context in navigation, Printing, Purchasing, PDF reports, assets and updates; never leak records between builds.
6. Keep shared physical printer identity and cross-build start exclusion. Printer telemetry alone must not change tracked print state.
7. Work toward the WP-01 datastore design; avoid implementing an expendable second Excel migration path solely for this test. Stage tests with new datastore once implemented unless earlier adapter tests offer useful confidence.
8. Use cloned/disposable data for early acceptance. Add the real second build to the live Pi only after isolated acceptance and explicit deployment readiness.
9. Preserve the current workflow and compact visual styling; avoid additional UI complexity or mandatory onboarding wizard.

## Test stages
A. Inventory second dataset: designer parts, required counts, model 3MF/STL references, mappings, images and any existing history; record unsupported fields and source gaps.
B. Baseline and protection: verify backup and snapshot Kitten 745 counts, jobs, accepted totals and asset references.
C. Register second build in test environment and load its own data without overwriting the first.
D. Switch repeatedly and exercise navigation, overview, parts, plates, images, purchasing and status/report exports. Verify every view/command is build scoped.
E. Save edits, reload browser, restart service and validate persistent isolated values. Include same-ID collision cases.
F. Exercise preparation/start/finish/inspection with synthetic test runs or clone fixtures. Verify shared-printer mutual exclusion and other workflow protections.
G. Measure Pi memory, load latency and critical interaction response; avoid trying to load both complete geometry libraries into memory.
H. Reconcile outcomes with WP-01 schema/migration and WP-02/WP-03 refinements, then gate live deployment on user acceptance.

## Acceptance criteria
- Two genuine model builds appear in selector and behave independently.
- All existing Kitten 745 records remain consistent with baseline.
- No accidental purchasing inventory sharing or automatic alias matching.
- Shared vendor suggestions work without sharing part-specific purchases.
- Print history/results do not bleed across builds.
- Same-printer concurrent tracked start is rejected.
- Build-specific asset paths remain restricted and correct.
- Reports contain only selected-build data.
- Save/reload/restart behavior is durable.
- Pi resource usage remains practical.
- Backup and rollback are demonstrated.

## Dependencies
- WP-01 datastore decisions, schema and migration.
- WP-02 simplified purchasing model and shared vendor suggestion list.
- WP-03 Printing refinements and preserved preparation validations.
- Runtime registry/NAS path verification before deployment.

## Open inputs
- Identity of the second model and its actual build-data package.
- Whether the second build shares the H2D printer or requires a different printer configuration.
- Actual source files' schema, assets and mapping completeness.
- Whether the user wants test-only acceptance or eventual immediate addition of second build to production after signoff.

## Out of scope
A general-purpose build registration wizard, global parts inventory reconciliation, arbitrary vendor automations, duplicating Kitten 745 as a fake model, replacing user-supplied model data with synthetic production data.

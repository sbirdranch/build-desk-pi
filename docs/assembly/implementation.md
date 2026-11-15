# Assembly module

## Plan and design

Use the existing Workbench module navigation, two-pane workspace, dark palette, yellow actions, instrument gauge, summary rows, status dock, and unsaved-change modal. Open Assembly on its overview, followed by a searchable phase/step list and a single-step editor. Persist completion and notes explicitly through the existing authenticated command endpoint, optimistic build revision, request replay protection, audit log, transactional SQLite store, and pre-write backup.

The actual instruction PDF was inspected before implementation: 87 pages, five phases, steps 1–97 plus a distinct 89b (98 work items). Some pages contain two steps. The versioned index records each step's real PDF page, phase, and the SHA-256 of the original PDF. Steel plate (67), electronics (86), and dimensions (87) are reference links, excluded from completion totals. Instruction titles inside drawings are images; the module retains the PDF's extracted step labels and directs users to the original drawings.

Assembly records are independent of printed-part installed counts and purchasing availability. Checking an assembly step does not credit parts, consume stock, complete print jobs, or claim the build is physically ready. Users can reopen a completed step without losing its notes. The dashboard counts all 98 steps regardless of filters and offers the first remaining step in manual order. Each build has independent records, even when it uses the same manual.

## Implementation

- `web/src/core/assembly-manual.json`: source index, manual hash, five phases, 98 steps and reference pages.
- `web/src/core/assembly.ts`: record type and progress calculation.
- `Assembly.tsx`: overview, filters/search including notes, step completion, 4000-character Unicode notes, explicit save/discard, previous/next, source-page links, and Save/Discard/Stay navigation protection.
- Existing Workbench navigation guards cover leaving Assembly for another module, build, page refresh or closing the tab. Archived and narrow-screen views retain existing read-only rules.
- Schema 6 adds `assembly_steps`, keyed by build, manual, and step. Existing tables are preserved. Assembly writes update only the selected assembly row plus shared revision, request and audit metadata.
- The manual endpoint uses only the configured server-side path, verifies its hash against the index, and returns the PDF inline. Missing manuals return 404; mismatched versions return 409 so page links cannot silently point into a different document. Paths are not exposed to clients.
- Builds without a supported manual show an unavailable message. The index currently supports Kitten 745 only; do not assign it to the Loader. Excel workflows continue unchanged; Assembly persistence requires SQLite.

## Enable on a host

Implementation and browser acceptance were performed locally. The running Pi installation and its database were not changed.

1. Stop Build Desk and retain the current release and private registry for rollback.
2. With Node.js 24, run `node tools/migrate-assembly.mjs /absolute/path/to/build-desk.db`. The tool requires an existing database, creates a timestamped SQLite backup, then upgrades idempotently to schema 6. Use it only with the service stopped. Never downgrade the app against schema 6; restore the pre-upgrade database and previous release together if rolling back.
3. Copy `Dump_Truck_Build_Manual_Portrait_US_Letter.pdf` from the Buildmanual folder to `local-data/manuals/kitten-745.pdf` on that host. This copyrighted source document is not committed to Git. The local workspace already has a local reference copy at that destination for testing. Deployments must transfer it separately; copying the repository does not copy this file.
4. In the private registry, add `"assembly":{"manual":"kitten-745","pdf":"local-data/manuals/kitten-745.pdf"}` and add `assembly` to `modules` for each applicable truck build. The same PDF can be shared by multiple truck builds; completion records remain separate. See `config/builds.pi.example.json`. Do not replace the production registry with the example.
5. Install dependencies normally, run tests and typecheck, build, and restart the service. Verify the overview, Step 89b page link, save/reload, and independent build progress through the host's normal access policy.

The PDF can also be stored on a readable NAS path configured in `assembly.pdf`, but a local copy avoids NAS availability delays. The endpoint rejects a PDF whose bytes differ from the indexed version. Updating the manual requires deliberate reindexing and review of step identity/page associations before deployment.

## Validation (2026-11-15)

- TypeScript check and optimized production build passed.
- Automated tests cover the 98-step index (including 89b and shared pages), zero/full/phase progress, schema-5 upgrade without data loss, durable Unicode notes, reopen, build isolation, retries, stale revisions, validation, archived/unconfigured writes, transactional rollback, audit, and preservation across subsequent Printing edits.
- Full existing regression suite: 61 passed, zero failures, one skipped; the existing optional real-workbook test remains skipped when its external fixture is unavailable.
- Headless Edge acceptance against the production server on an isolated temporary SQLite registry passed: dashboard first, correct PDF bytes and page links, save and reload completion/notes, previous/next, Save/Discard/Stay, module and build navigation guards, independent second build, unconfigured Loader, archived and mobile read-only views, no horizontal mobile overflow, Printing/Purchasing navigation, and no browser errors.
- Dashboard, saved dashboard, Step 89b and mobile screenshots were captured under ignored `local-data/assembly-qa/` and visually inspected. No production records were used.

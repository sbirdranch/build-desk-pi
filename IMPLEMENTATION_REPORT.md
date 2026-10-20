# Build Desk 0.2.0 implementation report

## HTTP browser save recovery — October 20, 2026

Reproduced Save preparation hanging in the actual browser against a disposable workbook on the Pi's HTTP origin. The browser threw `crypto.randomUUID is not a function` before sending the save request. Request setup ran after setting busy but before entering try/finally, leaving the form permanently disabled. Earlier HTTP acceptance checks used API clients, which did not exercise that browser-only request-ID path.

Replaced browser UUID calls with an HTTP-compatible shared ID helper using `crypto.getRandomValues`, retaining random version-4 IDs. Printing saves and new purchasing items use the same helper. Payload serialization and request-ID setup now run inside try/finally so an early failure displays an error and clears busy. Preparation saves display an explicit Saving state. New tests cover a crypto object with no randomUUID and an unavailable random source. Reference: [browser getRandomValues support on HTTP](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).

All 56 tests passed on Windows and the Pi, including the real-workbook clone round trip. TypeScript and the Pi production build passed. Restarted using `tools/start-app.mjs --restart` and returned to the enabled user service. Actual HTTP browser testing against a disposable workbook saved an unconfirmed draft, rejected invalid plate runs with an actionable error and re-enabled controls, then saved a confirmed preparation and opened the Start tracked print dialog. Closed the dialog without recording a print. The two successful saves produced exactly two audit entries and two backups; all 13 historical jobs and part quantities were unchanged. Stopped the disposable server. The production workbook matched its pre-change checksum, and the production user service remained active.

## Direct home-network HTTP — October 20, 2026

Replaced required SSH-tunnel access with direct HTTP at `http://192.168.0.119:4174/`. The deployed service binds IPv4 interfaces and explicitly permits editors from the configured home subnet using the configured IP/port Host. The Node server derives separate host-local and editor headers from the real socket, replacing any client-supplied values. LAN editors receive the existing edit token; same-origin, token, archived-build, workbook and audit safeguards remain in force. Process IDs remain host-local. Four new tests cover default isolation, configured subnet/Host matching, forged headers, invalid configuration and origin/token rejection. The Windows launcher now opens the direct URL without SSH.

All 54 tests passed on Windows and on the actual Pi, including the real-workbook clone round trip. TypeScript and the Pi production build passed. Deployment used `tools/start-app.mjs --restart` before returning to the enabled user service. The server was verified listening on `0.0.0.0:4174`. Direct LAN API acceptance on a disposable tracker returned 200 for a save, created one backup, replayed the same request without another save, and preserved jobs/accepted totals. Foreign origins and missing tokens returned 403; forged Host/access headers yielded no edit token. LAN health responses omitted the process ID. The disposable server was stopped. The production workbook matched its pre-deployment checksum. The obsolete Windows SSH tunnel was closed, and direct access plus the updated launcher continued working.

## Pi edition branding — October 20, 2026

The application is presented as **Build Desk Pi** in its header (with a green Pi badge), browser title, loading screen, About dialog and branding manifest. About identifies the Raspberry Pi workbook and links to the Pi repository. IntegratedSA LLC attribution and the truck artwork are retained. Internal service identifiers, workbook sheet names and production records retain their existing identities. The Windows launcher documentation explains its background SSH tunnel and browser behavior.

Local TypeScript and the on-device Pi production build passed. Deployment used `tools/start-app.mjs --restart` before returning control to the user service. Browser verification confirmed the Pi badge, title and About details; API verification confirmed editing remained enabled with 101 parts and 13 historical jobs. The workbook checksum was unchanged from the pre-deployment record. A branding screenshot is retained only in ignored local-data.

## Raspberry Pi fork — October 20, 2026

Windows validation: all 50 tests passed, including the real-workbook clone round trip; strict TypeScript and the production build passed. The fork started and restarted with `tools/start-app.mjs --restart` on isolated port 4176. Its page, health, registry and copied tracker endpoints returned 200, and a foreign-origin mutation returned 403. The copied tracker had 101 parts and 13 historical jobs. The disposable service was stopped afterward. All 636 checked original runtime files retained their hashes and the uncommitted source changes were preserved. The original Windows service was subsequently stopped for production cutover as described below.

Created the private `sbirdranch/build-desk-pi` continuation from the existing Git history and a copy of the current Windows source changes. Added Linux registry examples, system and user service templates, loopback binding by default, port-aware launchers and Linux browser-opening support. Next builds use one worker with Webpack memory optimizations. Windows editing uses SSH port forwarding with the existing token/origin/socket security boundary. The optional real-workbook test accepts `BUILDDESK_TEST_WORKBOOK` and skips when no local reference workbook exists; all synthetic workflow tests remain available on a fresh clone. Deployment steps, Bambu/renderer limits and rollback are in `docs/raspberry-pi.md`.

### Pi hardware verification and production cutover

Verified the actual Raspberry Pi 3 B+ Rev 1.3 at 192.168.0.119: Debian 13, aarch64, 905 MiB RAM, 904 MiB swap. Installed checksum-verified official Node.js 24.22.0 ARM64 under `/home/preston/.local/node`, and the application under `/home/preston/build-desk`. The Pi passed 49 synthetic tests plus the separately selected real-workbook clone test, strict TypeScript and the optimized production build with a 512 MiB Node heap. No ARM64 build emulation was used.

A disposable API save on the Pi returned 200, created a workbook backup, preserved all jobs and accepted totals, and left the staging workbook unchanged. Foreign-origin mutation returned 403. Manual start/restart checks used `tools/start-app.mjs --restart`; production now uses the enabled `build-desk` user service. The user enabled lingering, verified as `Linger=yes`. An actual reboot test and extended load qualification remain pending.

The existing `//IBFNAS.local/Preston` share is mounted read-only through enabled `mnt-builddesk.automount`; all seven registered 3MF files are readable at `/mnt/builddesk/BambuProjects/RC_DumpTruck`. No NAS model files were moved. All 455 transferred preview/reference assets passed hash verification. The Pi has local preview caches, while Bambu Studio remains on Windows for manual opening/saving of the same NAS sources. NAS credentials were entered locally and remain in ignored storage.

Stopped the Windows service, retained a separate final workbook backup, and transferred 150 runtime files covering the workbook, original export/backups, purchasing state and printer configuration/CA. Every transferred file passed SHA-256 verification before startup. The active Pi workbook is byte-identical to the stopped Windows record: SHA-256 `153b5352cdc375c8c42898012cd38f3942d3cbf956255ee17aa370c00364487a`. Runtime verification showed 101 parts, 13 historical jobs, 56 accepted units, editing enabled through the Windows SSH tunnel, and live printer telemetry. All 636 checked original protected Windows files remained unchanged.

Windows access is **http://127.0.0.1:4176/** using `Open-Pi-Build-Desk.cmd` or `node tools/open-pi.mjs --open`. A separate Windows-user-owned key fixed the original sandbox-key permission failure; passwordless login and tunnel startup/reuse were verified under the user's Windows account. Source code and public setup scripts are versioned; workbooks, generated assets, NAS/printer/Drive credentials and private SSH keys are excluded from Git.

Delivered October 15, 2026. Application attribution: IntegratedSA LLC.

## Running application and records

The production build runs locally at http://127.0.0.1:4174/. Start-Build-Desk.cmd opens or starts the background service. Home-network connections receive read-only access; the PC must remain running. No Google Cloud setup, cloud credentials, database server or paid runtime service is required.

The active record is `local-data/kitten-745/Master Tracker.xlsx`. The complete 16-tab Google export is retained in `local-data/kitten-745/backups/Google-export-2026-10-15.xlsx`. At delivery the active workbook remains byte-identical to that export: no test jobs, preparations or completion counts were written into production. SHA-256: `a8023037604ef87f84dac45358769d3da034c5d1f44b2acfcce62bcb15c06d95`.

Imported records comprise 101 parts, seven current registered 3MF files, 24 tracked plates and one completed historical job. Accepted units total 16. Required quantities are unconfirmed for 98 part types; the app exposes that uncertainty and calculates progress only over confirmed requirements. Obsolete/deleted FrontChassis.3mf is excluded. Standard Wheel and Standard Hub are absent from the tracked library.

## Implemented workflow

- Shared vehicle → section → 3MF → plate → part navigation, synchronized breadcrumbs/tree, search, readiness/completion filters and name sorting.
- Vehicle progress/section summaries; realistic truck branding; About attribution; three original high-resolution finished-product references with zoom.
- Real STL thumbnails/stills and on-demand rotatable part/plate models. Desktop Bambu handoff and saved-3MF metadata/preview refresh. Unknown estimates display Not yet sliced.
- Saved preparation per plate, enabled-copy defaults, plate runs defaulting to one, reviewed material/profile/layout, explicit Save/Discard/Stay.
- Start snapshots the saved plan; only one Printing job can occupy a shared physical printer. Other plates can be prepared meanwhile. Mark print finished moves to Awaiting inspection without accepting parts.
- Inspection drafts, validated accepted/rejected results, exactly-once result commits and auditable history. Custom manual reprint results credit original part mappings with zero original-plate runs.
- Local Excel adapter with workbook locking, stale-edit detection, Excel owner-file checks, backups, atomic replacement, duplicate-request replay and change logging. Three app-owned tabs are added on the first real save; all original tabs are retained.
- Separate Builds registry and workbook/asset roots, normalized data-store interface and printer identity. Only the selected build is loaded. Another workbook schema can be added through an adapter.
- Responsive phone review showing last recorded information; editing remains on the host desktop. File and mutation APIs enforce access independently of UI visibility.

## Verification performed

All 12 integration tests passed. Coverage includes a full preparation/start/draft/acceptance cycle, backups/audit, duplicate request replay, stale source and invalid counts, one-printer constraints within/across builds, manual multi-plate results, outside workbook edits, Excel owner locks, build isolation, printer-finished/cancel behavior, origin/token access controls, asset traversal rejection and disabled-object/untracked-plate metadata. A save on a disposable clone of the actual export preserved all 101 part balances and the 16 original tabs, adding only the three app tabs. The production workbook was verified unchanged afterward.

Strict TypeScript checks and the optimized application build passed. Runtime checks confirmed all seven NAS sources were accessible, source/preview fingerprints were current, foreign-origin POST requests were rejected, and requests made through the PC's home-network address remained read-only even with a forged local-access header. Tests used that same host address; a separate physical phone was not used.

Browser checks covered section/file/plate navigation, a regenerated plate GLB loading, default preparation quantities, Stay/Discard navigation, reference-photo 100% viewing, About attribution and the phone viewport's read-only layout. A separate browser service used a disposable clone of the actual export for Save preparation → Start → Mark print finished → Save inspection draft → Commit completed results. It credited two accepted units and one rejected unit, produced five audit entries, and closed the job. The production workbook remained unchanged at 16 accepted units. The first physical print remains part of user acceptance.

In-app Cabin refresh regenerated its plate previews successfully. Front Chassis previews were also regenerated after detecting a changed source; its newly discovered P08 remains an untracked candidate. The asset library now contains 101 part models and 26 plate models (24 tracked and two untracked candidates). Integrity verification passed for 127 GLBs, 254 main images and three reference photos, with no exceptions. Supporting rendering-library read permissions were corrected for the Windows account running the app.

## Limits and next acceptance steps

Read-only printer telemetry was added after the initial delivery, as detailed below. Physical layout changes, slicing and printing remain manual in Bambu Studio. Current saved archives provide no verified time/material estimate. A deliberately sliced saved working copy still needs a save/reopen check with this installed Studio version before promising reliable estimate availability.

Purchasing and Assembly are reserved modules. Build registration is configuration-based; no New Build wizard is supplied. Remote editing, automatic cloud synchronization, automatic discovery/adoption of custom plates and automatic acceptance are not enabled. Spreadsheet Apps Script controls do not run in Excel.

Excel should be closed during app saves. An interrupted process can leave a lock file; verify the service is stopped before removing a stale lock. The change log is an audit aid, not a tamper-proof ledger. External Excel edits are detected as changed files but are not attributed as app actions. Workbooks, backups, photos and model derivatives are outside Git and should be included in normal file backups.

Follow UAT_CHECKLIST.md for the first real plate → Start → inspection → accepted-parts cycle. Preserve the original export during acceptance.

## Printer monitoring follow-up — October 15, 2026

The H2D authenticated locally in normal/cloud-connected mode on firmware 01.04.00.00. Its certificate chain and serial identity verified with TLS validation enabled. A subscribe-only test received five reports, including RUNNING, the Grill pieces black device job, 44% progress, 152 minutes remaining, layer 45 of 348 and reported temperatures. Those values are a historical test observation, not current status. No printer controls, network-mode changes, or production-workbook updates were issued.

The application now maintains a read-only status subscriber and shows the selected printer's observed job/state/progress/time/layers in the desktop footer, with ten-second display refreshes and stale labels after thirty seconds. Device telemetry remains separate from Excel acceptance. Mobile does not poll the live printer feed. Connection secrets and certificate/provenance files remain local and Git-excluded. Three additional tests cover fragmented/coalesced MQTT frames, invalid/oversized frames, freshness/disconnection labels and omission of credentials from API views; all 15 integration tests pass.

## Acceptance-test corrections — October 15, 2026

Refresh file details now imports saved membership for existing tracked plates in addition to previews. Removed mappings are marked Obsolete, retained mappings keep their IDs/notes, and moved parts gain current-location mappings. Previous job snapshots and accepted totals remain intact. Reconciliation has its own source fingerprint in Build Desk File Imports; a preview fingerprint alone no longer establishes that membership was imported. Source/membership changes invalidate preparation, while a semantically identical refresh preserves it. Unknown objects remain visible for review and block Start. New/custom plates stay untracked.

The current Cabin import has three logical part types on P01, one on P02 and eight on P03, now shared by the tree and parts table. Cab Interior's split objects associate with the original part on both relevant plates; complete-unit copies remain unconfirmed rather than counting fragments as finished parts.

Required and installed quantities can be batch-edited in a plate table with explicit Save quantities/Discard, or in part details beneath Tracked print locations. Accepted quantities continue through print-result history. All-or-nothing validation prevents partial saves of an invalid quantity batch. A Close preparation action returns to table editing while honoring unsaved-change protection.

Success feedback moved into a reserved bottom status-bar area beside printer status, with a close control and fifteen-second expiry. Errors remain dismissible rather than expiring. Tracker saved time and Reload tracker share that quieter area. Reload tracker reads the local workbook; Refresh file details imports the saved 3MF. Tree rows and workbench spacing are more compact on desktop, retaining larger mobile targets.

At the user's request, 95 still-blank required quantities were defaulted to one. Existing specified requirements, wheel/hub/ring requirements of six each, installed counts, all accepted counts and the completed-job history were preserved. The adapter created workbook backups and audit entries for defaults and Cabin reconciliation. The active workbook now intentionally differs from the initial export; the original export remains intact.

All 19 integration tests pass, including batch validation, moved/retired memberships, stale-source rejection, split/disabled objects, untracked candidates, unchanged preparation retention and unknown-only plate visibility. Strict TypeScript and the optimized build pass. Browser checks on a disposable clone verified inline Save, shared values in part details, Save and continue navigation, and timed feedback clearing. Work-area top/height were identical before/after message removal. Production verification confirmed all 101 part requirements match the requested defaults/preserved values, Cabin membership counts of 3/1/8, and unchanged accepted/installed counts and prior jobs.

## Vehicle progress (2026-10-15)
The vehicle overview counts completed part records (accepted quantity meets required quantity), distinct tracked plates with completed runs, files whose tracked plates all have completed runs, and sections whose files all meet that condition. Unconfirmed part quantities and files without tracked plates remain incomplete. Repeated runs count a plate once; manual reprints and unfinished/cancelled jobs do not count as printed plates. These are recorded-history indicators, separate from live printer telemetry and layout preparation.

The truck/title opens About. Tracked print information lives in the header; reference images remain in Vehicle details. Storage type and last saved time appear alongside Reload tracker in the bottom status bar.

## New plates and split quantities (2026-10-15)
Refresh now imports new saved plates automatically, excluding names ending in ignore (case-insensitive). Removing a current plate through this convention retires mappings but preserves job history and accepted counts. Split components have a direct review action and a saved-preparation review indicator. Branch title clicks toggle expansion, including branches already open while another detail is selected. The idle tracked-job header no longer appends an unrelated prior job status; header vertical padding is reduced.

## Completion markers and reload labels (2026-10-15)
Tree entries at Build, Section, 3MF, Plate and Part levels now show acceptance-based completion symbols: green check (all required quantities accepted), yellow dashed circle (partial), empty circle (not complete), and question mark (quantity or part matching review). Rollups use all descendants, independently of the current filter and recorded plate runs. Empty/unmatched branches cannot become complete. Completion filtering now filters part leaves as well as their ancestor paths.

The controls are labeled Reload Tracking Data (workbook) and Reload Print Details (saved 3MF). The desktop status dock is reduced from 98 to 70 pixels and the redundant Vehicle eyebrow is removed.

## Active tracked print and plate review (2026-10-15)
The green printer symbol follows the active tracked job to its nearest visible ancestor as branches collapse or filters hide its descendants. It stops at plate level; the active plate label and header label use matching green bold text. The symbol tooltip names the tracked file/plate. Completion and active-job symbols share a right-aligned decorator group. This indicates workbook job state, independently of printer telemetry.

Plate detail uses a Review Plate button in the heading and below the parts table, both opening the preparation review. Saved/changed review state remains visible in the heading control. Read-only and unsaved quantity safeguards are retained.

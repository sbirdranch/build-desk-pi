# Build Desk

**Raspberry Pi 3 continuation:** this repository is `sbirdranch/build-desk-pi`, derived from the Windows `sbirdranch/build-desk` project with its Git history preserved. The production tracker now runs on the Pi at `192.168.0.119`. On Windows, double-click **Open-Pi-Build-Desk.cmd** or run `node tools/open-pi.mjs --open`; the authenticated SSH tunnel opens **http://127.0.0.1:4176/** with editing enabled. The Pi keeps the Excel workbook, backups and preview caches; source models remain on the existing NAS share, mounted read-only. The original Windows service is stopped and its files are retained. See [Pi deployment, verification and rollback](docs/raspberry-pi.md). An actual reboot test is still pending. The Windows instructions below describe the upstream installation. This fork defaults to loopback listening; direct LAN viewing requires `BUILDDESK_HOST=0.0.0.0`.

Local browser workspace for managing model builds, starting with Kitten 745 print production. Attributed to **IntegratedSA LLC**. The desktop application uses a section → 3MF → plate → part tree, saved plate preparation, print history, explicit acceptance of completed parts, reference photos and rotatable model previews.

## Server controls and local files

Open **http://localhost:4174/** after starting the server. The current Windows application folder (repository root) is:

```text
C:\Users\Preston\.codex\.chatgpt-projects\g-p-6acd1d76509c8191ab0854ee45849623\build-desk
```

Double-click a launcher in that folder, or run its command from PowerShell in the same folder:

| Launcher | Action | PowerShell command |
|---|---|---|
| `Start-Build-Desk.cmd` | Start and open the app | `node tools/start-app.mjs --open` |
| `Stop-Build-Desk.cmd` | Stop the server | `node tools/control-app.mjs stop` |
| `Restart-Build-Desk.cmd` | Restart and open the app | `node tools/start-app.mjs --restart --open` |
| `Status-Build-Desk.cmd` | Show whether it is running | `node tools/control-app.mjs status` |

Start is safe when the app is already running. Closing the browser leaves the server running. The server is manually launched, is not a Windows service, and does not automatically start after reboot or sign-out. You can create desktop shortcuts to these launchers.

All paths below are relative to the application folder above:

| Location | Contents |
|---|---|
| `web/src` | Application source code |
| `web/server.mjs` | Server entry point |
| `tools` | Supporting scripts |
| `local-data/kitten-745/Master Tracker.xlsx` | **Active runtime Excel tracker** |
| `local-data/kitten-745/backups` | Workbook backups |
| `config/builds.json` | Configuration selecting the workbook |
| `local-data/app.log` and `local-data/app.err.log` | Server logs |
| `local-data/app.pid` | Process ID recorded by the launcher |

The workbook is local and does not synchronize with Google Sheets. **Runtime data and workbook backups are Git-excluded**, so back them up separately from source code. **Close Excel before saving through Build Desk.**

## Open the application

Double-click **Start-Build-Desk.cmd** in this folder. It starts the app in the background and opens **http://127.0.0.1:4174/**. Keep this Windows PC running while using it. Node.js 22 or newer is required; the installed development environment uses Node.js 24.

The active workbook is **local-data/kitten-745/Master Tracker.xlsx**. Its complete original Google export is retained in **local-data/kitten-745/backups/Google-export-2026-10-15.xlsx**. The app does not synchronize with Google Sheets and requires no Google account, paid runtime service or database server. Close Excel before saving from the app. Every app save creates a timestamped workbook backup and records an audit entry.

Home-network clients can view last recorded status using this PC's LAN address on port 4174 when Windows networking permits it. Editing and file actions are restricted to the host's loopback address. Phone layouts are for review only. The app is intended for a trusted home network, not Internet publication or a reverse proxy.

See [UAT_CHECKLIST.md](UAT_CHECKLIST.md) for the first real print walk-through and [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) for printing behavior and remaining limits. Read-only H2D monitoring is configured locally. Purchasing now provides a local overview, parts/orders, manual purchases, receipt entry and audited quantity corrections. Its Drive order-update connection still requires host authorization and real end-to-end acceptance; see [Purchasing implementation](docs/purchasing/implementation.md). Assembly remains reserved.

## Printer status

The desktop footer shows printer-reported job, state, progress, estimated remaining time, layers and observation time. These are separate from the tracked production job and accepted quantities. A dropped connection or observations older than thirty seconds are labeled stale. Mobile remains a recorded-information-only view.

The other side of the footer holds action feedback, the workbook's saved time and **Reload Tracking Data**. Success messages disappear after fifteen seconds without shifting the workspace. Reload Tracking Data reads the current Excel record; **Reload Print Details**, on a 3MF or plate, imports the saved 3MF's current membership and previews. Existing tracked plates update together; custom/new plates remain untracked. You can edit required/installed quantities directly in a plate's parts table and commit them with **Save quantities**, or edit the same values under Tracked print locations in the part detail screen. Accepted totals remain driven by print-result history.

Local connection settings are under `local-data/printers/<printer-id>.local.json`, with `host`, `serialNumber`, and `accessCode`. The matching printer ID is registered per Build. Keep this file private; it is Git-excluded and never returned by the app API. A local `bambu-ca.cert` validates the printer certificate chain, and the serial number validates its certificate identity. The current CA's source and checksum are recorded beside it. Restart the app after changing connection settings. The tested H2D uses firmware 01.04.00.00 in normal/cloud-connected mode; no mode change was required. No pause, stop, start, temperature or motion controls are implemented.

## Install, build and verify

```powershell
npm ci --ignore-scripts
npm --prefix web ci --ignore-scripts
npm test
npm --prefix web run typecheck
npm run app:build
npm run app:start
```

After changing application code, rebuild and run `node tools/start-app.mjs --restart`. Logs and the app process ID are under `local-data`. Development mode is `npm run app:dev`; do not run it on the same port as the production app.

Integration tests create disposable workbooks under `web/test-output`, including a clone of the real export when available. They do not add fictional jobs or accepted quantities to the active workbook.

## Add another Build

`config/builds.json` is the small Builds registry. Add a unique ID, display name, active flag, separate workbook, asset root/catalog, model directory, workflow defaults and optional printer identity. Each build loads through the same data-store interface; the initial adapter supports the Master Tracker workbook schema. Builds may reuse part IDs without sharing quantities or history. Assign the same printer ID to builds using the same physical printer to prevent simultaneous tracked starts.

New-build setup is configuration-based; there is no registration wizard yet. A different workbook schema needs an adapter. Models, images and thumbnails are scoped to each build's asset root and load as needed. See [ARCHITECTURE.md](ARCHITECTURE.md) and [plan.md](plan.md).

## What is versioned

Code, application branding, tracker identity mappings, dependency locks and documentation. Original STL/3MF files, derived model assets, local production snapshots, credentials and caches are deliberately Git-excluded. This private repository is not a backup of your model library. Source model rights remain with their original owners. No open-source license is granted to the model library by this repository.

## Generate assets

Use Python 3.12 and Node.js 22 or newer. Install Python requirements in a virtual environment and run:

```powershell
python -m pip install -r requirements.txt
python tools/create_branding.py
powershell -File tools/prepare-inputs.ps1
python tools/generate_assets.py --stl-root local-inputs/stl-current --projects local-inputs/projects --keys config/parts.json --project-manifest config/projects.json
python tools/import_references.py
python tools/verify_assets.py
npm ci --ignore-scripts
npm run preview
```

The original asset review gallery remains separately available on http://127.0.0.1:4173. Choose a part or plate and click **Rotate model**. Drag to rotate, wheel to zoom, right-drag to pan. Both viewers load Three.js locally; no models are uploaded to an external viewer. The gallery only listens on loopback; the application on port 4174 supports home-network viewing.

If Python packages are installed under `.python-packages`, the tools detect that folder. Install into the virtual environment by default; the directory override supports the managed desktop environment used for this delivery. If npm's usual cache is unavailable, use `npm ci --ignore-scripts --cache .npm-cache`.

## Outputs

- `assets/branding/`: realistic RGBA truck mark, dark/light wordmarks, PNG icon sizes, favicon and web manifest.
- `assets/generated/parts/<PartID>/`: 192px WebP thumbnail, 960px WebP preview and simplified GLB.
- `assets/generated/plates/<ProjectID>-P<NN>/`: saved embedded plate image when available, WebP preview/thumbnail, reconstructed display GLB.
- `assets/generated/catalog.json`: stable IDs, source hashes, geometry bounds, source/display face counts, saved enabled states, available slice metadata, explicit exceptions and provenance.
- `assets/generated/contact-sheet-*.jpg`: overview for visual review.
- `assets/generated/verification.json`: integrity checks and output sizes.

STL geometry is treated in the source library's millimeter convention. GLBs use display coordinates in the same scale and are centered for viewing; do not feed them to a slicer. Simplification and static rendering can soften small features; they do not establish print readiness or replace Bambu Studio. Saved plate images can be stale within a 3MF, so the gallery labels their provenance and shows reconstructed geometry separately.

No new required/completed quantities are inferred. Wheel object membership may be ambiguous because the project contains split objects. Unknown part associations remain null rather than guessed. Custom/manual plates discovered in files remain asset candidates; generating a preview does not add them to the production tracker. Opening Bambu and refreshing a registered 3MF are explicit desktop actions. Refresh imports saved metadata and regenerates plate previews with the configured local Python renderer. Missing usable slice estimates display **Not yet sliced**. NAS access uses the Windows account running the app; Build Desk stores no NAS credentials.

See [plan.md](plan.md) for the full interface and workflow decisions, and [ASSET_REPORT.md](ASSET_REPORT.md) for this batch's verified results.

## Application attribution

Build Desk is attributed to **IntegratedSA LLC** in the About dialog. The truck artwork was created with AI-assisted image generation; the committed RGBA master drives all packaged icon sizes and wordmarks. Source model ownership is unchanged.

## Finished-product reference photos

Choose **References** to view the front, passenger-side and rear images provided on the NAS. Full-resolution photos retain original bytes and open in a zoomable dialog with Fit, 100%, and zoom controls. Closing the dialog returns to the same selection. The importer retains embedded ICC profiles in lossless browsing previews, with no color grading or generated substitutions. Originals and previews stay Git-excluded under `assets/generated`; identities and import tools are versioned. Photos are also available in the Vehicle workspace.

## Saved plate naming and refresh
All saved plates are imported by **Reload Print Details**, including newly added plates. To exclude a custom layout, end its saved Bambu Studio plate name with `ignore` (case-insensitive; trailing spaces are allowed). Example: `P09_Custom_reprints_ignore`. Renaming an existing tracked plate this way removes its current mapping on refresh while preserving historical jobs and accepted quantities. Renaming it without the suffix brings it back into tracking on refresh. **Reload Tracking Data** only reloads the workbook; save the 3MF and use **Reload Print Details** to read changed layouts.

For a split STL, use **Review print quantity** → review the layout in Bambu Studio → enter complete units in **Enabled copies** and the total in **Planned quantity** → confirm layout → **Save preparation**. Vehicle required quantity does not confirm a plate's output. Inspection after printing still records actual accepted/rejected quantities.

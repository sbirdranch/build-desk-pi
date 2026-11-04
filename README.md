# Build Desk Pi

Build Desk is a local workshop tracker for model builds. Open **http://192.168.0.119:4174/** on the home network. The Raspberry Pi hosts the application and stores its tracker in SQLite; no cloud account or spreadsheet application is needed. Keep the Pi running. Narrow-screen views are read-only.

## Printing
Browse the build tree, model files, plates and parts. Review a saved plate's contents, prepare its runs and material, and start a tracked job. Printer telemetry is read-only and never credits accepted parts. Finish the job through inspection to record accepted/rejected quantities. Manual reprints credit the original part associations. Model files stay on the NAS; Bambu Studio runs separately on Windows.

## Purchasing
Use one searchable list with All, Not Available, Ordered and Available filters. Select a part to edit stock, Ordered, vendor, product link, date and notes. Designer part identity, description and required quantity are read-only. Save changes explicitly; navigation offers Save, Discard or Stay when a draft is open.

Ordered is your independent marker. Each toggle asks whether to update the order date; keeping the existing date also keeps a blank date blank. Available is calculated from stock meeting the required quantity. Extra stock is allowed. Vendor suggestions are shared across builds; stock and purchasing progress are independent for every build.

The overview shows available-unit and ordered-part-type gauges. Parts Source List and Parts Status export landscape PDFs containing every part in the selected build, regardless of filters. Product links in the source report are clickable. Purchasing is manually maintained: there are no email, Drive, shipment or receipt integrations.

## Printer status and saves
The footer shows the printer's reported job and last observation separately from the recorded tracker state. Reload Tracking Data refreshes the tracker; Reload Print Details imports a saved 3MF's current membership and previews. Save safeguards include revision checks, request replay protection and consistent local backups.

Local runtime data, model files, generated geometry and connection credentials are excluded from Git. Back them up separately. The app is intended for the trusted home LAN; do not expose it to the Internet. Assembly remains reserved.

## Development
Requires Node.js 24. Install dependencies, run tests and typecheck, then build:

```sh
npm ci --ignore-scripts
npm --prefix web ci --ignore-scripts
npm test
npm --prefix web run typecheck
npm run app:build
```

Development uses disposable data under ignored local-data or test-output. See the deployment and implementation documents under docs for operator procedures.

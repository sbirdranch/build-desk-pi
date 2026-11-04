# Raspberry Pi 3 deployment

## Current production datastore — November 4, 2026

Phases 1–4 of Refinement_v2 are deployed, including both independent truck instances and the distinct loader. The authoritative tracker is now **SQLite** at `/home/preston/build-desk/local-data/build-desk-loader-20261104T212844Z.db` (schema 4), selected for all three independent builds by the private `local-data/builds.pi.json` registry (`kind: sqlite`, `schema: build-desk-v2`). The previous one-build and two-build databases remain intact. The original `local-data/kitten-745/Master Tracker.xlsx` remains unchanged and read-only. Existing workbook-specific instructions below describe the earlier Excel deployment. Do not point Excel tools at the SQLite path.

The original truck retains all 29 jobs and 116 accepted units. `kitten-745-instance2` starts with 101 parts, seven independent review projects, 24 plates, 50 Purchasing entries and no production history. Its models are `/mnt/builddesk/BambuProjects/RC_Cat745instance2`; its separate asset root is `local-data/kitten-745-instance2/assets`. Both share `h2d-main`. The overview now keeps only Parts and Plates gauges. See the [second-truck acceptance and rollback record](builds/second-truck-acceptance-2026-11-04.md). `kitten-980-loader` includes both buckets, 88 printed component types, 26 fabricated metal types, seven tracked projects/22 plates, 59 Purchasing entries and three credited references. Its eight review projects (including the untracked window templates) are in `/mnt/builddesk/BambuProjects/RC_Kitten980WheeledLoader`; its separate asset root is `local-data/kitten-980-loader/assets`. Fabricated completion is tracked separately from print jobs and Purchasing. See the [loader acceptance and rollback record](builds/loader-acceptance-2026-11-04.md). The vehicle selector explicitly uses dark backgrounds and light text for native options.

SSH, the user service, Node installation, direct LAN address and NAS mount are unchanged. All tests, migration comparisons, ARM64 build, isolated API writes and backup/restore passed before the controlled cutover. See the [Phase 1 acceptance and rollback record](database/phase1-acceptance-2026-11-04.md) for counts, backup paths, exact checks and rollback safeguards. Purchasing now uses the simplified manual parts tracker, with legacy orders archived. See the [WP-02 deployment and rollback record](purchasing/refinement-v2-acceptance-2026-11-04.md) for current validation and backup paths.


This private continuation of `sbirdranch/build-desk` preserves its Git history and the Windows checkout's source changes as of October 20, 2026. The Windows checkout remains independent. `origin` is `sbirdranch/build-desk-pi`; `upstream` is `sbirdranch/build-desk`. Git is not a backup of the workbook, print history, models, generated assets or credentials.

## Target and current verification

The user's Pi has the reserved LAN address **192.168.0.119**, MAC **B8-27-EB-FD-B9-49**, and login username **preston**. Device inspection confirmed a **Raspberry Pi 3 Model B Plus Rev 1.3**, 64-bit Debian 13 (trixie), `aarch64`, 905 MiB RAM, 904 MiB swap, and about 25 GiB free before installation. The user authorized a dedicated deployment key under ignored `local-data`. No private key belongs in Git.

Windows verification passed: all 50 tests (including a clone-only round trip of the real workbook), TypeScript and the optimized build. Two launcher runs with `--restart` on isolated port 4176 succeeded. Runtime checks returned HTTP 200 for the page, health, build list and a disposable 101-part tracker; a foreign-origin save returned 403. The disposable service was stopped. All 636 checked original runtime files remained unchanged.

The actual Pi subsequently passed 49 synthetic tests plus the separately selected real-workbook clone test, strict TypeScript, an on-device ARM64 production build and API save/backup checks on a disposable workbook. Production was then transferred to the Pi: 150 workbook/backup/purchasing/printer files passed hash verification; the original Windows service is stopped. The live Pi record contains 101 parts, 13 historical jobs and 56 accepted units. All seven NAS model sources are readable and printer telemetry is live. For actual installed paths and service controls, see [Current device installation](#current-device-installation-user-account-production).

Use Raspberry Pi OS Lite **64-bit**, Node.js **22 or 24**, and an SSH-enabled Pi 3. Confirm `uname -m` reports `aarch64` and `node -p process.arch` reports `arm64`. Next's native dependencies must be installed on Linux ARM64; do not copy Windows `node_modules` or `web/.next` to the Pi. Pi 3 B/B+ have limited memory; a 3 A+ has less memory and needs separate capacity testing. This 3 B+ has passed the checks above; an actual reboot and extended load qualification remain pending.

The app continues to use ExcelJS to read/write `.xlsx`; Microsoft Excel is not required on the Pi. Keep the active workbook on local Pi storage, not an SMB share. Only one host may own the production tracker. Model rendering and slicing are separate from production tracking.

## Printing refinement — current code release

Phase 3 removes layout acknowledgement controls while retaining direct preparation validation, reuses the existing overview gauges, and compacts section rows. The database was left in place and every application table fingerprint matched before/after deployment. See the [Phase 3 acceptance and rollback record](printing/phase3-acceptance-2026-11-04.md). Broad styling polish is deferred.

## Alternative system-wide installation

The following `/opt/build-desk` instructions describe an alternative installation. The actual device uses `/home/preston/build-desk` and the user service documented below.

Install the OS, enable SSH, set a hostname such as `builddesk-pi`, and install Git, CA certificates and a supported Node.js distribution. Check `node --version` and `command -v node`. The service template assumes `/usr/bin/node`; adjust it if Node is installed elsewhere. Use a normal administrator account for setup and a dedicated `builddesk` account for the service:

```sh
sudo useradd --system --user-group --home-dir /opt/build-desk --shell /usr/sbin/nologin builddesk
sudo install -d -o "$USER" -g "$USER" /opt/build-desk
git clone https://github.com/sbirdranch/build-desk-pi.git /opt/build-desk
cd /opt/build-desk
npm ci --ignore-scripts
npm --prefix web ci --ignore-scripts
npm test
npm --prefix web run typecheck
npm run app:build
mkdir -p local-data assets/generated
cp config/builds.pi.example.json local-data/builds.pi.json
```

Authenticate the private clone using your own GitHub account. Do not put access tokens into clone URLs or source files. Build with the service stopped. The configuration limits Next build workers to one and enables Webpack memory optimizations. If the Pi runs out of memory, stop and provision temporary swap or build on a more capable Linux ARM64 machine with the same Node major version, copying the resulting release together with its Linux dependencies. A Windows build has not been established as a deployable ARM64 artifact. Do not increase the Node heap beyond available RAM and swap blindly.

Edit the ignored `local-data/builds.pi.json` for the real mount and data locations. Relative workbook/asset paths resolve from `/opt/build-desk`. Linux filenames are case sensitive. The example has no Bambu executable or Python renderer configured. It retains pre-generated previews without claiming that server-side rendering or a Bambu desktop launch is available.

## Transfer production data once, during cutover

First verify setup with a disposable workbook copy. Keep the Windows production application authoritative until the Pi passes acceptance. At cutover, close Excel and stop the Windows app with `node tools/control-app.mjs stop`. Back up its complete `local-data` and `assets/generated` directories separately. Copy them over SSH to the matching Pi directories, preserving the original export, workbook backups, purchasing records and printer CA/provenance. Keep credentials private. Do not copy old `.pid`, `.log`, `.lock`, status snapshots, `node_modules`, `.next`, or temporary renderer files. If a lock exists, investigate it and verify both servers are stopped before excluding it. Do not overwrite `local-data/builds.pi.json` with the Windows registry.

Compare SHA-256 hashes of the transferred workbook and assets with the stopped Windows source. Retain that source backup. Printer configuration files and optional Drive OAuth files remain ignored; inspect them locally for Windows-only paths and redo authorization if required. No credentials are included in this repository. Do not run the two production writers against diverging workbook copies after cutover.

Mount the NAS model directory read-only at `/mnt/builddesk-models`, or copy the saved 3MFs there. A Windows UNC path cannot be used directly on Linux. Use a private root-readable SMB credentials file outside Git if required. Confirm the service account can read the files. If the mount is required, add `RequiresMountsFor=/mnt/builddesk-models` to the service's `[Unit]` section. No mount credentials are supplied by Build Desk.

Bambu Studio stays on Windows. Open/save the same NAS model files manually there. The UI has no Open in Bambu action or executable-launch configuration; open the NAS projects directly in Windows Bambu Studio. Reload Print Details can import saved metadata, but regenerated 3D previews require a configured compatible Python renderer. Large 3MF parsing/rendering has not been memory-qualified on Pi 3. Retain the transferred previews and defer rendering to the Windows workflow until tested. Do not infer accepted quantities from printer status or preview refreshes.

## Install the service

After transferring and checking data:

```sh
cd /opt/build-desk
sudo chown -R builddesk:builddesk /opt/build-desk
sudo chmod -R go-rwx local-data
sudo install -m 644 deploy/build-desk.service /etc/systemd/system/build-desk.service
sudo systemctl daemon-reload
sudo systemctl enable --now build-desk
sudo systemctl status build-desk
curl --fail http://127.0.0.1:4174/api/health
journalctl -u build-desk -n 50 --no-pager
```

The foreground service starts `web/server.mjs` directly; systemd owns its PID and logs. Use `sudo systemctl restart build-desk` for production service restarts. Do not also run the detached launcher while the systemd service is active. For a manual installation instead, set `BUILDDESK_REGISTRY` to the absolute Pi registry path and run `node tools/start-app.mjs --restart`. The launchers support `PORT` for isolated validation; their default remains 4174. The 512 MiB service heap is an initial limit, not a measured capacity guarantee.

## Direct HTTP access from the home network

Open **http://192.168.0.119:4174/** directly. This replaces the initial SSH-tunnel access on localhost port 4176. No tunnel or client key is required for browsing or editing. The optional Windows launcher now checks the direct health endpoint and opens this address; it does not start SSH.

The deployed systemd unit sets:

```ini
Environment=BUILDDESK_HOST=0.0.0.0
Environment=BUILDDESK_LAN_SUBNET=192.168.0.0/24
Environment=BUILDDESK_LAN_HOSTS=192.168.0.119:4174
```

The server derives editing eligibility from the actual socket address and configured Host allowlist. Loopback still works for local controls. The explicit LAN policy allows editing only from the configured subnet using the configured site address. Clients cannot grant themselves access with forwarded or internal headers. The process edit token and same-origin save checks remain in force. Archived builds and narrow-screen layouts retain their existing read-only behavior. Without the LAN settings, the code keeps its original loopback-only editing default. No router port forwarding was added.

## Acceptance and rollback

Automated disposable-workbook workflows, a Pi API save/backup, Windows tunnel access, NAS readability, asset integrity and live printer TLS connectivity have passed. An actual reboot, extended load tests and the next physical plate workflow remain acceptance steps. Watch the service logs and `free -h` during workbook saves and model refreshes.

For rollback, stop the Pi service first. If no production writes occurred, resume the preserved Windows tracker. If the Pi has accepted production changes, back up and transfer its latest workbook, backups and purchasing state to the stopped Windows installation before resuming; never overwrite newer production history with the old snapshot. Keep the original immutable export.

References: [Raspberry Pi OS architecture](https://www.raspberrypi.com/documentation/computers/os.html), [Next.js memory usage](https://nextjs.org/docs/app/guides/memory-usage).

## Current device installation: user account, production

The actual Pi uses a user-owned installation because sudo requires local password entry:

| Item | Location |
|---|---|
| Application | `/home/preston/build-desk` |
| Node.js 24.22.0 ARM64 | `/home/preston/.local/node/bin/node` |
| Runtime registry | `/home/preston/build-desk/local-data/builds.pi.json` |
| Active production tracker | `/home/preston/build-desk/local-data/build-desk-refinement2-20261104T175420Z.db` |
| Preserved pre-SQLite tracker | `/home/preston/build-desk/local-data/kitten-745/Master Tracker.xlsx` (read-only) |
| Workbook backups/original export | `/home/preston/build-desk/local-data/kitten-745/backups` |
| Generated assets | `/home/preston/build-desk/assets/generated` |
| Existing NAS model files | `/mnt/builddesk/BambuProjects/RC_DumpTruck` |
| User unit | `/home/preston/.config/systemd/user/build-desk.service` |
| User unit template | `deploy/build-desk-user.service` |
| Runtime logs | `/home/preston/build-desk/local-data/service.log`, `service.err.log` |

Node's official ARM64 download was checked against its published SHA-256 manifest. Source arrived through `git archive` and SSH, so no GitHub token was installed on the Pi. All 455 transferred generated assets matched the Windows hash manifest. The production workbook SHA-256 at cutover is `153b5352cdc375c8c42898012cd38f3942d3cbf956255ee17aa370c00364487a`, identical to the preserved Windows record. The registry now uses `active: true` and the production workbook path. Workbook backups, purchasing state and printer configuration/CA were copied and verified before startup. The original Windows app is stopped, and its files and uncommitted source changes remain intact. A separate pre-cutover workbook copy is retained in the Windows fork's ignored `local-data/migration-backup/Windows-final-tracker.xlsx`.

NAS source files were not copied or moved. The existing `//IBFNAS.local/Preston` share is mounted at `/mnt/builddesk` using enabled `mnt-builddesk.automount`; its CIFS mount is read-only with `nosuid,nodev,noexec`. Root unit templates are in `deploy/nas`. The user entered NAS credentials locally using `tools/configure-pi-nas.sh`; they reside in mode-600 ignored `local-data/nas.credentials`. A user-service pre-start check triggers the automount and waits for the model directory, with automatic retries if it is unavailable. Preview caches remain local on the Pi. Windows Bambu Studio continues to use its existing mapped drive/NAS paths.

Use `systemctl --user status build-desk` and `systemctl --user restart build-desk` after logging in as `preston`. Logs are `local-data/service.log` and `local-data/service.err.log`; the Pi's user journal was unavailable during setup. The unit is enabled under the user's `default.target`. The user ran `sudo loginctl enable-linger preston`, and `loginctl show-user preston -p Linger` returned `Linger=yes`. This configures service startup at boot without login. The NAS automount is also enabled for boot. Reboot acceptance still requires an actual reboot.

For ordinary access, bookmark **http://192.168.0.119:4174/** on any home-network device. Double-clicking the optional Desktop `Open-Pi-Build-Desk.cmd` or running `node tools/open-pi.mjs --open` checks the Pi and opens the same direct address. There is no SSH tunnel to start or maintain. The old Windows app on port 4174 remains stopped; the Pi's IP address distinguishes this service from Windows localhost.

SSH keys remain in ignored storage for administration. Windows user commands use `local-data/pi-user-key`; the agent has its separate sandbox-owned deployment key. The old localhost tunnel is no longer needed for this application.

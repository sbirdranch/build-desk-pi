# Raspberry Pi 3 deployment

This private continuation of `sbirdranch/build-desk` preserves its Git history and the Windows checkout's source changes as of October 20, 2026. The Windows checkout remains independent. `origin` is `sbirdranch/build-desk-pi`; `upstream` is `sbirdranch/build-desk`. Git is not a backup of the workbook, print history, models, generated assets or credentials.

## Target and current verification

The user's Pi has the reserved LAN address **192.168.0.119**, MAC **B8-27-EB-FD-B9-49**, and login username **preston**. On October 20, 2026 its SSH port responded with an OpenSSH Debian banner. Installed OS architecture and hardware model still need to be verified; SSH reachability alone does not establish those facts. Initial key authentication was unavailable; a dedicated deployment key was generated under ignored `local-data` for one-time local authorization. No private key belongs in Git.

Windows verification passed: all 50 tests (including a clone-only round trip of the real workbook), TypeScript and the optimized build. Two launcher runs with `--restart` on isolated port 4176 succeeded. Runtime checks returned HTTP 200 for the page, health, build list and a disposable 101-part tracker; a foreign-origin save returned 403. The disposable service was stopped. Hashes of all 636 checked original runtime files remained unchanged, and the original Windows service stayed running on port 4174. These checks do not substitute for ARM64/Pi acceptance.

Use Raspberry Pi OS Lite **64-bit**, Node.js **22 or 24**, and an SSH-enabled Pi 3. Confirm `uname -m` reports `aarch64` and `node -p process.arch` reports `arm64`. Next's native dependencies must be installed on Linux ARM64; do not copy Windows `node_modules` or `web/.next` to the Pi. Pi 3 B/B+ have limited memory; a 3 A+ has less memory and needs separate capacity testing. Hardware deployment, memory consumption, NAS mounts and reboot recovery still require verification on the actual Pi.

The app continues to use ExcelJS to read/write `.xlsx`; Microsoft Excel is not required on the Pi. Keep the active workbook on local Pi storage, not an SMB share. Only one host may own the production tracker. Model rendering and slicing are separate from production tracking.

## Prepare the installation

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

Bambu Studio stays on Windows. Open/save the same NAS model files manually there. The Pi cannot launch Windows Bambu Studio from the browser; the existing Open in Bambu action reports that no executable is configured. Reload Print Details can import saved metadata, but regenerated 3D previews require a configured compatible Python renderer. Large 3MF parsing/rendering has not been memory-qualified on Pi 3. Retain the transferred previews and defer rendering to the Windows workflow until tested. Do not infer accepted quantities from printer status or preview refreshes.

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

## Edit from Windows using SSH

The Pi fork defaults to listening on loopback. In Windows PowerShell, keep this command running, replacing `pi-admin` with your SSH login:

```powershell
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:4176:127.0.0.1:4174 preston@192.168.0.119
```

Open **http://127.0.0.1:4176/** in the Windows browser. Local port 4176 avoids conflicting with the original Windows app on 4174. SSH authenticates the user and encrypts traffic; the Pi sees a loopback socket, so existing edit tokens and same-origin checks continue to apply. Forwarded client headers still cannot grant editing. Keep the tunnel terminal open. Confirm the Pi hostname and SSH host key during initial setup. Direct LAN access is disabled by default; setting `BUILDDESK_HOST=0.0.0.0` enables the existing read-only LAN view, not remote editing. Do not expose the app or an unauthenticated reverse proxy to the Internet.

## Acceptance and rollback

Before production cutover, use a disposable tracker to verify Save preparation, Start, finish, inspection, accepted counts, duplicate submission handling, backup creation and file permissions through the Windows tunnel. Verify printer TLS connectivity separately and check all desired reference images and model previews. Reboot the Pi and verify service recovery and NAS availability. Watch `systemctl status`, `journalctl` and `free -h` during workbook saves and model refreshes. These hardware checks are still pending.

For rollback, stop the Pi service first. If no production writes occurred, resume the preserved Windows tracker. If the Pi has accepted production changes, back up and transfer its latest workbook, backups and purchasing state to the stopped Windows installation before resuming; never overwrite newer production history with the old snapshot. Keep the original immutable export.

References: [Raspberry Pi OS architecture](https://www.raspberrypi.com/documentation/computers/os.html), [Next.js memory usage](https://nextjs.org/docs/app/guides/memory-usage).

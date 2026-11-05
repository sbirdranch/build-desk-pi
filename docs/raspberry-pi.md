# Raspberry Pi operations

For current application behavior, installation, database setup, model import,
configuration, storage and outstanding issues, use the [Pi deployment guide](../README.md).
This page records the installed device's operational locations. The private runtime
registry is authoritative for database and asset paths.

| Item | Installed location / value |
|---|---|
| Device | Raspberry Pi 3 Model B Plus, 64-bit Debian 13, ARM64 |
| Application | `/home/preston/build-desk` |
| Node | `/home/preston/.local/node/bin/node` (Node 24 ARM64) |
| LAN URL | `http://192.168.0.119:4174/` |
| Registry | `/home/preston/build-desk/local-data/builds.pi.json` |
| Database | Registry-selected local SQLite file, schema 5 |
| Builds | Kitten 745; Kitten 980 Loader |
| Shared printer | `h2d-main` |
| Main generated assets | `/home/preston/build-desk/assets/generated` |
| Loader assets | `/home/preston/build-desk/local-data/kitten-980-loader/assets` |
| Truck models | `/mnt/builddesk/BambuProjects/RC_DumpTruck` |
| Loader models | `/mnt/builddesk/BambuProjects/RC_Kitten980WheeledLoader` |
| User unit | `/home/preston/.config/systemd/user/build-desk.service` |
| Template | `deploy/build-desk-user.service` |
| Logs | `local-data/service.log`, `local-data/service.err.log` |

The NAS share is mounted read-only at `/mnt/builddesk` through
`mnt-builddesk.automount`. Credentials remain private in ignored local storage.
The installed user unit includes a NAS pre-start readiness check. Linger was enabled
for the service user; actual reboot acceptance remains outstanding in the record.

Log in as `preston` for service controls:

```sh
cd /home/preston/build-desk
systemctl --user status build-desk --no-pager
systemctl --user restart build-desk
curl --fail http://127.0.0.1:4174/api/health
loginctl show-user preston -p Linger
```

The installed unit allows LAN editing using `BUILDDESK_HOST=0.0.0.0`,
`BUILDDESK_LAN_SUBNET=192.168.0.0/24` and
`BUILDDESK_LAN_HOSTS=192.168.0.119:4174`. Review all three when changing the LAN.
The optional client launcher opens the direct LAN URL; no SSH tunnel is needed.
Do not run a detached app launcher alongside systemd.

The application writes SQLite, not the preserved legacy workbook. Keep backups of
the registry, a consistent SQLite snapshot, assets, printer configuration and NAS
projects outside Git. Backups must include committed WAL contents; use the online
backup API or stop the service before a cold copy. Rollback must preserve any newer
production edits and pair code with a compatible database schema.

The current verified recovery snapshot is `local-data/current-backup-1.0.0`: it contains
`tracking.db`, the registry, configuration, printer files, per-build asset copies and a
SHA-256 manifest. Previous release rollback folders, obsolete databases and deployment
stages have been removed. Rollback paths in dated acceptance records are no longer
available. Use the current snapshot and a schema-compatible Git revision for recovery.

Acceptance records below are evidence for specific deployments, not current setup
recipes. Their dated database filenames, schema assumptions and historical workbook
instructions must not be reused blindly:

- [SQLite acceptance](database/phase1-acceptance-2026-11-04.md)
- [Purchasing acceptance](purchasing/refinement-v2-acceptance-2026-11-04.md)
- [Printing acceptance](printing/phase3-acceptance-2026-11-04.md)
- [Loader acceptance](builds/loader-acceptance-2026-11-04.md)
- [Truck retirement and loader requirement defaults](builds/test-truck-retirement-2026-11-04.md)
- [Schema-5 Purchasing acceptance and rollback](purchasing/ui-refinements-acceptance-2026-11-05.md)

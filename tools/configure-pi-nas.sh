#!/bin/bash
# Run interactively over SSH as preston. Passwords are entered on that terminal.
set -euo pipefail
umask 077
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$USER" != preston || "$app_root" != /home/preston/build-desk ]]; then
  echo 'This site-specific setup expects preston and /home/preston/build-desk.' >&2
  exit 1
fi
if [[ ! -x /sbin/mount.cifs && ! -x /usr/sbin/mount.cifs ]]; then
  echo 'Install cifs-utils before running this setup.' >&2
  exit 1
fi
mkdir -p "$app_root/local-data"
chmod 700 "$app_root/local-data"
credential_file="$app_root/local-data/nas.credentials"
if [[ ! -s "$credential_file" ]]; then
  read -r -p 'NAS username (not necessarily the Pi username): ' nas_user
  [[ -n "$nas_user" ]] || { echo 'A NAS username is required.' >&2; exit 1; }
  read -r -s -p 'NAS password (hidden): ' nas_password
  printf '\n'
  temporary_file="$(mktemp "$app_root/local-data/nas.credentials.XXXXXX")"
  printf 'username=%s\npassword=%s\n' "$nas_user" "$nas_password" > "$temporary_file"
  unset nas_password
  chmod 600 "$temporary_file"
  mv -- "$temporary_file" "$credential_file"
fi
chmod 600 "$credential_file"
echo 'Installing a read-only mount of the existing //IBFNAS.local/Preston share.'
sudo install -d -m 755 /mnt/builddesk
sudo install -m 644 "$app_root/deploy/nas/mnt-builddesk.mount" /etc/systemd/system/mnt-builddesk.mount
sudo install -m 644 "$app_root/deploy/nas/mnt-builddesk.automount" /etc/systemd/system/mnt-builddesk.automount
sudo systemctl daemon-reload
sudo systemctl enable --now mnt-builddesk.automount
model_dir=/mnt/builddesk/BambuProjects/RC_DumpTruck
if ! test -d "$model_dir" || ! test -r "$model_dir"; then
  echo 'NAS mount or permissions failed. Check systemctl status mnt-builddesk.mount.' >&2
  exit 1
fi
python3 - "$app_root/local-data/builds.pi.json" "$model_dir" <<'PY'
import json,pathlib,sys
file=pathlib.Path(sys.argv[1]); data=json.loads(file.read_text())
for build in data['builds']:
    if build['id']=='kitten-745': build['models']['directory']=sys.argv[2]
temporary=file.with_suffix('.tmp'); temporary.write_text(json.dumps(data,indent=2)); temporary.chmod(0o600); temporary.replace(file)
PY
mkdir -p "$HOME/.config/systemd/user/build-desk.service.d"
cat > "$HOME/.config/systemd/user/build-desk.service.d/nas.conf" <<'UNIT'
[Service]
ExecStartPre=/usr/bin/test -d /mnt/builddesk/BambuProjects/RC_DumpTruck
UNIT
systemctl --user daemon-reload
systemctl --user restart build-desk
echo 'NAS model files remain in their original location; the Pi mount is read-only.'
echo 'Generated preview caches and the staging tracker remain on the Pi.'
echo 'Production is still on Windows until cutover.'

#!/usr/bin/env bash
# Authorized operational repair: only the duplicate root haoyouji-web and its unit.
# No database commands, application deployment, release deletion, or server reboot.
set -Eeuo pipefail
umask 077
APP=/home/ubuntu/haoyouji-web
OLD=/root/haoyouji-web
EXPECTED=6cb774158d6c106253e5fbea66108cf0774c7787
PM2=/usr/lib/node_modules/pm2/bin/pm2
SITE=/etc/nginx/sites-available/haoyouji
ENABLED=/etc/nginx/sites-enabled/haoyouji
ROOT_CHANGED=0
UBUNTU_CHANGED=0
NGINX_CHANGED=0
SUCCESS=0

[ "$(id -u)" = 0 ] || { echo 'Root privileges required.' >&2; exit 1; }
[ -x "$PM2" ] || { echo 'Expected PM2 executable missing.' >&2; exit 1; }
[ "$(readlink -f "$APP/dist")" = "$APP/releases/$EXPECTED" ] || { echo 'Release link changed; refusing repair.' >&2; exit 1; }
[ "$(cat "$APP/dist/.deployed-commit")" = "$EXPECTED" ] || { echo 'Release commit mismatch.' >&2; exit 1; }
for path in "$APP/dist/index.js" "$APP/dist/public/index.html" "$APP/ecosystem.config.cjs" "$APP/nginx.conf" "$SITE"; do
  [ -f "$path" ] || { echo 'Required operational file missing.' >&2; exit 1; }
done
[ -f /etc/systemd/system/pm2-root.service ] || { echo 'Expected duplicate startup unit missing.' >&2; exit 1; }
[ -f /etc/systemd/system/pm2-ubuntu.service ] || { echo 'Expected primary startup unit missing.' >&2; exit 1; }
nginx -t >/dev/null 2>&1 || { echo 'Existing Nginx configuration invalid; refusing changes.' >&2; exit 1; }
[ "$(systemctl is-enabled pm2-ubuntu.service)" = enabled ] || { echo 'Primary startup state changed; refusing repair.' >&2; exit 1; }
systemctl is-active --quiet pm2-ubuntu.service || { echo 'Primary manager inactive; refusing repair.' >&2; exit 1; }

mkdir -p "$APP/ops-backups"
BACKUP="$(mktemp -d "$APP/ops-backups/pm2-primary-20261106.XXXXXX")"
chmod 700 "$BACKUP"
root_pm2() { env HOME=/root PM2_HOME=/root/.pm2 "$PM2" "$@"; }
ubuntu_pm2() { sudo -u ubuntu env HOME=/home/ubuntu PM2_HOME=/home/ubuntu/.pm2 "$PM2" "$@"; }

# The daemon must already exist: do not create a new root daemon for inspection.
ROOT_PID="$(cat /root/.pm2/pm2.pid)"
kill -0 "$ROOT_PID" 2>/dev/null || { echo 'Duplicate daemon state changed; refusing repair.' >&2; exit 1; }
root_pm2 jlist > "$BACKUP/root-current.json" 2> "$BACKUP/root-inspection.log"
python3 - "$BACKUP/root-current.json" <<'PY'
import json,sys
apps=json.load(open(sys.argv[1]))
assert len(apps)==1, 'Unexpected root-managed apps; no service changes allowed.'
e=apps[0].get('pm2_env',{})
assert e.get('name')=='haoyouji-web', 'Unexpected root application name.'
assert e.get('pm_cwd')=='/root/haoyouji-web', 'Unexpected root working directory.'
assert e.get('pm_exec_path')=='/root/haoyouji-web/dist/index.js', 'Unexpected root script.'
print('Preflight: duplicate manager contains only the explicitly authorized old project.')
PY
UBUNTU_PID="$(cat /home/ubuntu/.pm2/pm2.pid)"
kill -0 "$UBUNTU_PID" 2>/dev/null || { echo 'Primary daemon state changed; refusing repair.' >&2; exit 1; }
ubuntu_pm2 jlist > "$BACKUP/ubuntu-current.json" 2> "$BACKUP/ubuntu-inspection.log"
python3 - "$BACKUP/ubuntu-current.json" <<'PY'
import json,sys
apps=json.load(open(sys.argv[1]))
primary=[a for a in apps if a.get('pm2_env',{}).get('name')=='haoyouji-web']
assert len(primary)==1, 'Unexpected primary application count.'
e=primary[0]['pm2_env']
assert e.get('pm_cwd')=='/home/ubuntu/haoyouji-web', 'Unexpected primary working directory.'
assert e.get('pm_exec_path')=='/home/ubuntu/haoyouji-web/dist/index.js', 'Unexpected primary script.'
print('Preflight: only the explicitly selected ubuntu application will be restarted.')
PY
python3 - "$APP/ecosystem.config.cjs" "$APP/nginx.conf" <<'PY'
import pathlib,re,sys
config=pathlib.Path(sys.argv[1]).read_text()
assert re.search(r'cwd\s*:\s*[\"\']/home/ubuntu/haoyouji-web[\"\']',config), 'Unexpected primary cwd.'
assert re.search(r'script\s*:\s*[\"\'](?:\./dist/index\.js|/home/ubuntu/haoyouji-web/dist/index\.js)[\"\']',config), 'Unexpected primary script.'
assert re.search(r'PORT\s*:\s*[\"\']?3000[\"\']?\s*[,}\n]',config), 'Unexpected primary port.'
nginx=pathlib.Path(sys.argv[2]).read_text()
assert 'server_name jiangyuchen.cn www.jiangyuchen.cn;' in nginx, 'Unexpected site domain.'
targets=re.findall(r'proxy_pass\s+([^;]+);',nginx)
assert targets and all(t.strip()=='http://127.0.0.1:3000' for t in targets), 'Unexpected proxy target.'
print('Preflight: primary configuration points to the stable latest release and port 3000.')
PY
cp -a "$SITE" "$BACKUP/nginx-site"
ENABLED_EXISTED=0
if [ -e "$ENABLED" ] || [ -L "$ENABLED" ]; then
  ENABLED_EXISTED=1
  cp -a "$ENABLED" "$BACKUP/nginx-enabled"
fi
for p in /root/.pm2/dump.pm2 /root/.pm2/dump.pm2.bak /home/ubuntu/.pm2/dump.pm2 /home/ubuntu/.pm2/dump.pm2.bak; do
  [ ! -f "$p" ] || cp -a "$p" "$BACKUP/$(echo "$p" | tr / _)"
done
cp -a "$APP/ecosystem.config.cjs" "$BACKUP/ubuntu-ecosystem.config.cjs"
cp -a /etc/systemd/system/pm2-root.service "$BACKUP/pm2-root.service"
systemctl is-enabled pm2-root.service > "$BACKUP/root-unit-state" || true
systemctl is-enabled pm2-ubuntu.service > "$BACKUP/ubuntu-unit-state" || true

rollback() {
  local rc="$?"
  if [ "$rc" -eq 0 ]; then rc=1; fi
  trap - ERR INT TERM HUP
  set +e
  echo 'Repair did not finish; restoring prior operational configuration. No database operations performed.' >&2
  if [ "$UBUNTU_CHANGED" = 1 ]; then ubuntu_pm2 stop haoyouji-web > "$BACKUP/rollback-ubuntu-stop.log" 2>&1; fi
  if [ "$NGINX_CHANGED" = 1 ]; then
    cp -a "$BACKUP/nginx-site" "$SITE"
    rm -f "$ENABLED"
    if [ "$ENABLED_EXISTED" = 1 ]; then cp -a "$BACKUP/nginx-enabled" "$ENABLED"; fi
  fi
  if [ "$ROOT_CHANGED" = 1 ]; then
    for p in /root/.pm2/dump.pm2 /root/.pm2/dump.pm2.bak; do
      b="$BACKUP/$(echo "$p" | tr / _)"
      [ ! -f "$b" ] || cp -a "$b" "$p"
    done
    if grep -qx enabled "$BACKUP/root-unit-state"; then systemctl enable pm2-root.service >/dev/null 2>&1; fi
    systemctl restart pm2-root.service > "$BACKUP/rollback-root-unit.log" 2>&1
  fi
  if [ "$UBUNTU_CHANGED" = 1 ]; then
    ubuntu_pm2 restart "$APP/ecosystem.config.cjs" --only haoyouji-web --update-env > "$BACKUP/rollback-ubuntu-restart.log" 2>&1
    for p in /home/ubuntu/.pm2/dump.pm2 /home/ubuntu/.pm2/dump.pm2.bak; do
      b="$BACKUP/$(echo "$p" | tr / _)"
      [ ! -f "$b" ] || cp -a "$b" "$p"
    done
  fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  echo "Private rollback backup retained at: $BACKUP" >&2
  exit "${rc:-1}"
}
trap rollback ERR INT TERM HUP

echo 'Stage 1: validate and stage the canonical Nginx site.'
NGINX_CHANGED=1
install -m 644 "$APP/nginx.conf" "$SITE"
rm -f "$ENABLED"
ln -s "$SITE" "$ENABLED"
nginx -t > "$BACKUP/nginx-validation.log" 2>&1

echo 'Stage 2: close only the old root project, clear its saved resurrection entry, and disable its duplicate startup unit.'
ROOT_CHANGED=1
root_pm2 delete haoyouji-web > "$BACKUP/root-delete.log" 2>&1
root_pm2 jlist > "$BACKUP/root-after.json" 2> "$BACKUP/root-after-inspection.log"
python3 - "$BACKUP/root-after.json" <<'PY'
import json,sys
assert json.load(open(sys.argv[1]))==[], 'Root manager unexpectedly contains other applications; refuse stopping its unit.'
PY
root_pm2 save --force > "$BACKUP/root-save.log" 2>&1
# The old backup was preserved in the private repair backup directory above.
# Keep both default resurrection snapshots empty so fallback cannot revive it.
printf '[]\n' > /root/.pm2/dump.pm2.bak
systemctl disable --now pm2-root.service > "$BACKUP/root-disable.log" 2>&1

echo 'Stage 3: restart the existing ubuntu primary application on the now-free port 3000.'
UBUNTU_CHANGED=1
ubuntu_pm2 restart "$APP/ecosystem.config.cjs" --only haoyouji-web --update-env > "$BACKUP/ubuntu-restart.log" 2>&1
READY=0
for attempt in $(seq 1 16); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/ -o "$BACKUP/primary-local.html" \
      && cmp -s "$APP/dist/public/index.html" "$BACKUP/primary-local.html"; then READY=1; break; fi
  sleep 2
done
[ "$READY" = 1 ] || { echo 'Port 3000 did not return the exact latest entry HTML.' >&2; false; }
ss -H -ltnp '( sport = :3000 )' > "$BACKUP/port3000-owner.txt"
python3 - "$BACKUP/port3000-owner.txt" <<'PY'
import os,pwd,re,sys
owners={int(p) for p in re.findall(r'pid=(\d+)',open(sys.argv[1]).read())}
assert owners, 'Port 3000 owner could not be verified.'
expected_uid=pwd.getpwnam('ubuntu').pw_uid
assert all(os.stat('/proc/'+str(p)).st_uid==expected_uid for p in owners), 'Port 3000 is not exclusively owned by ubuntu.'
print('Verified: port 3000 is owned by the primary ubuntu manager.')
PY
ubuntu_pm2 save > "$BACKUP/ubuntu-save.log" 2>&1
systemctl enable pm2-ubuntu.service > "$BACKUP/ubuntu-enable.log" 2>&1
systemctl is-active --quiet pm2-ubuntu.service

echo 'Stage 4: reload validated Nginx and verify the canonical HTTPS entry and anonymous API.'
systemctl reload nginx
curl -fsS --max-time 10 --resolve jiangyuchen.cn:443:127.0.0.1 https://jiangyuchen.cn/ -o "$BACKUP/primary-https.html"
cmp -s "$APP/dist/public/index.html" "$BACKUP/primary-https.html"
curl -fsS --max-time 10 'http://127.0.0.1:3000/api/trpc/auth.me?input=%7B%22json%22%3Anull%7D' -o "$BACKUP/anonymous-auth.json"
python3 - "$BACKUP/anonymous-auth.json" <<'PY'
import json,sys
result=json.load(open(sys.argv[1]))
assert isinstance(result,dict) and 'result' in result, 'Anonymous API did not return the expected tRPC response.'
PY
python3 - /root/.pm2/dump.pm2 /home/ubuntu/.pm2/dump.pm2 "$APP/dist/public/index.html" <<'PY'
import json,pathlib,re,sys
assert json.load(open(sys.argv[1]))==[], 'Old root resurrection entry was not cleared.'
apps=json.load(open(sys.argv[2])); primary=[a for a in apps if a.get('name',a.get('pm2_env',{}).get('name'))=='haoyouji-web']
assert len(primary)==1, 'Primary saved app mismatch.'
e=primary[0].get('pm2_env',primary[0])
assert e.get('pm_cwd')=='/home/ubuntu/haoyouji-web', 'Saved primary cwd mismatch.'
assert e.get('pm_exec_path')=='/home/ubuntu/haoyouji-web/dist/index.js', 'Saved primary script mismatch.'
html=pathlib.Path(sys.argv[3]).read_text()
print('Verified latest entry assets:', ', '.join(re.findall(r'(?:src|href)=[\"\'](/assets/[^\"\']+\.(?:js|css))[\"\']',html)))
print('Verified: old root saved app list empty; primary saved paths correct; local and HTTPS HTML match latest release.')
PY
if systemctl is-enabled --quiet pm2-root.service; then echo 'Duplicate startup remains enabled.' >&2; false; fi
if systemctl is-active --quiet pm2-root.service; then echo 'Duplicate startup remains active.' >&2; false; fi
trap - ERR INT TERM HUP
SUCCESS=1
echo "REPAIR_SUCCESS expected_commit=$EXPECTED private_backup=$BACKUP"

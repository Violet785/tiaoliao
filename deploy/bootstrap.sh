#!/usr/bin/env bash
set -Eeuo pipefail
trap 'printf "DEPLOY_FAILED line=%s\n" "$LINENO"' ERR

archive=${1:?Usage: bootstrap.sh ARCHIVE SHA256 RELEASE_ID}
archive_sha=${2:?Missing archive SHA256}
release_id=${3:?Missing release ID}
[[ "$release_id" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
[[ "$archive_sha" =~ ^[a-fA-F0-9]{64}$ ]] || exit 2
printf '%s  %s\n' "$archive_sha" "$archive" | sha256sum -c -

app_root=/opt/tiaoliao
release="$app_root/releases/$release_id"
node_version=24.18.0
node_name="node-v$node_version-linux-x64"
node_root="$app_root/$node_name"
db_file=/var/lib/tiaoliao/tiaoliao.db
export DEBIAN_FRONTEND=noninteractive

apt-get -o DPkg::Lock::Timeout=180 update
apt-get -o DPkg::Lock::Timeout=180 install -y nginx ca-certificates xz-utils
install -d -m 0755 "$app_root" "$app_root/downloads" "$app_root/releases"

if [[ ! -x "$node_root/bin/node" ]]; then
    cd "$app_root/downloads"
    curl -fsSL --retry 2 --connect-timeout 15 --max-time 180 \
        "https://nodejs.org/dist/v$node_version/$node_name.tar.xz" -o "$node_name.tar.xz"
    curl -fsSL --retry 2 --connect-timeout 15 --max-time 60 \
        "https://nodejs.org/dist/v$node_version/SHASUMS256.txt" -o SHASUMS256.txt
    grep " $node_name.tar.xz$" SHASUMS256.txt | sha256sum -c -
    tar -xJf "$node_name.tar.xz" -C "$app_root"
fi
ln -sfn "$node_root" "$app_root/node"
export PATH="$app_root/node/bin:$PATH"
node --version
npm --version

# 每次发布使用新目录，数据库留在独立路径，更新代码不会覆盖用户数据。
mkdir "$release"
tar -xzf "$archive" -C "$release"
cd "$release/server"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    --fetch-retries=2 --fetch-timeout=60000 --registry=https://registry.npmmirror.com

if ! id tiaoliao >/dev/null 2>&1; then
    useradd --system --home-dir /var/lib/tiaoliao --shell /usr/sbin/nologin tiaoliao
fi
install -d -o tiaoliao -g tiaoliao -m 0750 /var/lib/tiaoliao
fresh_db=0
if [[ ! -s "$db_file" ]]; then
    fresh_db=1
else
    # SQLite 在线备份会包含 WAL 中已提交的数据，不能直接复制主数据库文件。
    runuser -u tiaoliao -- env DB_PATH="$db_file" BACKUP_PATH="/var/lib/tiaoliao/before-$release_id.db" \
        node --disable-warning=ExperimentalWarning --input-type=module -e \
        'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync(process.env.DB_PATH); db.prepare("VACUUM INTO ?").run(process.env.BACKUP_PATH); db.close();'
fi
runuser -u tiaoliao -- env NODE_ENV=production DB_PATH="$db_file" \
    node --disable-warning=ExperimentalWarning src/db/migrate.js
runuser -u tiaoliao -- env NODE_ENV=production DB_PATH="$db_file" \
    node --disable-warning=ExperimentalWarning src/seed/run.js
if [[ "$fresh_db" == 1 ]]; then
    runuser -u tiaoliao -- env NODE_ENV=production DB_PATH="$db_file" \
        node --disable-warning=ExperimentalWarning src/seed/demo.js
fi

install -m 0644 "$release/deploy/tiaoliao.service" /etc/systemd/system/tiaoliao.service
install -m 0644 "$release/deploy/nginx.conf" /etc/nginx/sites-available/tiaoliao
ln -sfn /etc/nginx/sites-available/tiaoliao /etc/nginx/sites-enabled/tiaoliao
if [[ -L /etc/nginx/sites-enabled/default ]] && \
    [[ "$(readlink -f /etc/nginx/sites-enabled/default)" == /etc/nginx/sites-available/default ]]; then
    unlink /etc/nginx/sites-enabled/default
fi
nginx -t
ln -sfn "$release" "$app_root/current"
systemctl daemon-reload
systemctl enable tiaoliao nginx
systemctl restart tiaoliao
systemctl reload nginx

for attempt in {1..20}; do
    if curl -fsS http://127.0.0.1/api/health; then
        printf '\n'
        curl -fsS http://127.0.0.1/ -o /dev/null
        systemctl is-active tiaoliao nginx
        printf 'DEPLOY_OK release=%s\n' "$release_id"
        exit 0
    fi
    sleep 1
done
exit 1

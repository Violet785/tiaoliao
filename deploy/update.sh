#!/usr/bin/env bash
# 用于已经完成 bootstrap 的服务器；保留现有 systemd、Nginx 和 AI 配置。
set -Eeuo pipefail
archive=${1:?Usage: update.sh ARCHIVE SHA256 RELEASE_ID}
archive_sha=${2:?Missing SHA256}
release_id=${3:?Missing release ID}
content_fill=${4:-}
[[ -z "$content_fill" || "$content_fill" == fill ]] || exit 2
[[ "$release_id" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
[[ "$archive_sha" =~ ^[a-fA-F0-9]{64}$ ]] || exit 2
printf '%s  %s\n' "$archive_sha" "$archive" | sha256sum -c -
app_root=/opt/tiaoliao
previous=$(readlink -f "$app_root/current")
[[ "$previous" == "$app_root/releases/"* && -d "$previous/server" ]] || exit 2
release="$app_root/releases/$release_id"
db_file=/var/lib/tiaoliao/tiaoliao.db
switched=0
rollback() {
  printf 'UPDATE_FAILED line=%s\n' "$1"
  if [[ "$switched" == 1 ]]; then
    ln -sfn "$previous" "$app_root/current"
    systemctl restart tiaoliao
    printf 'CODE_ROLLED_BACK previous=%s; additive schema and data retained\n' "$previous"
  fi
}
trap 'rollback "$LINENO"' ERR
mkdir "$release"
tar -xzf "$archive" -C "$release"
export PATH="$app_root/node/bin:$PATH"
cd "$release/server"
if cmp -s package-lock.json "$previous/server/package-lock.json" && [[ -d "$previous/server/node_modules" ]]; then
  cp -a "$previous/server/node_modules" ./node_modules
else
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmmirror.com
fi
# 仅在服务器内部保留已有配置，不输出或放入发布包。
if [[ -f "$previous/server/.env" ]]; then cp -p "$previous/server/.env" .env; fi
runuser -u tiaoliao -- env DB_PATH="$db_file" BACKUP_PATH="/var/lib/tiaoliao/before-$release_id.db" \
  node --disable-warning=ExperimentalWarning --input-type=module -e \
  'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync(process.env.DB_PATH); db.prepare("VACUUM INTO ?").run(process.env.BACKUP_PATH); db.close();'
runuser -u tiaoliao -- env DB_PATH="$db_file" node --disable-warning=ExperimentalWarning src/db/migrate.js
runuser -u tiaoliao -- node --disable-warning=ExperimentalWarning src/scripts/community-smoke.js
runuser -u tiaoliao -- node --disable-warning=ExperimentalWarning src/scripts/reference-recipes-test.js
runuser -u tiaoliao -- node --disable-warning=ExperimentalWarning src/scripts/recommendations-test.js
runuser -u tiaoliao -- node --disable-warning=ExperimentalWarning src/scripts/fill-recipes-test.js
runuser -u tiaoliao -- node --disable-warning=ExperimentalWarning src/scripts/chat-test.js
runuser -u tiaoliao -- node --disable-warning=ExperimentalWarning src/scripts/intent-test.js
runuser -u tiaoliao -- env DB_PATH="$db_file" node --disable-warning=ExperimentalWarning src/scripts/import-reference-recipes.js
if [[ "$content_fill" == fill ]]; then
  runuser -u tiaoliao -- env DB_PATH="$db_file" node --disable-warning=ExperimentalWarning src/scripts/fill-recipes.js
fi
ln -sfn "$release" "$app_root/current"
switched=1
systemctl restart tiaoliao
healthy=0
for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1/api/health; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]]
runuser -u tiaoliao -- env DB_PATH="$db_file" node --disable-warning=ExperimentalWarning src/scripts/import-reference-recipes.js \
  --apply --backup "/var/lib/tiaoliao/before-references-$release_id.db"
if [[ "$content_fill" == fill ]]; then
  runuser -u tiaoliao -- env DB_PATH="$db_file" node --disable-warning=ExperimentalWarning src/scripts/fill-recipes.js \
    --apply --backup "/var/lib/tiaoliao/before-fill-$release_id.db" --report "/var/lib/tiaoliao/fill-$release_id.json"
fi
curl -fsS http://127.0.0.1/ -o /dev/null
systemctl is-active tiaoliao nginx
printf 'UPDATE_OK release=%s previous=%s\n' "$release_id" "$previous"

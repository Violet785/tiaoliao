# 服务器部署

当前验证环境：Ubuntu 24.04、Node.js 24.18.0、Nginx、systemd。

## 打包与安装

在 `app` 目录执行 `npm ci` 和 `npm run build:h5`。回到项目根目录，打包：

```powershell
tar -czf server/data/tiaoliao-release.tar.gz server/src server/package.json server/package-lock.json server/.env.example app/dist/build/h5 deploy
Get-FileHash server/data/tiaoliao-release.tar.gz -Algorithm SHA256
```

通过 Workbench 将部署包和 `deploy/bootstrap.sh` 上传到服务器 `/tmp/`，执行：

```bash
bash /tmp/bootstrap.sh /tmp/tiaoliao-release.tar.gz <SHA256> <唯一发布编号>
```

脚本用于本项目独占的 Ubuntu 服务器，会安装运行环境、配置默认 Nginx 站点和开机启动。第一次运行会初始化调料、标签和演示数据；后续发布先备份数据库，再执行迁移，保留用户数据。

已有运行环境时，本次功能更新可使用 `bash deploy/update.sh <发布包> <SHA256> <唯一发布编号>`。它保留现有 systemd、Nginx、AI 配置，先做在线数据库备份和临时库测试，再切换版本、导入参考配方。失败时恢复旧代码入口，新增数据库字段和已提交数据不会自动删除。

公网入口是 TCP 80。后端仅监听 `127.0.0.1:3000`；不需要开放 3000 端口。确定域名后再配置 HTTPS 和 TCP 443。

## 目录与维护

- 当前代码：`/opt/tiaoliao/current`，指向 `releases` 下的发布目录。
- 数据库：`/var/lib/tiaoliao/tiaoliao.db`，由 `tiaoliao` 系统用户读写。
- 图片：`/var/lib/tiaoliao/uploads`，保留在发布目录外，更新代码不会覆盖。
- 服务：`tiaoliao.service`，自动重启并随系统启动。
- Nginx：`/etc/nginx/sites-available/tiaoliao`。
- 日志：`journalctl -u tiaoliao -n 100 --no-pager`。
- 重启：`systemctl restart tiaoliao`。
- 检查：`curl http://127.0.0.1/api/health`。

运行接口自测（自行启动临时服务、使用临时数据库，不修改线上数据）：

```bash
cd /opt/tiaoliao/current/server
runuser -u tiaoliao -- /opt/tiaoliao/node/bin/node --disable-warning=ExperimentalWarning src/scripts/community-smoke.js
```

此环境包含 README 中的演示账号，供首次功能和网络连通性验证。

## 新建管理员

在 `server` 目录设置 `DB_PATH` 后运行 `src/scripts/create-admin.js <用户名>`，从标准输入读取随机密码（至少 16 位）。脚本只创建新用户，不覆盖已有账号。请使用权限为 0600 的临时密码文件传入，并在成功后删除服务器临时文件，勿把密码写进命令参数或提交到 Git。

管理员登录后，从右上角用户菜单进入「审核管理」。新店铺、蘸料和配方修改均进入待审核队列；通过后在同一事务中发布，驳回需填写原因。普通用户在「反馈登记」下查看处理结果。

## 精选品牌批量导入

`server/src/seed/imports/wuxi-gaode-20261101.json` 保存本次从用户提供的高德表格中筛选的 38 个品牌、来源文件哈希、行号和筛选依据。只导入品牌名和类别，不导入分店、地址、电话，也不把外部评分当作本站蘸料评价。

先在 `server` 目录设置 `DB_PATH`，预览：

```bash
node --disable-warning=ExperimentalWarning src/scripts/import-restaurants.js --input src/seed/imports/wuxi-gaode-20261101.json
```

正式执行需加 `--apply --backup <新的备份路径> --report <结果JSON路径>`，默认审核人为 `tiaoliao_admin`，也可以用 `--admin <用户名>` 指定。工具在事务内创建店铺及已通过审核记录；重复执行复用已有品牌，不覆盖配方，不恢复隐藏店铺。已明确列出的旧名称可统一为品牌名并保留原 ID。

验证导入工具：`node --disable-warning=ExperimentalWarning src/scripts/import-restaurants-test.js`，仅使用临时数据库。

## 通用参考配方

`server/src/seed/referenceRecipes.js` 包含 8 个热门品牌的 5 类起配方案，共 40 份。内容未经线下试配，SVG 为配方插画。来源保留在内部字段和审核历史；按用户要求，前台卡片、详情、照着配和分享图片统一展示，不附加来源标记。

先在 `server` 设置 `DB_PATH` 后预览：

```bash
node --disable-warning=ExperimentalWarning src/scripts/import-reference-recipes.js
```

正式执行添加 `--apply --backup <新的备份路径>`，可用 `--admin <用户名>` 指定审核人。工具在事务内建立已通过的投稿记录和内部来源字段；重复执行复用已有内容，下架的内容不会自动恢复。使用专门的「蘸料编辑」账号署名，不提供登录密码，也不创建虚假点赞、评分和打卡。

## 补齐店铺配方

`server/src/seed/editorialRecipes.js` 包含 16 种编拟组合，按火锅、烤肉、自助餐分配。运行 `node src/scripts/fill-recipes.js` 预览；添加 `--apply --backup <新路径> --report <结果路径>` 正式执行，默认每家至少 4 份，可用 `--minimum 1..8` 调整。只补缺口，不修改原用户配方；清理旧编辑内容的前台标记，保留内容 ID 和审核历史。重复运行不会重复填充，失败整体回滚。

随代码发布并填充时，执行 `bash deploy/update.sh <发布包> <SHA256> <发布编号> fill`；该参数需明确传入，普通发布不自动填充。

本次迁移 `003_discovery_feedback` 新增参考字段、评价标签、重提关联和站内通知。普通发布仍需管理员审核；只有新发生的审核会产生通知，历史审核不批量变成未读消息。

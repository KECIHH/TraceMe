# Operations

本手册面向私有部署的 TraceMe 生产环境。默认服务名为 `travel-planner`，Compose 项目名为 `traceme`。

## 首次部署

1. 将域名 DNS 指向服务器。
2. 安装 Docker、Docker Compose v2 和反向代理（推荐 Caddy）。
3. 克隆代码或上传发布包。
4. 复制 `.env.example` 为 `.env`。
5. 设置 `APP_BASE_URL=https://travel.example.com`、强 `SESSION_SECRET`、管理员用户名和强密码。
6. 执行 `docker compose build`。
7. 执行 `docker compose up -d`。
8. 执行 `docker compose run --rm seed-admin` 创建管理员。
9. 配置 Caddy/Nginx 转发到 `127.0.0.1:3000`。
10. 访问 `/api/health` 和登录页确认服务正常。
11. 登录后创建首次备份。

## 一键部署方式

Linux / 云服务器：

```bash
APP_BASE_URL=https://travel.example.com \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-linux.sh)"
```

Windows PowerShell：

```powershell
$env:APP_BASE_URL="https://travel.example.com"
irm https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-windows.ps1 | iex
```

脚本会生成 `.env`、随机管理员密码、启动容器并执行 `docker compose run --rm seed-admin`。首次输出的密码也会保存到安装目录的 `.env` 中，请部署后尽快登录并修改为自己的强密码。

## 更新部署

```bash
git pull --ff-only
docker compose build
docker compose up -d
docker compose logs --tail=100 travel-planner
```

容器启动时会自动执行 `prisma migrate deploy`。如更新涉及管理员密码重置，再单独执行 seed。

预构建镜像更新可使用：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose pull
docker compose up -d --no-build
docker compose ps
```

说明：预构建镜像更新不是 Git 源码增量，`docker compose pull` 会比较远端镜像 digest，并按 Docker 镜像层下载变化内容。当前镜像已优化为 Next standalone + Prisma 必需依赖，避免复制完整生产 `node_modules` 和生成大 `chown` 层；优化后的第一次更新可能仍会拉较多层，后续小改动通常只需要拉较小的应用层。

如果只是重启当前版本，不想访问 GHCR：

```bash
docker compose up -d --no-build --pull never
```

本地构建更新可使用：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
```

重置管理员密码时：

```bash
RESET_ADMIN_PASSWORD=true docker compose run --rm seed-admin
```

## 查看日志

```bash
docker compose logs -f travel-planner
docker compose logs --tail=200 travel-planner
```

日志中不应出现密码、session token、API Key 或 secret 原文。

## 重启服务

```bash
docker compose restart travel-planner
```

查看状态：

```bash
docker compose ps
curl -s https://travel.example.com/api/health
```

## 运行 migration

容器内手动执行：

```bash
docker compose exec -T travel-planner npx prisma migrate deploy
```

正常情况下，容器启动脚本已经自动执行 migration。

## 创建备份

推荐在应用设置页创建系统备份。备份保存在 `storage/backups` volume 中。

也可以使用 CLI：

```powershell
npm.cmd run backup:create -- --notes "before upgrade"
npm.cmd run backup:list
npm.cmd run backup:verify -- --file travel-planner-backup-YYYYMMDD-HHmmss.zip
npm.cmd run backup:prune -- --dry-run
npm.cmd run backup:prune
```

备份文件可能包含敏感旅行资料，请加密保存。完整校验、恢复和保留策略见 [STAGE15_SECURITY_RELIABILITY.md](STAGE15_SECURITY_RELIABILITY.md)。

## 恢复备份注意事项

1. 停止应用：`docker compose stop travel-planner`。
2. 运行 `npm.cmd run backup:verify -- --file <backup.zip>`。
3. 运行 `npm.cmd run backup:restore -- --file <backup.zip> --confirm-restore`，脚本会先创建当前状态安全备份。
4. 如 CLI 恢复不适合当前部署，再将备份中的 SQLite 快照和 uploads 手动恢复到对应 volume。
5. 不要用旧备份覆盖当前 `.env`。
6. 启动应用：`docker compose up -d`。
7. 检查 `/api/health`。
8. 登录后抽查旅行、文件下载和备份列表。

恢复前应确认备份来源可信，避免导入被篡改的文件。

## 更换服务器

1. 在旧服务器创建最新备份。
2. 导出或复制 Docker volumes。
3. 在新服务器安装 Docker 和反向代理。
4. 复制代码和 `.env`，必要时重新生成 `SESSION_SECRET` 并重新登录。
5. 恢复数据库和 uploads。
6. 启动 `docker compose up -d`。
7. 调整 DNS 到新服务器 IP。
8. 确认 HTTPS 证书重新签发成功。

## 更换域名

1. 添加新域名 DNS `A`/`AAAA` 记录。
2. 更新 `.env` 中 `APP_BASE_URL=https://new.example.com`。
3. 更新 Caddy/Nginx 配置。
4. 重启反向代理和应用。
5. 检查登录、cookie secure 属性和 `/api/health`。
6. 旧域名可保留跳转或关闭。

## 常见故障

### 无法登录

- 确认已执行 `seed-admin.mjs`。
- 确认使用正确的 `INITIAL_ADMIN_USERNAME`。
- 如需重置密码，设置 `RESET_ADMIN_PASSWORD=true` 后重新执行 seed。
- 检查浏览器是否阻止 cookie。
- 如果使用域名访问，确认走 HTTPS；如果还在用 `http://服务器IP:3000` 测试，确认 `.env` 中 `APP_BASE_URL` 也是该 IP 地址，系统会临时关闭 cookie 的 `secure` 属性以保证登录态可用。

### 数据库连接失败

- 检查 `DATABASE_URL`。
- 检查 `sqlite-data` volume 是否可写。
- 查看 `docker compose logs travel-planner` 中 migration 是否失败。
- 执行 `docker compose exec -T travel-planner npx prisma migrate deploy`。

### 上传失败

- 检查文件扩展名、MIME type 和大小限制。
- 检查 `uploads-data` volume 是否可写。
- 确认磁盘空间充足。
- 查看应用日志中的上传校验错误。

### HTTPS 证书失败

- 确认 DNS 已指向当前服务器。
- 确认 80/443 端口开放。
- Caddy 用户检查 `journalctl -u caddy -f`。
- Nginx/Certbot 用户执行 `sudo certbot renew --dry-run`。
- 暂不要开启 HSTS，直到证书链路稳定。

### 反向代理 502

- 检查应用是否运行：`docker compose ps`。
- 检查本机端口：`curl http://127.0.0.1:3000/api/health`。
- 确认反向代理 upstream 是 `127.0.0.1:3000`。
- 查看应用日志是否因环境变量校验失败退出。

### 磁盘空间不足

- 查看空间：`df -h`。
- 清理旧 Docker 镜像：`docker image prune`。
- 下载并离线保存旧备份后，删除不再需要的备份。
- 检查 uploads 是否存在异常大文件。

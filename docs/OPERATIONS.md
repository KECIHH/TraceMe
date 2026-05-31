# 运维手册

本手册面向 TraceMe 私有部署生产环境。默认 Compose 项目名为 `traceme`，主服务名为 `travel-planner`。

## 日常命令

```bash
docker compose ps
docker compose logs -f travel-planner
docker compose logs --tail=200 travel-planner
docker compose restart travel-planner
docker compose down
docker compose run --rm seed-admin
```

健康检查：

```bash
curl -s http://127.0.0.1:3000/api/health
curl -s https://travel.example.com/api/health
```

## 首次部署核对

1. DNS 指向服务器。
2. 安装 Docker、Docker Compose v2 和反向代理。
3. 设置 `APP_BASE_URL=https://travel.example.com`。
4. 设置强 `SESSION_SECRET`。
5. 确认 `DOCUMENT_ENCRYPTION_KEY` 会被保存和备份。
6. 启动容器。
7. 执行 `docker compose run --rm seed-admin`。
8. 登录后修改初始密码。
9. 创建首次系统备份。
10. 验证 HTTPS、登录、文件上传、文件下载和 `/api/health`。

## 更新部署

预构建镜像：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose pull
docker compose up -d --no-build
docker compose ps
docker compose logs --tail=100 travel-planner
```

本地构建：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 travel-planner
```

更新前确认：

- `.env` 没有被覆盖。
- 文档加密密钥没有改变。
- 需要回滚时有可用备份。
- 发布说明中没有需要手工执行的数据迁移。

容器启动会自动执行 `prisma migrate deploy`。正常情况下不需要手动运行 migration。

## 管理员账号

创建管理员：

```bash
docker compose run --rm seed-admin
```

重置管理员密码：

```bash
RESET_ADMIN_PASSWORD=true docker compose run --rm seed-admin
```

主应用容器不应长期持有 `INITIAL_ADMIN_PASSWORD`。

## 备份

推荐在 `/settings/backups` 创建系统备份。备份管理属于管理员能力。

CLI 方式：

```powershell
npm.cmd run backup:create -- --notes "before upgrade"
npm.cmd run backup:list
npm.cmd run backup:verify -- --file travel-planner-backup-YYYYMMDD-HHmmss.zip
npm.cmd run backup:prune -- --dry-run
npm.cmd run backup:prune
```

备份 zip 包含 SQLite 快照和 uploads，不包含 `.env`。备份可能包含行程、住宿、票据、预算和上传文件，必须作为敏感资料保存。

详细格式、校验、恢复和保留策略见 [DATA_BACKUP_AND_RECOVERY.md](DATA_BACKUP_AND_RECOVERY.md)。

## 恢复备份

恢复会替换 SQLite 数据库和上传目录，必须先停止应用。

```bash
docker compose stop travel-planner
```

在可访问项目和备份文件的环境中运行：

```powershell
npm.cmd run backup:verify -- --file C:\path\travel-planner-backup-YYYYMMDD-HHmmss.zip
npm.cmd run backup:restore -- --file C:\path\travel-planner-backup-YYYYMMDD-HHmmss.zip --confirm-restore
```

恢复后：

```bash
docker compose up -d
docker compose logs --tail=100 travel-planner
```

登录后抽查旅行列表、文件下载、AI 设置、备份列表和系统信息。不要用旧备份覆盖当前 `.env` 或文档加密密钥。

## 更换服务器

1. 在旧服务器创建最新备份。
2. 备份 `.env` 和文档加密密钥。
3. 在新服务器安装 Docker 和反向代理。
4. 部署同版本或更新版本 TraceMe。
5. 恢复数据库和 uploads。
6. 设置 `APP_BASE_URL`。
7. 启动容器并检查 migration。
8. 调整 DNS。
9. 验证 HTTPS、登录、文件下载和备份。

## 更换域名

1. 添加新域名 DNS 记录。
2. 更新 `.env` 中 `APP_BASE_URL=https://new.example.com`。
3. 更新 Caddy/Nginx 配置。
4. 重启反向代理和应用。
5. 检查登录 cookie、分享链接、`/api/health` 和 HTTPS 证书。

## 常见故障

### 502 Bad Gateway

- 检查容器是否运行：`docker compose ps`。
- 查看日志：`docker compose logs --tail=120 travel-planner`。
- 本机检查：`curl http://127.0.0.1:3000/api/health`。
- 确认反向代理 upstream 是 `127.0.0.1:3000`。
- 如果日志出现生产环境校验失败，修正 `.env` 后重启。
- 如果日志出现 Prisma CLI wasm 缺失，重新拉取或构建最新镜像。

### 无法登录

- 确认已执行 `seed-admin`。
- 检查用户名和密码。
- 如需重置密码，执行 `RESET_ADMIN_PASSWORD=true docker compose run --rm seed-admin`。
- 域名访问必须使用 HTTPS。
- IP 测试时，`APP_BASE_URL` 应设置为对应 `http://服务器IP:3000`，这样 cookie 不会被错误标记为 secure。

### 数据库或 migration 失败

- 检查 `DATABASE_URL`。
- 检查 `sqlite-data` volume 是否可写。
- 查看 `docker compose logs travel-planner`。
- 必要时手动执行：`docker compose exec -T travel-planner npx prisma migrate deploy`。

### 上传或下载失败

- 检查上传文件类型、大小和 MIME。
- 检查 `uploads-data` volume 权限和磁盘空间。
- 确认 `DOCUMENT_ENCRYPTION_KEY` 与历史上传使用的是同一个值。
- 检查当前用户是否有旅行访问权限和敏感文件下载权限。

### AI 不可用

- 检查 `AI_FEATURE_ENABLED`。
- 检查 `AI_PROVIDER`。
- OpenAI 模式下检查 `OPENAI_API_KEY` 或页面保存的 API Key。
- 页面保存 API Key 时检查 `AI_CONFIG_ENCRYPTION_KEY`。
- 本地或 E2E 可临时使用 `AI_PROVIDER=mock`。

### 磁盘空间不足

- 查看空间：`df -h`。
- 清理旧镜像：`docker image prune`。
- 下载并离线保存旧备份后，按保留策略清理。
- 检查 uploads 是否存在异常大文件。

## 日志要求

日志中不应出现：

- 密码
- session token
- cookie
- API Key
- 文档加密密钥
- 上传文件内容
- 完整 URL query 中的敏感值

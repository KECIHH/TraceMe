# Deployment

TraceMe 默认用于本地或私有服务器部署。请优先使用本机访问、SSH 隧道、VPN、Tailscale 或 ZeroTier，不建议直接开放到公网。

## 本地运行

```bash
npm install
cp .env.example .env
npm run db:ensure
npm run db:deploy
npm run db:seed
npm run dev
```

Windows PowerShell 复制环境文件：

```powershell
Copy-Item .env.example .env
```

访问：

```text
http://localhost:3000
```

健康检查：

```text
http://localhost:3000/api/health
```

## Docker 部署

编辑 `.env`，替换默认密码和密钥后执行：

```bash
docker compose build
docker compose up -d
docker compose exec travel-planner node scripts/seed-admin.mjs
```

默认访问：

```text
http://127.0.0.1:3000
```

Compose 默认端口绑定：

```yaml
127.0.0.1:3000:3000
```

这意味着服务只暴露给服务器本机。远程访问请使用 SSH 隧道或私有网络。

## 环境变量

必填：

- `DATABASE_URL`：SQLite 连接字符串。本地默认 `file:./dev.db`；Docker 默认 `file:/app/prisma/data/traceme.db`。
- `APP_BASE_URL`：应用访问地址。
- `SESSION_SECRET`：长随机字符串。
- `INITIAL_ADMIN_USERNAME`：初始管理员用户名。
- `INITIAL_ADMIN_PASSWORD`：初始管理员密码。

可选：

- `RESET_ADMIN_PASSWORD=true`：重新 seed 时重置管理员密码。
- `SEED_EXAMPLE_TRIP=false`：跳过虚构示例旅行。
- `AI_PROVIDER=openai|mock`：AI provider。
- `OPENAI_API_KEY`：OpenAI API Key，仅服务端读取。
- `OPENAI_MODEL`：OpenAI 模型名。
- `AI_FEATURE_ENABLED=true|false`：AI 功能默认开关。
- `MAX_UPLOAD_FILE_SIZE_BYTES`：单文件上传上限。
- `MAX_TRIP_DOCUMENT_STORAGE_BYTES`：单旅行文件总量上限。
- `DOCUMENT_ENCRYPTION_KEY`：预留文件加密密钥配置。

生产环境启动会运行 `scripts/validate-production-env.mjs`，用于阻止明显不安全的默认配置。

## 数据库迁移

开发环境：

```bash
npm run db:migrate
```

生产或 Docker：

```bash
npm run db:deploy
```

创建管理员和示例旅行：

```bash
npm run db:seed
```

Docker 中：

```bash
docker compose exec travel-planner node scripts/seed-admin.mjs
```

## SSH 隧道访问

如果应用部署在远程服务器，并且 Compose 仍绑定 `127.0.0.1:3000`：

```bash
ssh -L 3000:127.0.0.1:3000 user@your-server
```

然后在本机浏览器打开：

```text
http://127.0.0.1:3000
```

## 持久化目录

Docker Compose 使用三个 volume：

- `sqlite-data`：SQLite 数据库。
- `uploads-data`：上传文件。
- `backups-data`：系统备份。

本地开发对应：

- `prisma/dev.db`
- `storage/uploads`
- `storage/backups`

这些目录和文件都不应提交到 Git。

## 备份与恢复

系统备份可在设置中心创建。备份 zip 包含：

- `manifest.json`
- SQLite 数据库快照
- `storage/uploads` 中的上传文件

备份不会包含：

- `.env`
- `node_modules`
- `.next`
- 日志和缓存
- 现有备份文件

恢复思路：

1. 停止应用。
2. 解压备份。
3. 用备份中的数据库文件替换当前 SQLite 数据库。
4. 用备份中的 `storage/uploads` 替换或合并当前上传目录。
5. 确认 `.env` 使用当前服务器的真实密钥和密码。
6. 启动应用并访问 `/api/health`。

## 常见问题

- 无法登录：确认已执行 seed，且 `.env` 中的用户名密码正确；如果要重置密码，设置 `RESET_ADMIN_PASSWORD=true` 后重新运行 seed。
- Playwright 缺浏览器：执行 `npx playwright install chromium`。
- Docker 启动失败：检查 `SESSION_SECRET` 和 `INITIAL_ADMIN_PASSWORD` 是否仍是默认值。
- 上传失败：检查文件扩展名、MIME type、文件大小和 `storage/uploads` 写权限。
- 备份失败：检查 SQLite 数据库文件是否存在，`storage/backups` 是否可写。
- 远程访问失败：默认只监听远程服务器的 `127.0.0.1`，需要 SSH 隧道或私有网络。

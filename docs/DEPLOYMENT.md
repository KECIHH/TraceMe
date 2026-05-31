# 部署指南

TraceMe 推荐以 Docker Compose 方式私有部署，并放在 HTTPS 反向代理后面。默认 Compose 只绑定 `127.0.0.1:3000`，由 Caddy 或 Nginx 对外提供 HTTPS。

推荐链路：

```text
浏览器 -> HTTPS 域名 -> 反向代理 -> 127.0.0.1:3000 -> TraceMe
```

## 一键部署

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

脚本会完成：

- clone 或 pull 项目。
- 生成或更新 `.env`。
- 生成随机管理员密码。
- 拉取预构建镜像，或在 `TRACEME_USE_LOCAL_BUILD=true` 时本地构建。
- 启动 `travel-planner` 容器。
- 执行 `docker compose run --rm seed-admin` 创建管理员。
- 等待 `/api/health` 正常。

常用变量：

- `APP_BASE_URL`: 对外访问地址；正式域名必须为 HTTPS。
- `TRACEME_REPO`: Git 仓库地址，默认 `https://github.com/KECIHH/TraceMe.git`。
- `TRACEME_BRANCH`: 部署分支，默认 `main`。
- `TRACEME_DIR`: 安装目录，默认 `~/traceme`。
- `TRACEME_PORT`: 宿主机端口，默认 `3000`。
- `TRACEME_BIND`: 宿主机绑定地址，默认 `127.0.0.1`。
- `TRACEME_IMAGE`: 预构建镜像，默认 `ghcr.io/kecihh/traceme:main`。
- `TRACEME_USE_LOCAL_BUILD=true`: 不拉预构建镜像，改为服务器本地构建。
- `INITIAL_ADMIN_USERNAME`: 初始管理员用户名，默认 `admin`。
- `SEED_EXAMPLE_TRIP=false`: 跳过示例旅行。

测试期如果还没有域名，可临时使用：

```bash
APP_BASE_URL=http://YOUR_SERVER_IP:3000 bash scripts/bootstrap-linux.sh
```

切换到正式域名后，重新以 HTTPS `APP_BASE_URL` 运行脚本写回 `.env`。

## 手动 Docker 部署

准备配置：

```bash
cp .env.example .env
```

至少设置：

```env
APP_BASE_URL="https://travel.example.com"
SESSION_SECRET="replace-with-a-long-random-secret-at-least-32-chars"
INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_PASSWORD="replace-with-a-strong-admin-password"
DOCUMENT_ENCRYPTION_KEY=""
```

启动：

```bash
docker compose build
docker compose up -d
docker compose run --rm seed-admin
```

说明：

- 主应用容器不注入 `INITIAL_ADMIN_PASSWORD`；该变量只用于一次性 `seed-admin` 服务。
- `DOCUMENT_ENCRYPTION_KEY` 可手动填入，也可由生产启动脚本生成到 `secrets-data` volume 中的 `/app/storage/secrets/document-encryption-key`。无论哪种方式，都必须备份并长期保留，丢失或变更后无法解密历史上传文件。
- `APP_BASE_URL` 面向域名时必须使用 HTTPS；HTTP 只允许 IP 或 loopback 临时测试。

## 生产启动流程

容器入口：

```bash
node scripts/start-production.mjs
```

启动顺序：

1. 读取或生成 `DOCUMENT_ENCRYPTION_KEY`。
2. 运行 `node scripts/validate-production-env.mjs`。
3. 运行 `node scripts/ensure-sqlite-db.mjs`。
4. 运行 `npx prisma migrate deploy`。
5. 启动 Next.js standalone server。

运行镜像会复制裁剪后的完整生产 `node_modules`，确保 `prisma migrate deploy` 所需的 Prisma CLI、engine、wasm 文件和 transitive dependencies 都在容器内。若部署日志出现 `prisma_schema_build_bg.wasm` 缺失或 `Cannot find module 'effect'`，说明服务器仍在运行旧镜像/旧构建，或镜像里只复制了部分 Prisma 目录；请重新拉取或构建镜像并重启容器。

## Docker Compose 默认行为

- 服务名：`travel-planner`。
- 镜像：`${TRACEME_IMAGE:-ghcr.io/kecihh/traceme:main}`。
- 端口：`${TRACEME_BIND:-127.0.0.1}:${TRACEME_PORT:-3000}:3000`。
- 数据库：`sqlite-data:/app/prisma/data`。
- 上传：`uploads-data:/app/storage/uploads`。
- 备份：`backups-data:/app/storage/backups`。
- 生产密钥文件：`secrets-data:/app/storage/secrets`。
- 健康检查：容器内请求 `http://127.0.0.1:3000/api/health`。

不要把 `.env`、SQLite 数据库、uploads、backups 或 secret 文件打入镜像，也不要挂到反向代理静态目录。

## 增量更新

预构建镜像部署：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose pull
docker compose up -d --no-build
docker compose ps
```

本地构建部署：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
```

只重启当前已拉取镜像，不检查远端新版本：

```bash
docker compose up -d --no-build --pull never
```

容器启动会自动执行 `prisma migrate deploy`。如需重置管理员密码：

```bash
RESET_ADMIN_PASSWORD=true docker compose run --rm seed-admin
```

更新前确认 `.env` 和 `secrets-data` 中的文档加密密钥没有被删除或替换。

## 环境变量

必填或生产启动校验项：

- `DATABASE_URL`
- `APP_BASE_URL`
- `SESSION_SECRET`
- `INITIAL_ADMIN_USERNAME`
- `DOCUMENT_ENCRYPTION_KEY` 或可读写的 `DOCUMENT_ENCRYPTION_KEY_FILE`
- `NODE_ENV=production`

seed 管理员时额外需要：

- `INITIAL_ADMIN_PASSWORD`

AI：

- `AI_PROVIDER`: `openai` 或 `mock`。
- `AI_FEATURE_ENABLED`: `true` 或 `false`。
- `OPENAI_API_KEY`: 服务端 OpenAI Key。
- `OPENAI_MODEL`: OpenAI 模型名。
- `AI_CONFIG_ENCRYPTION_KEY`: 允许页面保存 API Key 时用于加密。

外部 provider：

- `MAP_PROVIDER`
- `NEXT_PUBLIC_MAP_PROVIDER`
- `MAP_PUBLIC_API_KEY_EXPOSED`
- `WEATHER_PROVIDER`
- `EXCHANGE_RATE_PROVIDER`
- `OPEN_EXCHANGE_RATES_APP_ID`

备份和索引：

- `BACKUP_KEEP_DAILY`
- `BACKUP_KEEP_WEEKLY`
- `ALLOW_SEARCH_INDEXING`

## 健康检查

```text
/api/health
```

返回状态、时间、版本和数据库连通性，不返回密钥、数据库绝对路径、用户信息、文件路径或完整环境变量。

## 反向代理

域名、DNS、Caddy、Nginx 和证书续期见 [DOMAIN_AND_HTTPS.md](DOMAIN_AND_HTTPS.md)。

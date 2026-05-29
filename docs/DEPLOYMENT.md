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

### 一条命令安装

脚本会自动完成 clone/pull、生成 `.env`、构建镜像、启动容器和初始化管理员。需要先安装 Git、Docker 和 Docker Compose v2。

Linux / 云服务器：

```bash
curl -fsSL https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-linux.sh | bash
```

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-windows.ps1 | iex
```

默认安装目录是 `~/traceme`，默认访问地址是：

```text
http://127.0.0.1:3000
```

可选环境变量：

- `TRACEME_REPO`：Git 仓库地址，默认 `https://github.com/KECIHH/TraceMe.git`。
- `TRACEME_BRANCH`：部署分支，默认 `main`。
- `TRACEME_DIR`：安装目录，默认 `~/traceme`。
- `TRACEME_PORT`：宿主机端口，默认 `3000`。
- `TRACEME_BIND`：宿主机监听地址，默认 `127.0.0.1`。
- `APP_BASE_URL`：浏览器访问地址，默认 `http://127.0.0.1:3000`。
- `INITIAL_ADMIN_USERNAME`：初始管理员用户名，默认 `admin`。
- `SEED_EXAMPLE_TRIP`：是否创建示例旅行，默认 `true`。
- `TRACEME_BUILD_RETRIES`：Docker 构建失败时的重试次数，默认 `3`。
- `NPM_CONFIG_REGISTRY`：Docker 构建时使用的 npm registry。一键脚本默认使用 `https://registry.npmmirror.com`。
- `ALPINE_REPOSITORY_MIRROR`：Docker 构建时使用的 Alpine 软件源。一键脚本默认使用 `https://mirrors.aliyun.com/alpine`。

示例：部署到服务器 `/opt/traceme`，监听 `8080` 并允许外部访问：

```bash
TRACEME_DIR=/opt/traceme TRACEME_PORT=8080 TRACEME_BIND=0.0.0.0 APP_BASE_URL=http://your-server-ip:8080 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-linux.sh)"
```

PowerShell：

```powershell
$env:TRACEME_DIR="C:\traceme"; $env:TRACEME_PORT="8080"; $env:TRACEME_BIND="0.0.0.0"; $env:APP_BASE_URL="http://your-server-ip:8080"; irm https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-windows.ps1 | iex
```

如果仓库是私有仓库，公开 raw 链接可能无法直接访问。可以先在目标机器登录 GitHub 或改用带权限的 `TRACEME_REPO`，也可以手动 clone 后执行下面的手动部署命令。

### 手动部署

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
- Docker 构建出现 `short read` / `unexpected EOF`：通常是服务器拉取 Docker Hub 基础镜像时网络中断。先重试同一条一键部署命令；如果仍失败，执行 `cd /root/traceme && docker builder prune -f && docker image rm node:lts-alpine || true` 后再重试。阿里云服务器建议配置 Docker 镜像加速器后重启 Docker。
- 上传失败：检查文件扩展名、MIME type、文件大小和 `storage/uploads` 写权限。
- 备份失败：检查 SQLite 数据库文件是否存在，`storage/backups` 是否可写。
- 远程访问失败：默认只监听远程服务器的 `127.0.0.1`，需要 SSH 隧道或私有网络。

# Deployment

TraceMe 当前定位为私有部署的旅行规划网站。生产环境可以通过公网域名访问，但必须放在 HTTPS 反向代理后面，并保持强制登录、关闭公众注册和默认 noindex。

推荐访问链路：

```text
浏览器 -> HTTPS 域名 -> 反向代理 -> 127.0.0.1:3000 -> Next.js 应用
```

## 一键部署

一键部署脚本仍然保留。正式域名访问请显式提供 HTTPS 域名：

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

脚本会完成 clone/pull、生成 `.env`、拉取预构建镜像或本地构建、启动容器、执行 `docker compose run --rm seed-admin`、等待 `/api/health` 正常。

如果服务器上已有旧 `.env`，再次运行脚本并传入新的 `APP_BASE_URL` 会自动更新 `.env` 中的旧值。域名访问必须使用 HTTPS；测试期还没有配好域名时，可以临时使用 `APP_BASE_URL=http://服务器IP:3000`。

常用参数：

- `TRACEME_REPO`: Git 仓库地址，默认 `https://github.com/KECIHH/TraceMe.git`。
- `TRACEME_BRANCH`: 部署分支，默认 `main`。
- `TRACEME_DIR`: 安装目录，默认 `~/traceme`。
- `TRACEME_PORT`: 宿主机端口，默认 `3000`。
- `TRACEME_BIND`: 宿主机绑定地址，默认 `127.0.0.1`。
- `TRACEME_IMAGE`: 预构建 Docker 镜像，默认 `ghcr.io/kecihh/traceme:main`。
- `TRACEME_USE_LOCAL_BUILD=true`: 在服务器本地构建。
- `INITIAL_ADMIN_USERNAME`: 初始管理员用户名，默认 `admin`。
- `SEED_EXAMPLE_TRIP=false`: 跳过虚构示例旅行。

## 生产 Docker Compose

准备 `.env`：

```bash
cp .env.example .env
```

至少设置：

```env
APP_BASE_URL="https://travel.example.com"
SESSION_SECRET="replace-with-a-long-random-secret-at-least-32-chars"
INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_PASSWORD="replace-with-a-strong-admin-password"
DOCUMENT_ENCRYPTION_KEY="生成后长期保存，例如 openssl rand -base64 32 的输出"
```

`DOCUMENT_ENCRYPTION_KEY` 用于解密已上传文件，生产环境必填。首次一键部署会自动生成并写入 `.env`；手动部署请运行 `openssl rand -base64 32` 后填入。增量更新时必须保留服务器 `.env` 中的原值，不能重新生成。

启动：

```bash
docker compose build
docker compose up -d
docker compose run --rm seed-admin
```

Compose 默认：

- 绑定 `127.0.0.1:3000:3000`，供本机反向代理访问。
- `NODE_ENV=production`。
- `restart: unless-stopped`。
- SQLite 数据库使用 `sqlite-data` volume。
- 上传文件使用 `uploads-data` volume。
- 备份文件使用 `backups-data` volume。
- 不默认开放数据库端口。
- 不把 `.env`、uploads、backups 或数据库文件打进镜像。

## 增量更新

预构建镜像部署：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose pull
docker compose up -d --no-build
docker compose ps
```

`docker compose pull` 会按镜像层增量下载，不会主动复用 Git 的源码增量。若 GHCR 上的 `main` 镜像确实更新了，服务器仍需下载变化的镜像层；旧版镜像曾包含完整生产 `node_modules` 和一次递归 `chown` 大层，代码小改也容易触发较大的层下载。当前 Dockerfile 已改为只带 Next standalone 和 Prisma 运行/迁移必需依赖，并移除大 `chown` 层。首次拉取优化后的镜像仍可能下载一次较多内容，之后常规更新会明显更小。

如果只是重启当前已拉取镜像，不检查远端新版本，可执行：

```bash
docker compose up -d --no-build --pull never
```

服务器本地构建部署：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
```

容器启动时会自动运行 `prisma migrate deploy`。如需重置管理员密码：

```bash
RESET_ADMIN_PASSWORD=true docker compose run --rm seed-admin
```

## 生产启动流程

容器启动入口是：

```bash
node scripts/start-production.mjs
```

启动顺序：

1. 运行 `scripts/validate-production-env.mjs` 校验生产环境变量。
2. 运行 `scripts/ensure-sqlite-db.mjs` 确保 SQLite 文件目录存在。
3. 运行 `prisma migrate deploy` 执行 migration。
4. 启动 Next.js standalone server。

管理员 seed 单独执行：

```bash
docker compose run --rm seed-admin
```

如需重置管理员密码：

```bash
RESET_ADMIN_PASSWORD=true docker compose run --rm seed-admin
```

## 环境变量校验

生产启动会校验：

- `DATABASE_URL`
- `APP_BASE_URL`
- `SESSION_SECRET`
- `INITIAL_ADMIN_USERNAME`
- `NODE_ENV`

seed 管理员时额外要求：

- `INITIAL_ADMIN_PASSWORD`

可选：

- `OPENAI_API_KEY`
- `DOCUMENT_ENCRYPTION_KEY`

规则：

- `APP_BASE_URL` 面向域名时必须是 HTTPS URL；测试期允许 `http://服务器IP:3000`，本地 Docker 冒烟测试允许 `http://localhost:3000` 或 `http://127.0.0.1:3000`。
- `SESSION_SECRET` 至少 32 字符。
- 生产环境不能使用示例 `SESSION_SECRET` 或示例管理员密码。
- 错误信息只说明变量名和规则，不打印 secret 原文。
- 主应用服务不会注入 `INITIAL_ADMIN_PASSWORD`；该变量只在 `seed-admin` 一次性服务中使用。

## 本地开发

```bash
npm install
cp .env.example .env
npm run db:ensure
npm run db:deploy
npm run db:seed
npm run dev
```

本地开发可使用：

```text
http://localhost:3000
```

域名访问不要使用 HTTP `APP_BASE_URL`；测试期 IP 直连可临时使用 HTTP。

## 数据库 migration

开发环境：

```bash
npm run db:migrate
```

生产环境：

```bash
npm run db:deploy
```

Docker 容器启动时会自动执行 `prisma migrate deploy`。更新部署后仍建议查看日志确认 migration 成功。

## 健康检查

健康检查接口：

```text
/api/health
```

返回：

- `status`
- `timestamp`
- `version`
- `database.connected`

不会返回 API Key、`SESSION_SECRET`、数据库绝对路径、用户信息、文件路径或完整环境变量。

## 反向代理和 HTTPS

域名、DNS、Caddy/Nginx 示例和 HTTPS 续期说明见 [DOMAIN_AND_HTTPS.md](DOMAIN_AND_HTTPS.md)。

## 静态资源边界

只允许 `public` 中的公开资源由 Next.js 静态服务提供。不要把以下路径配置到 Caddy/Nginx 静态目录：

- `.env`
- SQLite 数据库文件
- `storage/uploads`
- `storage/backups`
- 任何备份 zip

上传文件和备份文件必须通过应用鉴权 API 访问。

## 搜索引擎

当前阶段不建议搜索引擎收录：

- `public/robots.txt` 默认 `Disallow: /`。
- 页面 metadata 默认 noindex。

如果未来公开，需要重新配置 robots、SEO、站点地图、隐私政策、用户协议和公开分享规则。

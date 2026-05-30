# TraceMe 迹遇

TraceMe 是一个私有部署的旅行规划网站（Private Travel Planner），用于在小范围内管理旅行计划、目的地、地点库、每日行程、交通方案、准备清单、预算、票据文件、笔记、AI 旅行草稿、导出和系统备份。

当前阶段支持通过公网域名和 HTTPS 访问，但仍然强制登录，暂不开放公众注册、公开社区、公开分享、在线支付或商业化能力。管理员通过 seed 创建；后续如补齐后台用户管理，也应保持小范围使用。在完成多人权限系统、隐私合规和滥用防护前，不建议开放公众使用。

## 当前能力

- 强制登录、退出登录、修改密码、个人资料和系统设置。
- Dashboard 汇总近期旅行、预算、文件、笔记和备份状态。
- 旅行计划 CRUD、归档、删除、日期同步和今日模式。
- AI 生成旅行规划草稿，确认后写入正式数据。
- 目的地、地点库、美食、住宿、每日行程、路线、清单、预算和笔记管理。
- 文件上传、下载、编辑、删除，新上传文件默认 AES-256-GCM 加密保存在 `storage/uploads`，不通过 public URL 直接访问。
- PWA 安装、离线旅行摘要、网络状态提示、暗色模式、图片压缩和移动端截图测试。
- 单旅行 JSON / Markdown / HTML 导出。
- 系统备份、校验和保留策略，备份保存在 `storage/backups`，不包含 `.env`。
- Docker Compose 生产部署，默认绑定 `127.0.0.1:3000` 供反向代理访问。
- `/api/health` 健康检查，不返回敏感配置。
- `robots.txt` 默认 `Disallow: /`，页面默认 `noindex`。

## 技术栈

- Next.js App Router
- React
- TypeScript strict mode
- Tailwind CSS
- Prisma + SQLite
- Vitest
- Playwright
- Docker / Docker Compose

## 本地开发

```bash
npm install
cp .env.example .env
npm run db:ensure
npm run db:deploy
npm run db:seed
npm run dev
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

本地访问：

```text
http://localhost:3000
```

## 生产访问链路

推荐链路：

```text
浏览器 -> HTTPS 域名 -> 反向代理 -> 127.0.0.1:3000 -> Next.js 应用
```

域名和 HTTPS 配置见 [docs/DOMAIN_AND_HTTPS.md](docs/DOMAIN_AND_HTTPS.md)，完整部署说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，运维手册见 [docs/OPERATIONS.md](docs/OPERATIONS.md)，PWA 与离线限制见 [docs/PWA_OFFLINE.md](docs/PWA_OFFLINE.md)，阶段 15 数据安全与恢复说明见 [docs/STAGE15_SECURITY_RELIABILITY.md](docs/STAGE15_SECURITY_RELIABILITY.md)。

## 一键部署

一键部署仍然可用。正式域名访问请显式提供 HTTPS 域名：

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

- clone / pull 项目。
- 生成 `.env` 和随机管理员密码；如果已有 `.env`，会用本次传入的 `APP_BASE_URL` 更新旧值。
- 拉取预构建镜像，或在 `TRACEME_USE_LOCAL_BUILD=true` 时本地构建。
- 启动 `travel-planner` 容器。
- 执行 `docker compose run --rm seed-admin` 创建管理员。
- 等待 `/api/health` 正常。

可选变量：

- `TRACEME_REPO`: Git 仓库地址，默认 `https://github.com/KECIHH/TraceMe.git`。
- `TRACEME_BRANCH`: 部署分支，默认 `main`。
- `TRACEME_DIR`: 安装目录，默认 `~/traceme`。
- `TRACEME_PORT`: 宿主机端口，默认 `3000`。
- `TRACEME_BIND`: 宿主机绑定地址，默认 `127.0.0.1`。
- `TRACEME_IMAGE`: 预构建 Docker 镜像，默认 `ghcr.io/kecihh/traceme:main`。
- `TRACEME_USE_LOCAL_BUILD=true`: 不拉预构建镜像，改为服务器本地构建。
- `INITIAL_ADMIN_USERNAME`: 初始管理员用户名，默认 `admin`。
- `SEED_EXAMPLE_TRIP=false`: 跳过虚构示例旅行。

如果域名已经准备好，推荐直接传入 HTTPS 域名：

```bash
cd ~/traceme
APP_BASE_URL=https://travel.example.com bash scripts/bootstrap-linux.sh
```

如果还在测试、暂时只能用服务器 IP 和端口访问，也可以临时传入：

```bash
cd ~/traceme
APP_BASE_URL=http://YOUR_SERVER_IP:3000 bash scripts/bootstrap-linux.sh
```

切换到域名后，再用 HTTPS 域名重新运行脚本即可写回 `.env`。

## 手动 Docker 部署

```bash
cp .env.example .env
# 编辑 .env，至少设置 HTTPS 域名、强 SESSION_SECRET、管理员用户名和强密码
# 生成并长期保存文档加密密钥；后续更新不要改这个值
openssl rand -base64 32
docker compose build
docker compose up -d
docker compose run --rm seed-admin
```

生产环境要点：

- `APP_BASE_URL` 面向域名时必须是 HTTPS URL，例如 `https://travel.example.com`；测试期可临时使用 `http://服务器IP:3000`，本地冒烟测试可使用 `http://localhost:3000` 或 `http://127.0.0.1:3000`。
- `SESSION_SECRET` 至少 32 字符，不能使用示例值。
- `DOCUMENT_ENCRYPTION_KEY` 必须安全生成并长期保存；丢失后无法解密已上传文件。
- 一键部署脚本会在 `.env` 缺失或该值为空时自动生成 `DOCUMENT_ENCRYPTION_KEY`；手动部署必须自己填入。增量更新时不要删除或改动服务器 `.env` 中的这个值。
- `INITIAL_ADMIN_PASSWORD` 仅 seed 管理员时需要，生产环境不能使用默认弱密码。
- 主应用容器不注入 `INITIAL_ADMIN_PASSWORD`，seed 管理员使用一次性 `seed-admin` 服务。
- Docker 镜像不会打包 `.env`、`storage/uploads`、`storage/backups` 或数据库文件。
- SQLite、uploads、backups 通过 Docker volume 持久化。
- Compose 默认只将应用绑定到 `127.0.0.1:3000`，由 Caddy/Nginx 提供 HTTPS。

## 增量更新

进入服务器上的安装目录后执行：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose pull
docker compose up -d --no-build
docker compose ps
```

如果使用本地构建：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
```

容器启动会自动执行 `prisma migrate deploy`。如果本次更新需要重置管理员密码，再执行：

```bash
RESET_ADMIN_PASSWORD=true docker compose run --rm seed-admin
```

## 常用 Docker 命令

```bash
docker compose ps
docker compose logs -f travel-planner
docker compose restart travel-planner
docker compose down
docker compose run --rm seed-admin
```

## 环境变量

必填：

- `DATABASE_URL`: SQLite 连接字符串。Docker 默认 `file:/app/prisma/data/traceme.db`。
- `APP_BASE_URL`: 域名访问必须是 HTTPS；测试期 IP 直连和本机 loopback 冒烟测试可用 HTTP。
- `SESSION_SECRET`: 长随机字符串，至少 32 字符。
- `DOCUMENT_ENCRYPTION_KEY`: 文档加密密钥，生产环境必填；丢失或变更后无法解密历史文件。
- `INITIAL_ADMIN_USERNAME`: 初始管理员用户名。
- `INITIAL_ADMIN_PASSWORD`: 仅 seed 管理员时需要，必须替换示例弱密码。
- `NODE_ENV`: 生产环境为 `production`。

可选：

- `OPENAI_API_KEY`: 仅服务端读取，不暴露给前端。
- `OPENAI_MODEL`: OpenAI 模型名。
- `AI_PROVIDER`: `openai` 或 `mock`。
- `AI_FEATURE_ENABLED`: AI 功能开关。
- `ALLOW_SEARCH_INDEXING`: 默认不设置，页面 noindex；未来公开站点前再评估开启。

## 数据、上传和备份

Docker Compose 使用三个 volume：

- `sqlite-data`: SQLite 数据库。
- `uploads-data`: 上传文件。
- `backups-data`: 系统备份。

不要把 `.env`、SQLite 数据库、`storage/uploads` 或 `storage/backups` 配置为静态目录，也不要提交到 Git。上传和备份可能包含住宿、票据、证件、预算、行程等敏感信息，应像敏感资料一样保存。

## 安全边界

- 网站默认强制登录，暂不开放注册。
- 登录接口有基础限流。
- session cookie 使用 `httpOnly`、`sameSite=lax`；HTTPS 域名访问时使用 `secure`，临时 HTTP IP 测试时不启用 `secure`，以保证浏览器能保存登录态。
- 不返回 `passwordHash`。
- AI Key 只能在服务端环境变量中使用。
- 默认安全响应头包含 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy` 和基础 `Content-Security-Policy`。
- `/api/health` 只返回状态、时间、版本和数据库连通性，不返回密钥、数据库路径、用户信息或环境变量。

如果未来改为公开网站，需要补充隐私政策、用户协议、账号系统、权限系统、滥用防护、日志与审计策略、SEO 策略和合规审查。

## 测试命令

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

如果本机缺少 Playwright 浏览器：

```bash
npx playwright install chromium
```

发布前请使用 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) 完成检查。

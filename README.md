# TraceMe 迹遇

TraceMe 是一个个人自用的旅行计划管理网站，用来在本地或私有服务器上整理旅行计划、目的地、地点库、每日行程、交通方案、准备清单、预算、票据文件、笔记、AI 旅行草稿、导出和系统备份。

项目默认面向单人或家庭内部使用，不建议直接公开到公网。更推荐通过本机访问、SSH 隧道、VPN、Tailscale 或 ZeroTier 使用。

## 当前能力

- 账号登录、退出登录、修改密码、个人资料和系统设置。
- Dashboard 汇总近期旅行、预算、文件、笔记和备份状态。
- 旅行计划 CRUD、归档、删除、日期同步和今日模式。
- AI 生成旅行计划：用户填写少量基础信息，生成结构化旅行草稿，确认后写入正式数据。
- AI 草稿预览、重新生成、返回修改、丢弃、确认创建旅行。
- 目的地、地点库、美食、住宿管理。
- 每日行程生成、行程项增删改、排序、完成状态和冲突提醒。
- 路线规划、交通方案评分、权重预设和方案选择。
- 准备清单、自定义清单项和模板清单生成。
- 预算分类、支出记录、汇总统计和剩余额度。
- 文件上传、下载、编辑、删除，文件保存在 `storage/uploads`。
- 笔记系统，AI 输出可保存为笔记。
- 单旅行 JSON / Markdown / HTML 导出。
- 系统备份，包含 SQLite 数据库快照和上传文件，不包含 `.env`。
- Docker Compose 私有部署，默认只绑定 `127.0.0.1:3000`。
- 移动端导航和错误页面。

## AI 旅行计划

TraceMe 现在的主创建流程是 AI 生成旅行计划，而不是让用户手动填写完整旅行资料。

入口：

- `/trips/new`：默认推荐 AI 生成旅行，手动创建仍保留。
- `/trips/ai-plan`：AI 规划输入、生成和草稿预览。

用户只需要填写：

- 目的地、出发城市、出发日期、返回日期。
- 可选：出行人数、预算、旅行偏好、出行强度、交通偏好、住宿偏好、同行人类型、必去地点、避开事项。

AI 会生成结构化草稿，覆盖：

- Trip 基础信息。
- Destination。
- Place。
- ItineraryDay / ItineraryItem。
- TransportOption / RoutePlan。
- ChecklistItem。
- CategoryBudget / Expense。
- Note。

确认前，AI 内容只保存在 `AiPlanDraft` 草稿表，不会污染正式旅行数据。用户确认后，系统使用数据库事务一次性写入正式模块；如果写入失败，不会留下半截旅行数据。

AI 内容始终是草稿。系统会提醒用户人工核验营业时间、票价、班次、预约、酒店库存、天气、签证、政策和安全风险。TraceMe 当前不接入实时票务、酒店、地图路线或天气 API。

未配置 OpenAI Key 时，mock provider 仍可完整演示 AI 生成、预览和确认创建流程。

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

安装依赖：

```bash
npm install
```

复制环境变量模板：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`，至少替换：

```env
SESSION_SECRET="replace-with-a-long-random-secret"
INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_PASSWORD="change-me-before-use"
```

初始化数据库并创建管理员和示例旅行：

```bash
npm run db:ensure
npm run db:deploy
npm run db:seed
```

启动开发服务：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

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

## 构建命令

```bash
npm run build
npm run start
```

生产环境启动前请先运行数据库迁移：

```bash
npm run db:deploy
```

## 首次部署

推荐使用 Docker Compose 部署到本地 PC 或云服务器。首次安装可以使用一键脚本，它会完成 clone / pull、生成 `.env`、拉取预构建镜像、启动容器和初始化管理员。

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

如果要安装到指定目录、修改端口或允许局域网访问：

```bash
TRACEME_DIR=/opt/traceme TRACEME_PORT=8080 TRACEME_BIND=0.0.0.0 APP_BASE_URL=http://your-server-ip:8080 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-linux.sh)"
```

PowerShell：

```powershell
$env:TRACEME_DIR="C:\traceme"; $env:TRACEME_PORT="8080"; $env:TRACEME_BIND="0.0.0.0"; $env:APP_BASE_URL="http://your-server-ip:8080"; irm https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-windows.ps1 | iex
```

更多部署细节见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 日常增量更新

首次安装后，不需要每次重新完整安装。进入服务器上的 TraceMe 目录，拉取最新代码并重启即可。

如果使用一键脚本的默认目录：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose pull
docker compose up -d --no-build
docker compose exec -T travel-planner node scripts/seed-admin.mjs
```

如果你使用本地构建而不是预构建镜像：

```bash
cd ~/traceme
git pull --ff-only origin main
docker compose up -d --build
docker compose exec -T travel-planner node scripts/seed-admin.mjs
```

这次版本包含 Prisma migration。Docker 镜像启动时会执行迁移；如果你是非 Docker 部署，请在更新后运行：

```bash
npm ci
npm run db:deploy
npm run build
npm run start
```

也可以在服务器上保存一个 `update.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

cd ~/traceme
git pull --ff-only origin main
docker compose pull
docker compose up -d --no-build
docker compose exec -T travel-planner node scripts/seed-admin.mjs
docker compose ps
```

之后更新只需要：

```bash
bash ~/traceme/update.sh
```

## 常用 Docker 命令

查看服务状态：

```bash
cd ~/traceme
docker compose ps
```

查看日志：

```bash
cd ~/traceme
docker compose logs -f
```

重启服务：

```bash
cd ~/traceme
docker compose restart
```

停止服务：

```bash
cd ~/traceme
docker compose down
```

## 环境变量

必填：

- `DATABASE_URL`：SQLite 连接字符串。本地默认 `file:./dev.db`，Docker 默认 `file:/app/prisma/data/traceme.db`。
- `APP_BASE_URL`：应用访问地址。
- `SESSION_SECRET`：长随机字符串。
- `INITIAL_ADMIN_USERNAME`：初始管理员用户名。
- `INITIAL_ADMIN_PASSWORD`：初始管理员密码。

AI 相关：

- `AI_PROVIDER=openai|mock`：AI provider。
- `OPENAI_API_KEY`：OpenAI API Key，仅服务端读取。
- `OPENAI_MODEL`：OpenAI 模型名，默认 `gpt-4.1-mini`。
- `AI_FEATURE_ENABLED=true|false`：AI 功能开关。
- `AI_MOCK_ENABLED=true`：强制使用 mock 流程。

文件和备份相关：

- `MAX_UPLOAD_FILE_SIZE_BYTES`：单文件上传上限。
- `MAX_TRIP_DOCUMENT_STORAGE_BYTES`：单旅行文件总量上限。
- `DOCUMENT_ENCRYPTION_KEY`：预留文件加密密钥配置。

部署脚本相关：

- `TRACEME_REPO`：Git 仓库地址，默认 `https://github.com/KECIHH/TraceMe.git`。
- `TRACEME_BRANCH`：部署分支，默认 `main`。
- `TRACEME_DIR`：安装目录，默认 `~/traceme`。
- `TRACEME_PORT`：宿主机端口，默认 `3000`。
- `TRACEME_BIND`：宿主机监听地址，默认 `127.0.0.1`。
- `TRACEME_IMAGE`：预构建 Docker 镜像，默认 `ghcr.io/kecihh/traceme:main`。
- `TRACEME_USE_LOCAL_BUILD=true`：不拉预构建镜像，改为服务器本地构建。

生产环境启动会运行 `scripts/validate-production-env.mjs`，用于阻止明显不安全的默认配置。

## 数据和备份

Docker Compose 使用三个 volume：

- `sqlite-data`：SQLite 数据库。
- `uploads-data`：上传文件。
- `backups-data`：系统备份。

本地开发对应：

- `prisma/dev.db`
- `storage/uploads`
- `storage/backups`

这些目录和文件都不应提交到 Git。

系统备份可在设置中心创建。备份 zip 包包含：

- `manifest.json`
- SQLite 数据库快照
- `storage/uploads` 中的上传文件

备份不会包含：

- `.env`
- `node_modules`
- `.next`
- 日志和缓存
- 现有备份文件

备份可能包含行程、住宿、票据、预算、笔记等隐私资料，应像敏感文件一样保存，不要上传到不可信网盘或发送给 AI。

## 安全提醒

- 不要把 `.env`、SQLite 数据库、上传文件、备份文件提交到 Git。
- 不建议直接公开到公网；如果必须公开，请自行配置 HTTPS、反向代理、防火墙、强密码、监控和备份策略。
- 上传文件不放在 `public`，下载必须经过鉴权 API。
- AI 不会读取上传文件；不要把证件、票据、订单、手机号、住址、API Key、环境变量等敏感内容粘贴给 AI。
- AI 生成旅行计划只是草稿，不代表事实；实时价格、班次、库存、营业时间、政策和安全风险必须人工核验。
- 生产环境 session cookie 使用 `httpOnly`、`sameSite=lax`、`secure`。
- 更多边界见 [docs/SECURITY.md](docs/SECURITY.md)。

## 常见问题

- 无法登录：确认已执行 seed，且 `.env` 中的用户名密码正确；如需重置密码，设置 `RESET_ADMIN_PASSWORD=true` 后重新运行 seed。
- AI 生成失败：未配置 OpenAI Key 时可设置 `AI_PROVIDER=mock` 或 `AI_MOCK_ENABLED=true` 测试完整流程。
- AI 草稿确认失败：确认已运行最新数据库迁移，尤其是 `AiPlanDraft` 表。
- Playwright 缺浏览器：执行 `npx playwright install chromium`。
- Docker 启动失败：检查 `SESSION_SECRET` 和 `INITIAL_ADMIN_PASSWORD` 是否仍是默认值。
- Docker 构建出现 `short read` / `unexpected EOF`：通常是服务器拉取 Docker Hub 层网络中断。可重试、清理 builder，或配置 Docker 镜像加速器。
- 服务器构建卡死或只能强制重启：通常是 ECS 内存不足。默认一键脚本优先拉 GitHub Actions 预构建镜像；只有 `TRACEME_USE_LOCAL_BUILD=true` 时才会在服务器构建。
- 上传失败：检查文件扩展名、MIME type、文件大小和 `storage/uploads` 写权限。
- 备份失败：检查 SQLite 数据库文件是否存在，`storage/backups` 是否可写。
- 远程访问失败：默认只监听远程服务器的 `127.0.0.1`，需要 SSH 隧道、私有网络，或显式设置 `TRACEME_BIND=0.0.0.0`。

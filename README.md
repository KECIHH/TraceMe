# TraceMe 迹遇

TraceMe 是一个私有部署的 AI-first 旅行规划系统。它面向个人、家庭或可信小团队，用少量基础信息生成结构化旅行草稿，再把确认后的内容写入行程、地点、预算、清单、文件、笔记和协作模块。

项目当前不是公开 SaaS：不开放公众注册、不提供在线支付、不默认允许搜索引擎收录。用户由管理员创建，旅行成员按 Owner、Editor、Viewer 分配权限，分享链接需要显式开启，并会过滤敏感文件、住宿订单号和敏感清单内容。

## 当前能力

- AI 生成旅行计划：`/trips/new` 默认引导到 `/trips/ai-plan`，用户先说需求，AI 生成 2-3 个可比较方案；选择、追问修改、预览变更并确认后才写入正式旅行数据。
- 旅行管理：目的地、地点、美食、住宿、每日行程、路线、今日执行模式、预算、清单、笔记、导入和导出。
- 协作与分享：系统用户由管理员创建；旅行成员支持 Owner、Editor、Viewer；公开分享支持启用、撤销、过期、密码和敏感内容过滤。
- 文件安全：上传文件存放在非 public 目录，新上传文件使用 AES-256-GCM 加密，下载必须经过权限校验。
- 运维能力：Docker Compose 部署、健康检查、生产环境校验、SQLite migration、系统备份、备份校验和恢复。
- PWA 与移动端：manifest、Service Worker、离线旅行摘要、今日下一步离线查看、网络状态提示、图片压缩、暗色模式和移动端 E2E 覆盖。
- 外部数据：地图、天气、汇率通过 provider 抽象接入，未配置时可使用 none/mock 安全降级。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
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

Windows PowerShell 建议使用：

```powershell
Copy-Item .env.example .env
npm.cmd run db:ensure
npm.cmd run db:deploy
npm.cmd run db:seed
npm.cmd run dev
```

本地访问：

```text
http://localhost:3000
```

## 生产部署

推荐访问链路：

```text
浏览器 -> HTTPS 域名 -> 反向代理 -> 127.0.0.1:3000 -> Next.js 应用
```

Linux / 云服务器一键部署：

```bash
APP_BASE_URL=https://travel.example.com \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-linux.sh)"
```

Windows PowerShell 一键部署：

```powershell
$env:APP_BASE_URL="https://travel.example.com"
irm https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-windows.ps1 | iex
```

手动 Docker 部署：

```bash
cp .env.example .env
docker compose build
docker compose up -d
docker compose run --rm seed-admin
```

容器启动入口是 `node scripts/start-production.mjs`。启动时会准备文档加密密钥、校验生产环境变量、确保 SQLite 目录存在、执行 `npx prisma migrate deploy`，然后启动 Next.js standalone server。

完整部署说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，域名和 HTTPS 见 [docs/DOMAIN_AND_HTTPS.md](docs/DOMAIN_AND_HTTPS.md)，日常运维见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

## 常用命令

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

```bash
docker compose ps
docker compose logs -f travel-planner
docker compose restart travel-planner
docker compose run --rm seed-admin
```

Windows PowerShell 中如遇执行策略拦截，请使用 `npm.cmd` / `npx.cmd`。

## 重要环境变量

- `APP_BASE_URL`: 正式域名必须使用 HTTPS；IP 或 loopback 临时测试可使用 HTTP。
- `SESSION_SECRET`: 至少 32 字符的长随机值，不能使用示例值。
- `INITIAL_ADMIN_USERNAME`: 初始管理员用户名。
- `INITIAL_ADMIN_PASSWORD`: 仅 seed 管理员时需要，不能使用示例弱密码。
- `DOCUMENT_ENCRYPTION_KEY`: 文档加密密钥；Docker 生产启动可在缺失时生成到持久化 secret 文件，但必须备份该值。
- `OPENAI_API_KEY` / `OPENAI_MODEL` / `AI_PROVIDER`: AI provider 配置。
- `AI_CONFIG_ENCRYPTION_KEY`: 允许在页面保存 AI API Key 时用于服务端加密。

不要提交 `.env`、SQLite 数据库、`storage/uploads`、`storage/backups` 或任何备份 zip。

## 文档

文档入口见 [docs/README.md](docs/README.md)。

- [项目规格](docs/PROJECT_SPEC.md)
- [架构说明](docs/ARCHITECTURE.md)
- [AI 功能](docs/AI.md)
- [部署指南](docs/DEPLOYMENT.md)
- [运维手册](docs/OPERATIONS.md)
- [安全模型](docs/SECURITY.md)
- [备份与恢复](docs/DATA_BACKUP_AND_RECOVERY.md)
- [PWA 与离线](docs/PWA_OFFLINE.md)
- [外部服务](docs/EXTERNAL_PROVIDERS.md)
- [测试指南](docs/TESTING.md)
- [发布检查清单](docs/RELEASE_CHECKLIST.md)

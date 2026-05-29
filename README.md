# TraceMe

个人自用旅行规划网站，用于整理行程草案、预算、资料和本地备份。默认按私有部署设计，不建议直接公开到公网。

## 技术栈

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- ESLint
- Prisma + SQLite
- Vitest
- Playwright
- Docker / Docker Compose 私有部署

## 安装

```bash
npm install
```

复制环境变量模板：

```bash
cp .env.example .env
```

Windows PowerShell 可以使用：

```powershell
Copy-Item .env.example .env
```

## 开发

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

健康检查：

```text
http://localhost:3000/api/health
```

## 数据库

首次创建 SQLite 数据库和 migration：

```bash
npm run db:migrate
```

默认 SQLite 文件会生成在 `prisma/dev.db`，该文件不会提交到 Git。

运行 seed：

```bash
npm run db:seed
```

打开 Prisma Studio：

```bash
npm run db:studio
```

## 测试与质量检查

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

如果本机还没有 Playwright 浏览器，请先安装 Chromium：

```bash
npx playwright install chromium
```

## Docker

默认 Docker Compose 只绑定本机回环地址：

```bash
docker compose build
docker compose up -d
```

默认访问：

```text
http://127.0.0.1:3000
```

首次部署后单独创建管理员：

```bash
docker compose exec travel-planner node scripts/seed-admin.mjs
```

Docker 部署时数据库运行路径固定为：

```text
file:/app/prisma/data/traceme.db
```

不要把开发环境的 `file:./dev.db` 用作容器数据库路径，否则数据不会落到 SQLite volume。

持久化数据：

- SQLite: Docker volume `sqlite-data`
- 上传文件: Docker volume `uploads-data`
- 备份文件: Docker volume `backups-data`

不要把 `.env`、数据库、上传文件或备份文件提交到 Git。完整部署、SSH 隧道、VPN/Tailscale/ZeroTier、公网风险、迁移、备份和恢复说明见：

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/SECURITY.md](docs/SECURITY.md)

## Private Deployment

TraceMe is private-first. Docker Compose binds `127.0.0.1:3000:3000` by default and does not provide public domain or reverse-proxy settings. Use SSH tunneling or a private network unless you are ready to manage HTTPS, firewall rules, strong credentials, compliance, monitoring, and backups yourself.

# TraceMe

个人自用旅行规划网站，用于整理行程草案、预算、资料和本地备份。本阶段完成基础工程框架，暂不建议公开部署。

## 技术栈

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- ESLint
- Prisma + SQLite
- Vitest
- Playwright
- Docker 基础文件

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

本阶段仅提供基础 Docker 文件，尚未做完整生产部署设计。

```bash
docker compose build
docker compose up
```

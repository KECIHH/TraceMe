# 测试指南

TraceMe 使用 ESLint、TypeScript、Vitest、Next build 和 Playwright 做交付前验证。Windows PowerShell 中建议使用 `npm.cmd` 和 `npx.cmd`，避免执行策略拦截。

## 验收顺序

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Windows PowerShell：

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:e2e
```

## 单元测试

```bash
npm run test
```

覆盖重点：

- 登录、密码 hash、session cookie。
- 生产环境变量校验。
- 旅行、行程、地点、清单、预算等领域逻辑。
- AI provider、AI 计划、敏感信息脱敏。
- 文件类型、MIME、内容签名、路径穿越和下载限流。
- 文档加密、备份 manifest、校验和保留策略。
- 协作权限、分享链接、公开内容过滤。
- PWA 离线摘要脱敏。
- 外部 provider 的缓存和降级。

监听模式：

```bash
npm run test:watch
```

## E2E 测试

```bash
npm run test:e2e
```

E2E 会启动生产构建后的 standalone 服务，并使用 SQLite 测试数据库。Playwright 配置使用 `workers: 1`，因为测试会共享数据库并进行创建、删除、改密码、备份等写入流程。

覆盖重点：

- 未登录访问受保护页面会跳转登录。
- 登录、Dashboard、退出登录。
- AI 计划生成、预览、确认创建旅行。
- 旅行创建、编辑、归档、删除。
- 目的地、地点、美食、住宿、笔记、清单和预算。
- 行程日期生成、行程项校验、排序、状态更新和今日模式。
- 路线规划、交通方案评分、权重切换、选择和删除。
- 文件上传、下载、删除、危险文件阻止和非 public 访问。
- 协作成员、分享链接、公开分享过滤。
- 系统设置、用户管理、AI 设置、系统信息脱敏。
- PWA、移动端导航、移动端表单和离线页面。

## Playwright 浏览器

如果本机没有 Chromium：

```bash
npx playwright install chromium
```

Windows PowerShell：

```powershell
npx.cmd playwright install chromium
```

CI 或 Linux 环境缺少系统依赖时，按 Playwright 提示安装对应依赖。

## Docker 冒烟测试

```bash
docker compose build
docker compose up -d
docker compose ps
curl -s http://127.0.0.1:3000/api/health
```

如果需要 seed 管理员：

```bash
docker compose run --rm seed-admin
```

## 写新测试的原则

- 领域逻辑优先写 Vitest。
- 权限、登录、跳转、文件下载、分享、备份、移动端布局写 Playwright。
- 安全修复必须补负向用例。
- E2E 数据使用虚构名称和时间戳后缀。
- 不依赖测试顺序以外的隐式状态。
- 不删除测试来规避失败；不降低类型、安全或权限校验来让测试通过。

## 常见失败原因

- PowerShell 拦截 `npm.ps1`：改用 `npm.cmd`。
- 缺少 Playwright 浏览器：运行 `npx.cmd playwright install chromium`。
- E2E 提示 standalone build 缺失：先运行 `npm.cmd run build`。
- 登录失败：检查 `.env.test`、seed 用户和密码。
- SQLite 锁或串扰：确认 Playwright `workers` 为 1。
- 上传测试失败：检查文件类型、MIME、内容签名和 `storage/uploads` 权限。
- Docker build 失败：检查网络、镜像源、Node/Prisma 安装和生产环境变量。

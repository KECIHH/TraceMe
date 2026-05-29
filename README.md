# TraceMe 迹遇

TraceMe 是一个个人自用旅行规划网站，用来在本地或私有服务器上整理旅行计划、目的地、地点库、行程、交通、清单、预算、文件、笔记、AI 草稿、导出和系统备份。项目默认面向单人或家庭内部使用，不建议直接公开到公网。

## 功能列表

- 登录、退出登录、修改密码、个人资料与系统设置。
- Dashboard 汇总近期旅行、预算、文件、笔记和备份状态。
- 旅行计划 CRUD、归档、删除与日期同步。
- 目的地、地点库、美食、住宿管理。
- 行程日期生成、行程项增删改、排序、完成状态和今日模式。
- 路线规划、交通方案评分、权重预设和方案选择。
- 准备清单、自定义清单项和模板清单生成。
- 预算分类、支出记录、汇总统计和剩余额度。
- 文件上传、下载、编辑、删除，文件保存在 `storage/uploads`。
- 笔记系统，AI 结果可保存为笔记。
- 单旅行 JSON / Markdown / HTML 导出。
- 系统备份，包含 SQLite 数据库快照和上传文件，不包含 `.env`。
- Docker Compose 私有部署，默认只绑定 `127.0.0.1:3000`。
- 移动端导航和错误页面。

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

## 部署方式

本地 PC 或云服务器推荐使用 Docker Compose。最快方式是一条命令拉取 GitHub 仓库、生成 `.env`、拉取预构建镜像、启动服务并创建初始管理员。

Linux / 云服务器：

```bash
curl -fsSL https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-linux.sh | bash
```

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-windows.ps1 | iex
```

默认访问地址：

```text
http://127.0.0.1:3000
```

脚本默认安装到 `~/traceme`，只监听本机回环地址。需要改目录、端口或允许局域网/公网访问时，可以在执行前设置环境变量，例如：

```bash
TRACEME_DIR=/opt/traceme TRACEME_PORT=8080 TRACEME_BIND=0.0.0.0 APP_BASE_URL=http://your-server-ip:8080 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-linux.sh)"
```

PowerShell：

```powershell
$env:TRACEME_DIR="C:\traceme"; $env:TRACEME_PORT="8080"; $env:TRACEME_BIND="0.0.0.0"; $env:APP_BASE_URL="http://your-server-ip:8080"; irm https://raw.githubusercontent.com/KECIHH/TraceMe/main/scripts/bootstrap-windows.ps1 | iex
```

如果已经克隆了项目，也可以手动部署：

```bash
docker compose pull
docker compose up -d --no-build
docker compose exec travel-planner node scripts/seed-admin.mjs
```

`docker-compose.yml` 默认只监听本机回环地址，适合配合 SSH 隧道、VPN、Tailscale、ZeroTier 或内网访问。完整说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 安全提醒

- 不要把 `.env`、SQLite 数据库、上传文件、备份文件提交到 Git。
- 不要直接公开到公网；如果必须公开，请自行配置 HTTPS、反向代理、防火墙、强密码、监控和备份策略。
- 上传文件不放在 `public`，下载必须经过鉴权 API。
- AI 不会读取上传文件；不要把证件、票据、订单、手机号、住址、API Key 等敏感内容粘贴给 AI。
- 生产环境 session cookie 使用 `httpOnly`、`sameSite=lax`、`secure`。
- 更多边界见 [docs/SECURITY.md](docs/SECURITY.md)。

## 备份提醒

系统备份保存在 `storage/backups`，内容包含数据库快照和上传文件，可能含有行程、住宿、票据、预算、笔记等隐私资料。备份不会包含 `.env`，但仍应像敏感文件一样保存，不要上传到不可信网盘或发送给 AI。

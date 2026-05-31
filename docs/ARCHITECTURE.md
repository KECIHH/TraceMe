# 架构说明

TraceMe 使用 Next.js App Router 构建服务端渲染应用，Prisma 管理 SQLite 数据，Docker Compose 负责生产部署。项目以私有部署和敏感旅行资料保护为默认前提。

## 技术结构

```text
Browser / PWA
  -> Next.js App Router
  -> Server Actions / Route Handlers
  -> Auth, permission, AI, backup, import, external provider services
  -> Prisma Client
  -> SQLite + storage/uploads + storage/backups + storage/secrets
```

主要目录：

- `src/app`: 页面、布局、Server Actions 和 API route handlers。
- `src/components`: 可复用 UI 组件。
- `src/lib`: 领域逻辑、认证、权限、AI、备份、导入、外部 provider、格式化和工具函数。
- `src/server/services`: 只在服务端使用的配置和服务。
- `prisma`: schema 和 migrations。
- `scripts`: 部署、seed、备份、生产启动和迁移脚本。
- `tests/unit`: Vitest 单元测试。
- `tests/e2e`: Playwright 端到端测试。

## 路由分层

公开路由：

- `/login`
- `/offline`
- `/share/[token]`
- `/api/health`

登录后路由：

- `/dashboard`
- `/trips`
- `/trips/new`
- `/trips/ai-plan`
- `/trips/[id]` 及其子模块
- `/settings`
- `/settings/profile`
- `/settings/password`
- `/settings/sessions`
- `/settings/system`

管理员路由：

- `/settings/users`
- `/settings/ai`
- `/settings/backups`
- `/api/backups/[backupId]/download`
- `/api/backups/[backupId]/delete`

## 权限模型

系统权限由 `User.role` 控制，系统级配置必须使用 `requireAdmin()`。旅行权限由 `TripMember.role` 和 `canDownloadSensitiveDocuments` 控制，旅行读写必须通过 `requireTripAccess()` 或等价校验。

旅行权限矩阵：

| 能力 | OWNER | EDITOR | VIEWER |
| --- | --- | --- | --- |
| 读取旅行 | 是 | 是 | 是 |
| 编辑旅行内容 | 是 | 是 | 否 |
| 上传文件 | 是 | 是 | 否 |
| 下载敏感文件 | 是 | 默认否 | 默认否 |
| 管理成员 | 是 | 否 | 否 |
| 管理分享链接 | 是 | 否 | 否 |
| 删除旅行 | 是 | 否 | 否 |

公开分享不使用登录会话，按 `TripShareLink` 校验启用状态、撤销状态、过期时间和密码。带密码分享通过 POST 解锁后写入短期签名 cookie，不把密码放入 URL。

## 数据存储

Docker Compose 默认使用持久化 volume：

- `sqlite-data`: SQLite 数据库。
- `uploads-data`: 上传文件。
- `backups-data`: 系统备份。
- `secrets-data`: 生产启动自动生成的文档加密密钥。

上传文件和备份文件不在 `public` 中，必须通过应用鉴权读取。备份 zip 不包含 `.env`。

## 生产启动流程

容器入口：

```bash
node scripts/start-production.mjs
```

启动顺序：

1. `ensure-production-secrets.mjs`: 如果 `DOCUMENT_ENCRYPTION_KEY` 缺失，从持久化 secret 文件读取或生成新密钥。
2. `validate-production-env.mjs`: 校验生产环境变量。
3. `ensure-sqlite-db.mjs`: 确保 SQLite 目录和文件路径可用。
4. `npx prisma migrate deploy`: 执行数据库迁移。
5. 导入 `server.js`: 启动 Next.js standalone server。

`seed-admin` 是独立 Compose profile，只在创建或重置管理员时运行，不把 `INITIAL_ADMIN_PASSWORD` 注入主应用容器。

## 外部服务边界

- AI provider 支持 `openai` 和 `mock`。
- OpenAI 调用走服务端 `/v1/responses`，API Key 不进入客户端。
- 地图、天气、汇率通过 provider 工厂创建，未配置时使用 `none` 或 `mock`。
- 外部数据只作为参考，UI 和文档都要求用户以官方渠道核验。

## 静态与离线边界

Service Worker 只缓存应用壳和明确允许的离线摘要。离线摘要会移除上传文件内容、备份文件、AI prompt 原文、密钥、session、证件号、订单号和附件内容。用户可在旅行页清除本设备离线数据。

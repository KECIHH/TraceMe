# 安全模型

TraceMe 默认按私有系统设计。安全目标是保护旅行计划、住宿信息、票据文件、预算、联系人、分享链接和系统备份，避免把敏感数据暴露到公网、日志、URL、静态目录或未授权用户。

## 访问控制

- 默认强制登录。
- 不开放公众注册。
- 管理员通过 seed 创建初始账号，也可在 `/settings/users` 创建协作用户。
- 系统级功能必须使用 `requireAdmin()` 或等价守卫。
- 旅行级功能必须校验 `TripMember` 权限。

系统级管理员能力：

- 用户管理。
- AI Provider 配置、测试和删除。
- 系统备份列表、创建、下载和删除。

普通用户不能访问这些系统级配置。

## 旅行权限

旅行成员角色：

- `OWNER`: 可读写、删除旅行、管理成员、管理分享链接、上传文件、下载敏感文件。
- `EDITOR`: 可读写和上传文件；默认不能下载敏感文件，不能管理成员或分享。
- `VIEWER`: 只读访问。

敏感文件下载可以通过 `canDownloadSensitiveDocuments` 单独授权。

## 登录与会话

- 密码使用 scrypt hash 存储，不保存明文密码。
- 登录接口不返回 `passwordHash`。
- session token 只以 hash 形式保存到数据库。
- session cookie 使用 `httpOnly` 和 `sameSite=lax`。
- HTTPS 域名访问时 session cookie 使用 `secure`。
- HTTP IP 或 loopback 测试时允许不启用 `secure`，保证浏览器能保存登录态。
- 登录失败按用户名和 IP 做基础限流，错误提示不泄露用户名是否存在。
- 修改密码会清理其他会话。
- `/settings/sessions` 可查看当前会话信息并退出其他会话。

## 分享链接

分享链接由 Owner 管理，支持启用、撤销、过期时间和可选密码。

安全边界：

- 分享 token 以 hash 形式存储。
- 分享密码以 hash 形式存储。
- 密码解锁使用 POST 提交，不把密码放入 query string。
- 解锁成功后写入短期签名 cookie。
- 公开分享页只展示白名单字段。
- 敏感文档类型不展示。
- 住宿 `bookingReference` 不展示。
- 清单项会按敏感关键词过滤，例如证件、订单、保险、联系人、电话、邮箱、地址、支付、密码、密钥、医疗等。

公开分享不代表整趟旅行完全公开，新增字段时必须显式加入 sanitizer/DTO 后才能暴露。

## 环境变量和密钥

- `.env` 被 `.gitignore` 和 `.dockerignore` 排除。
- Docker 镜像不打包 `.env`。
- `SESSION_SECRET` 至少 32 字符，不能使用示例值。
- `INITIAL_ADMIN_PASSWORD` 只用于 seed 管理员。
- 主应用容器不注入 `INITIAL_ADMIN_PASSWORD`。
- `OPENAI_API_KEY` 只在服务端读取。
- 页面保存 AI API Key 时必须配置 `AI_CONFIG_ENCRYPTION_KEY`。
- `DOCUMENT_ENCRYPTION_KEY` 用于上传文件 AES-256-GCM 加密，不能提交、打印或返回前端。
- 文档加密密钥丢失或变更后，历史上传文件无法解密。

## 文件和备份

- 上传文件保存在 `storage/uploads`，不放入 `public`。
- 备份文件保存在 `storage/backups`，不放入 `public`。
- Docker 生产密钥文件保存在 `storage/secrets` volume。
- 上传文件下载必须经过登录、旅行权限和敏感文件权限校验。
- 备份创建、下载和删除必须是管理员操作。
- 备份 zip 可能包含数据库和上传文件，应加密保存并避免上传到不可信服务。
- 历史明文上传可用 `npm.cmd run documents:migrate-encryption` 迁移。

不要在 Caddy/Nginx 中把以下路径配置成静态目录：

- `.env`
- SQLite 数据库文件
- `storage/uploads`
- `storage/backups`
- `storage/secrets`
- 任何备份 zip

## 审计与日志

`AuditLog` 记录登录、退出、改密、文件上传/下载/删除、备份、AI 设置、旅行删除、导出和权限拒绝等关键操作。

审计日志和错误日志不应保存：

- 密码
- 完整 API Key
- session token
- cookie
- 文件内容
- 文档加密密钥
- 完整敏感 URL query

Sentry 默认未启用。如未来接入，必须先完成 request body、cookie、authorization、API Key、文件内容和 URL query 脱敏。

## 响应头和索引

应用设置基础安全响应头：

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy`

当前 CSP 为兼容 Next.js 和开发调试保留了 `unsafe-inline` / `unsafe-eval`。未来如收紧到 nonce/hash CSP，需要重新验证所有页面、Server Actions、第三方脚本和 E2E。

默认不建议搜索引擎收录：

- `robots.txt` 默认 `Disallow: /`。
- 页面 metadata 默认 noindex。

## AI 安全

- AI 结果是草稿，不是最终事实。
- AI 不自动读取上传文件。
- prompt 会做敏感信息提示和脱敏处理。
- API Key 不进入客户端。
- 管理员才可修改 AI Provider 系统配置。
- OpenAI 或其他第三方 provider 的数据处理风险需要由部署者自行评估。

## 安全变更测试要求

涉及以下内容时，必须补负向测试：

- 登录和 session。
- 管理员权限。
- TripMember 权限。
- 分享链接和公开 DTO。
- 文件上传、下载、加密和路径校验。
- 备份创建、下载、删除和恢复。
- AI Provider 配置和密钥保存。

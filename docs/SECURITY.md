# Security

TraceMe 是私有部署的旅行规划网站。它可以通过域名和 HTTPS 访问，但当前仍按“小范围使用系统”设计，不是开放注册的公众网站。

## 访问控制

- 默认强制登录。
- 暂不开放注册。
- 管理员通过 seed 创建；如未来增加后台创建用户，也应限制在可信小范围内。
- 未完成多人权限系统前，不建议开放公众使用。
- 如果未来公开，需要补充隐私政策、用户协议、账号系统、权限系统、滥用防护和合规审查。

## 登录与会话

- 密码使用 scrypt hash 存储，不保存明文密码。
- 登录接口不返回 `passwordHash`。
- session token 只以 hash 形式保存到数据库。
- session cookie 使用 `httpOnly`。
- session cookie 使用 `sameSite=lax`。
- HTTPS 域名访问时 session cookie 必须 `secure`；临时 HTTP IP 测试时允许不启用 `secure`，否则浏览器无法保存登录态。
- 登录失败有基础限流。
- 修改密码后会清理其他会话。

## 环境变量和密钥

- `.env` 被 `.gitignore` 和 `.dockerignore` 排除。
- Docker 镜像不打包 `.env`。
- `SESSION_SECRET` 必须是至少 32 字符的长随机字符串。
- `INITIAL_ADMIN_PASSWORD` 仅 seed 管理员时需要，生产环境不能使用默认弱密码。
- 主应用容器不注入 `INITIAL_ADMIN_PASSWORD`，seed 管理员使用一次性 `seed-admin` 服务。
- `OPENAI_API_KEY` 只能在服务端读取，不暴露给前端。
- 不在日志中输出密码、session token、API Key 或 secret 原文。
- 环境变量校验错误只显示变量名和规则，不显示具体 secret 值。

## 文件和备份

- 上传文件保存在 `storage/uploads`，不放入 `public`。
- 备份文件保存在 `storage/backups`，不放入 `public`。
- 不要把 uploads、backups、`.env` 或数据库文件配置成反向代理静态目录。
- 上传文件下载必须经过登录鉴权 API。
- 备份下载必须经过登录鉴权 API。
- 备份 zip 可能包含旅行行程、住宿地址、票据记录、预算和上传文件，应加密保存并避免发送给不可信服务。

## 健康检查

`/api/health` 只返回：

- `status`
- `timestamp`
- `version`
- `database.connected`

不返回：

- API Key
- `SESSION_SECRET`
- 数据库绝对路径
- 用户信息
- 文件路径
- 完整环境变量

## 安全响应头

应用为所有路由设置基础安全响应头：

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy`

当前 CSP 为兼容 Next.js 运行时保留了必要的 inline script/style 配置。未来若引入 nonce/hash CSP，应重新验证所有页面和第三方脚本。

## AI 安全

- AI 页面提示不要输入证件号、手机号、订单号、API Key 等敏感信息。
- AI 不会自动读取上传文件。
- OpenAI API Key 只从服务端环境变量读取。
- 未配置 OpenAI Key 时可使用 mock provider 完成流程测试。

## 搜索引擎

当前阶段不建议搜索引擎收录：

- `robots.txt` 默认 `Disallow: /`。
- 页面 meta 默认 noindex。

如果未来改为公开网站，需要重新配置 robots、SEO、站点地图、公开分享边界和隐私合规内容。

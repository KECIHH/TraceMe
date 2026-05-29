# Security

TraceMe 当前定位为个人自用旅行规划网站，请按本地私有工具对待。

## 使用边界

- 不要公开部署到公网。
- 不要上传真实敏感证件做测试，包括身份证、护照、签证、银行卡、保险单和完整票据。
- 不要把 API Key、会话密钥、加密密钥写进代码或提交到 Git。
- 不要把敏感文件、真实证件、私密行程、票据或备份文件发给 AI。

## 配置建议

- 使用 `.env.example` 创建本地 `.env`，并替换默认密钥和密码。
- `storage/uploads`、`storage/backups`、SQLite 数据库文件都应保持在本地私有环境中。
- Docker Compose 默认绑定 `127.0.0.1:3000`，不要改成 `0.0.0.0`，除非你已经完成反向代理、HTTPS、防火墙和强密码配置。
- `SESSION_SECRET` 必须使用足够长的随机字符串。
- `INITIAL_ADMIN_PASSWORD` 必须使用强密码；首次创建管理员后，后续应尽快通过改密功能轮换。
- `OPENAI_API_KEY` 只放在 `.env` 或服务器密钥管理中，不要提交到 Git。

## 已实现的安全边界

- 生产环境 session cookie 使用 `secure`。
- session cookie 使用 `httpOnly` 和 `sameSite=lax`。
- 登录接口返回用户信息时不返回 `passwordHash`。
- 上传文件保存在 `storage/uploads`，不放入 `public`。
- 文件下载走鉴权 API，不直接暴露真实存储路径。
- 备份文件保存在 `storage/backups`，不放入 `public`。
- `/api/health` 只返回基本状态、时间和版本，不返回密钥或数据库配置。
- `.dockerignore` 排除 `.env`、本地数据库、上传文件和备份文件，避免进入镜像构建上下文。
- 默认 Docker Compose 端口绑定为 `127.0.0.1:3000:3000`。

## Private Deployment Notes

TraceMe is intended for private use. Prefer local access, SSH tunneling, VPN, Tailscale, or ZeroTier. Public exposure requires your own domain, compliance review, HTTPS, reverse proxy, firewall policy, strong credentials, monitoring, and backup protection.

Never commit `.env`, API keys, session secrets, SQLite databases, uploaded documents, or generated backup archives.

# Deployment / 部署

TraceMe is designed for private self-hosting. The default Docker Compose file binds the app to `127.0.0.1:3000` so it is reachable from the server itself, SSH tunnels, or a private network, but not directly exposed to the public internet.

迹遇默认按个人私有部署设计。`docker-compose.yml` 默认绑定 `127.0.0.1:3000`，适合服务器本机、SSH 隧道或私有网络访问，不默认向公网开放。

## Quick Start / 快速开始

1. Copy the environment template.

   ```bash
   cp .env.example .env
   ```

   Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Edit `.env` and replace all example secrets and passwords.

   For Docker Compose deployment, keep the SQLite database inside the container volume:

   ```env
   DATABASE_URL="file:/app/prisma/data/traceme.db"
   APP_BASE_URL="http://127.0.0.1:3000"
   NODE_ENV="production"
   ```

3. Build and start the app.

   ```bash
   docker compose build
   docker compose up -d
   ```

4. Run the first admin seed once.

   ```bash
   docker compose exec travel-planner node scripts/seed-admin.mjs
   ```

5. Open the app locally on the server or through a tunnel:

   ```text
   http://127.0.0.1:3000
   ```

## Environment Variables / 环境变量

Required:

- `DATABASE_URL`: SQLite connection string. Docker Compose sets the container runtime value to `file:/app/prisma/data/traceme.db` so SQLite is stored in the `sqlite-data` volume.
- `APP_BASE_URL`: Base URL used by the app, for example `http://127.0.0.1:3000`.
- `SESSION_SECRET`: Long random secret used for session-related signing or future encryption. Use at least 32 random characters.
- `INITIAL_ADMIN_USERNAME`: Username for the first admin seed.
- `INITIAL_ADMIN_PASSWORD`: Password used only when creating or explicitly resetting the admin account.
- `NODE_ENV`: Must be `production` for Docker deployment.

Optional:

- `OPENAI_API_KEY`: Optional AI provider key. Do not commit it to Git.
- `DOCUMENT_ENCRYPTION_KEY`: Reserved optional key for document encryption workflows.

Security notes:

- Generate a strong `SESSION_SECRET`; do not use the example value.
- Do not use the development value `file:./dev.db` for Docker deployment; it is not mounted to the SQLite volume.
- Change `INITIAL_ADMIN_PASSWORD` immediately after first startup when password changing is available. Until then, keep `.env` private and use a strong password from the beginning.
- Never commit `.env`, API keys, session secrets, database files, uploaded files, or backups.
- Do not upload `.env` to a public repository.

## Database Migration / 数据库迁移

The Docker container runs this on startup:

```bash
prisma migrate deploy
```

This applies checked-in Prisma migrations safely and does not seed or overwrite user data.

First deployment:

```bash
docker compose up -d
docker compose exec travel-planner npx prisma migrate deploy
docker compose exec travel-planner node scripts/seed-admin.mjs
```

Upgrade:

```bash
git pull
docker compose build
docker compose up -d
docker compose exec travel-planner npx prisma migrate deploy
```

Do not run seed repeatedly unless you understand the behavior. The seed script creates the admin user if missing. It only resets the password when `RESET_ADMIN_PASSWORD=true` is set.

## SQLite Backup / SQLite 备份

Create a backup while the app is stopped:

```bash
docker compose stop travel-planner
docker run --rm -v traceme_sqlite-data:/data -v "%cd%:/backup" alpine sh -c "cp /data/traceme.db /backup/traceme-backup.db"
docker compose up -d
```

Linux/macOS shell:

```bash
docker compose stop travel-planner
docker run --rm -v traceme_sqlite-data:/data -v "$PWD:/backup" alpine sh -c "cp /data/traceme.db /backup/traceme-backup.db"
docker compose up -d
```

Restore a backup:

```bash
docker compose stop travel-planner
docker run --rm -v traceme_sqlite-data:/data -v "%cd%:/backup" alpine sh -c "cp /backup/traceme-backup.db /data/traceme.db"
docker compose up -d
```

Linux/macOS shell:

```bash
docker compose stop travel-planner
docker run --rm -v traceme_sqlite-data:/data -v "$PWD:/backup" alpine sh -c "cp /backup/traceme-backup.db /data/traceme.db"
docker compose up -d
```

Uploaded documents and generated backups live in separate Docker volumes:

- `uploads-data` mounted at `/app/storage/uploads`
- `backups-data` mounted at `/app/storage/backups`

Back them up separately if you use document upload or app backup features.

## Access Options / 访问方式

Local access on the server:

```text
http://127.0.0.1:3000
```

SSH tunnel from your computer:

```bash
ssh -L 3000:127.0.0.1:3000 user@server
```

Then open:

```text
http://127.0.0.1:3000
```

Private network access:

- Use VPN, Tailscale, or ZeroTier.
- Keep the app reachable only inside the private network.
- Do not open the app port to the public internet.

Public internet access:

- This repository does not provide public deployment defaults.
- If you must expose it publicly, you are responsible for domain setup, ICP filing or local compliance requirements, HTTPS, reverse proxy, firewall rules, strong passwords, monitoring, and backup security.
- Review privacy risks before uploading real travel, identity, booking, payment, or insurance documents.

## Manual Verification / 手动验证

Recommended deployment checks:

```bash
docker compose build
docker compose up -d
docker compose logs travel-planner
docker compose exec travel-planner npx prisma migrate deploy
docker compose exec travel-planner node scripts/seed-admin.mjs
```

Then verify:

- Open `http://127.0.0.1:3000`.
- Log in with `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`.
- Create a trip.
- Restart with `docker compose restart travel-planner`.
- Confirm the trip still exists after restart.
- Confirm `/api/health` returns only basic status, timestamp, and version fields.

## 中文速查

- 默认只监听 `127.0.0.1:3000`。
- 推荐通过 SSH 隧道、VPN、Tailscale 或 ZeroTier 访问。
- 不要把 `.env`、数据库、上传文件、备份文件提交到 Git。
- 首次部署后单独运行 `node scripts/seed-admin.mjs` 创建管理员。
- 容器启动会执行 `prisma migrate deploy`，不会每次强制 seed。
- 公网部署需要你自行处理域名、备案、HTTPS、反向代理、防火墙、强密码和隐私风险。

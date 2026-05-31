# 备份、恢复与文档加密

本文件描述 TraceMe 的数据可靠性边界：上传文件加密、系统备份、备份校验、恢复流程和备份保留策略。

## 文档加密

新上传文件写入 `storage/uploads` 前会加密。

- 算法：AES-256-GCM。
- 密钥来源：`DOCUMENT_ENCRYPTION_KEY`。
- 磁盘文件名随机生成。
- 原始文件名只保存在数据库。
- 数据库保存非机密解密元数据：`encryptionAlgorithm`、`encryptionIv`、`encryptionAuthTag`、`encryptedFileSize`、`fileSha256`、`encryptionVersion` 等。
- 下载必须经过登录、旅行权限和敏感文件权限校验。
- 服务端读取密文后在内存中解密并返回响应。
- 解密后的内容不会写入 `public`。

关键警告：如果 `DOCUMENT_ENCRYPTION_KEY` 丢失或变更，已加密上传文件无法解密。生产环境必须备份该密钥。

## 密钥生成和保存

手动生成示例：

```bash
openssl rand -base64 32
```

Windows PowerShell：

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Docker 生产启动会先运行 `scripts/ensure-production-secrets.mjs`：

- 如果环境变量 `DOCUMENT_ENCRYPTION_KEY` 已配置，直接使用。
- 如果未配置，读取 `DOCUMENT_ENCRYPTION_KEY_FILE` 指向的密钥文件。
- 如果文件不存在，则生成新密钥并写入持久化 secret 文件。

默认 Docker 路径：

```text
/app/storage/secrets/document-encryption-key
```

该路径由 `secrets-data` volume 持久化。即使自动生成，也要把密钥离线备份到密码管理器或安全密钥库。

## 迁移历史明文上传

设置 `DOCUMENT_ENCRYPTION_KEY` 后执行：

```powershell
npm.cmd run db:deploy
npm.cmd run documents:migrate-encryption
```

迁移脚本会：

- 先创建系统备份。
- 扫描未加密的 `Document` 记录。
- 将磁盘文件加密为新的随机存储文件。
- 写入加密元数据。
- 数据库更新成功后删除旧明文文件。
- 失败时保留原文件，并在 `storage/backups` 写入失败报告。

## 系统备份

创建备份：

```powershell
npm.cmd run backup:create -- --notes "before maintenance"
```

列出备份：

```powershell
npm.cmd run backup:list
```

备份文件命名：

```text
travel-planner-backup-YYYYMMDD-HHmmss.zip
```

每个备份包含：

- `manifest.json`
- SQLite 数据库快照
- `storage/uploads`
- 应用版本
- Prisma migration 名称
- 每个文件的 size 和 sha256

备份排除：

- `.env`
- `node_modules`
- `.next`
- logs
- caches
- `storage/backups` 中的旧备份

备份 zip 可能包含旅行行程、住宿地址、票据记录、预算和上传文件。不要上传到不可信网盘、公开分享或发送给 AI。

## 校验备份

```powershell
npm.cmd run backup:verify -- --file travel-planner-backup-YYYYMMDD-HHmmss.zip
```

校验内容：

- zip 格式是否可解析。
- `manifest.json` 是否存在且格式支持。
- manifest 中记录的文件是否都存在。
- 文件大小是否一致。
- sha256 是否一致。
- 是否包含禁止路径，例如 `.env`、`node_modules`、`.next`、`storage/backups`、绝对路径或路径穿越。

## 恢复备份

恢复是 CLI 操作，因为它会替换 SQLite 数据库和上传目录。先停止应用：

```bash
docker compose stop travel-planner
```

执行恢复：

```powershell
npm.cmd run backup:verify -- --file C:\path\travel-planner-backup-YYYYMMDD-HHmmss.zip
npm.cmd run backup:restore -- --file C:\path\travel-planner-backup-YYYYMMDD-HHmmss.zip --confirm-restore
```

恢复命令会：

- 校验备份。
- 创建当前状态的安全备份。
- 将数据库和 uploads 解压到临时路径。
- 通过替换流程切换到恢复数据。
- 失败时尽量回滚到恢复前状态。

恢复后：

```bash
docker compose up -d
docker compose logs --tail=100 travel-planner
```

抽查：

- 登录。
- 旅行列表。
- 行程和地点。
- 文件下载。
- 备份列表。
- `/api/health`。

不要用旧备份覆盖当前 `.env` 或文档加密密钥。

## 备份保留策略

默认保留：

- 最近 7 个 daily。
- 最近 4 个 weekly。

环境变量：

```env
BACKUP_KEEP_DAILY="7"
BACKUP_KEEP_WEEKLY="4"
```

预览清理：

```powershell
npm.cmd run backup:prune -- --dry-run
```

执行清理：

```powershell
npm.cmd run backup:prune
```

清理会删除过期备份文件，并把对应 `BackupRecord` 标记为 `deleted`。

## 管理权限

备份列表、创建、下载和删除都是系统级能力，必须要求管理员。备份文件可能包含整个数据库和上传文件，不能只按普通登录用户授权。

## 测试覆盖

相关测试位于：

- `tests/unit/stage15-security.test.ts`
- `tests/unit/export-backup.test.ts`
- `tests/unit/documents.test.ts`
- `tests/e2e/export-backup.spec.ts`
- `tests/e2e/documents.spec.ts`

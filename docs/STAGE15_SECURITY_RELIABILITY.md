# Stage 15: data reliability, security hardening, backups, and encrypted files

## Document encryption

New uploads are encrypted before they are written to `storage/uploads`.

- Algorithm: `AES-256-GCM`.
- Key source: `DOCUMENT_ENCRYPTION_KEY`.
- The key is never stored in code, returned to the browser, or written to audit logs.
- The original file name is stored only in the database. Disk file names are random.
- The database stores non-secret decrypt metadata: `encryptionAlgorithm`, `encryptionIv`, `encryptionAuthTag`, `encryptedFileSize`, `fileSha256`, and `encryptionVersion`.
- Downloads require login. The server reads the encrypted file, decrypts it in memory, and streams the plaintext response.
- Decrypted content is never written to `public`.

Critical warning: if `DOCUMENT_ENCRYPTION_KEY` is lost or changed, encrypted documents cannot be decrypted. Back up this key in a secure password manager or secrets vault before production use.

Production policy: production validation requires `DOCUMENT_ENCRYPTION_KEY`. Uploads are rejected when the key is missing or invalid, because silently storing sensitive files in plaintext is riskier than blocking the upload.

Recommended key format:

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## Migrating historical plaintext uploads

Run this after setting `DOCUMENT_ENCRYPTION_KEY`:

```powershell
npm.cmd run db:deploy
npm.cmd run documents:migrate-encryption
```

The migration script:

- creates a backup before changing files;
- scans unencrypted `Document` rows;
- encrypts each disk file into a new random storage file;
- writes encryption metadata to the database;
- deletes the old plaintext file only after the database update succeeds;
- records failures in the console and writes a JSON failure report under `storage/backups/document-encryption-migration-failures-YYYYMMDD-HHmmss.json`;
- preserves failed original files.

## Backup commands

```powershell
npm.cmd run backup:create -- --notes "before maintenance"
npm.cmd run backup:list
npm.cmd run backup:verify -- --file travel-planner-backup-YYYYMMDD-HHmmss.zip
npm.cmd run backup:prune -- --dry-run
npm.cmd run backup:prune
```

Backups are zip files named `travel-planner-backup-YYYYMMDD-HHmmss.zip`.
Each backup includes:

- `manifest.json`;
- SQLite database snapshot;
- `storage/uploads`;
- app version;
- Prisma migration names;
- per-file size and sha256.

Backups exclude `.env`, `node_modules`, `.next`, logs, caches, and old files in `storage/backups`.

The default retention plan keeps the latest 7 daily backups and latest 4 weekly backups. Override with `BACKUP_KEEP_DAILY` and `BACKUP_KEEP_WEEKLY`.

## Restore

Restore is intentionally a CLI operation because it replaces the SQLite database and upload directory. Stop the app first.

```powershell
npm.cmd run backup:verify -- --file C:\path\travel-planner-backup-YYYYMMDD-HHmmss.zip
npm.cmd run backup:restore -- --file C:\path\travel-planner-backup-YYYYMMDD-HHmmss.zip --confirm-restore
```

The restore command verifies the zip and manifest, creates a safety backup of the current state, stages database/uploads into temporary paths, and then swaps them into place. If staging fails, the current system is not modified. If the final filesystem swap fails, the script removes any partial restored paths and attempts to roll both the database file and upload directory back to their pre-restore state.

## Audit logs

`AuditLog` records key security and reliability actions:

- login success and failure;
- logout;
- password changes;
- document upload, download, and deletion;
- backup creation, deletion, and restoration, including CLI backup operations with `userId: null`;
- AI setting changes;
- trip deletion and export.

Audit metadata is redacted before storage. It does not store passwords, full API keys, session tokens, cookies, file contents, or encryption keys. IP addresses are masked and hashed with `AUDIT_LOG_IP_SALT` or `SESSION_SECRET`.

## Login and sessions

Login failures are limited independently by username and IP. Error messages stay generic so they do not reveal whether a username exists.

Users can view active sessions at `/settings/sessions` and revoke other sessions. Password changes automatically revoke other sessions while keeping the current one.

## Error logs and Sentry

This stage does not enable Sentry by default. Local structured logging redacts common secrets before writing errors. If Sentry is added later, keep it disabled unless explicitly configured, and redact request bodies, cookies, authorization headers, API keys, passwords, document contents, and URL query parameters before sending any event to a third party.

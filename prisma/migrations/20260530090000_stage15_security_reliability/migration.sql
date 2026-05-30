-- Stage 15: data reliability, encrypted documents, audit logs, and backup checksums.
ALTER TABLE "Document" ADD COLUMN "encryptionAlgorithm" TEXT;
ALTER TABLE "Document" ADD COLUMN "encryptionIv" TEXT;
ALTER TABLE "Document" ADD COLUMN "encryptionAuthTag" TEXT;
ALTER TABLE "Document" ADD COLUMN "encryptedFileSize" INTEGER;
ALTER TABLE "Document" ADD COLUMN "fileSha256" TEXT;
ALTER TABLE "Document" ADD COLUMN "encryptionVersion" INTEGER;

ALTER TABLE "BackupRecord" ADD COLUMN "sha256" TEXT;

ALTER TABLE "Session" ADD COLUMN "ipHash" TEXT;
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ipHash" TEXT,
    "ipMasked" TEXT,
    "userAgent" TEXT,
    "metadataRedacted" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

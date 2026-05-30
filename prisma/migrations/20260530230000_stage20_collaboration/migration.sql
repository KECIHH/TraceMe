-- Stage 20: multi-user collaboration, trip membership, and secure read-only sharing.

CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "canDownloadSensitiveDocuments" BOOLEAN NOT NULL DEFAULT false,
    "invitedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TripShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "expiresAt" DATETIME,
    "lastAccessedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripShareLink_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "TripMember" ("id", "tripId", "userId", "role", "canDownloadSensitiveDocuments", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(16))),
    "Trip"."id",
    "User"."id",
    'OWNER',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Trip"
CROSS JOIN (
    SELECT "id"
    FROM "User"
    WHERE "role" = 'ADMIN'
    ORDER BY "createdAt" ASC
    LIMIT 1
) AS "User"
WHERE NOT EXISTS (
    SELECT 1 FROM "TripMember" WHERE "TripMember"."tripId" = "Trip"."id"
);

CREATE UNIQUE INDEX "TripMember_tripId_userId_key" ON "TripMember"("tripId", "userId");
CREATE INDEX "TripMember_tripId_idx" ON "TripMember"("tripId");
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");
CREATE INDEX "TripMember_role_idx" ON "TripMember"("role");
CREATE INDEX "TripMember_invitedById_idx" ON "TripMember"("invitedById");

CREATE UNIQUE INDEX "TripShareLink_tokenHash_key" ON "TripShareLink"("tokenHash");
CREATE INDEX "TripShareLink_tripId_idx" ON "TripShareLink"("tripId");
CREATE INDEX "TripShareLink_createdById_idx" ON "TripShareLink"("createdById");
CREATE INDEX "TripShareLink_expiresAt_idx" ON "TripShareLink"("expiresAt");
CREATE INDEX "TripShareLink_isEnabled_revokedAt_idx" ON "TripShareLink"("isEnabled", "revokedAt");

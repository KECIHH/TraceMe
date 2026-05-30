-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'parsed',
    "conflictStrategy" TEXT,
    "previewJson" JSONB NOT NULL,
    "validationJson" JSONB NOT NULL,
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportJob_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ImportJob_tripId_idx" ON "ImportJob"("tripId");

-- CreateIndex
CREATE INDEX "ImportJob_userId_idx" ON "ImportJob"("userId");

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

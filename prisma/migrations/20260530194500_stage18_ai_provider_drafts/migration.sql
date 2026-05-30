-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" JSONB,
    "contentText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiDraft_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiDraft_tripId_idx" ON "AiDraft"("tripId");

-- CreateIndex
CREATE INDEX "AiDraft_type_idx" ON "AiDraft"("type");

-- CreateIndex
CREATE INDEX "AiDraft_status_idx" ON "AiDraft"("status");

-- CreateIndex
CREATE INDEX "AiDraft_createdAt_idx" ON "AiDraft"("createdAt");

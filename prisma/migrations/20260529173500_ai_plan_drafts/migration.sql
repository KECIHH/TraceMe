-- CreateTable
CREATE TABLE "AiPlanDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT,
    "inputJson" JSONB NOT NULL,
    "draftJson" JSONB,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiPlanDraft_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiPlanDraft_tripId_idx" ON "AiPlanDraft"("tripId");

-- CreateIndex
CREATE INDEX "AiPlanDraft_status_idx" ON "AiPlanDraft"("status");

-- CreateIndex
CREATE INDEX "AiPlanDraft_createdAt_idx" ON "AiPlanDraft"("createdAt");

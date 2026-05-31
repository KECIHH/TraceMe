-- Stage 21 follow-up: bind AI plan drafts to the user who created them.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AiPlanDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT,
    "createdById" TEXT,
    "inputJson" JSONB NOT NULL,
    "draftJson" JSONB,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiPlanDraft_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AiPlanDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_AiPlanDraft" (
    "id",
    "tripId",
    "createdById",
    "inputJson",
    "draftJson",
    "provider",
    "model",
    "status",
    "errorMessage",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "tripId",
    NULL,
    "inputJson",
    "draftJson",
    "provider",
    "model",
    "status",
    "errorMessage",
    "createdAt",
    "updatedAt"
FROM "AiPlanDraft";

DROP TABLE "AiPlanDraft";
ALTER TABLE "new_AiPlanDraft" RENAME TO "AiPlanDraft";

CREATE INDEX "AiPlanDraft_tripId_idx" ON "AiPlanDraft"("tripId");
CREATE INDEX "AiPlanDraft_createdById_idx" ON "AiPlanDraft"("createdById");
CREATE INDEX "AiPlanDraft_status_idx" ON "AiPlanDraft"("status");
CREATE INDEX "AiPlanDraft_createdAt_idx" ON "AiPlanDraft"("createdAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

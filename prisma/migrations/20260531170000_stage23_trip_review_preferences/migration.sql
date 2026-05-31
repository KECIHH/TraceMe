-- Stage 23: trip reviews and private personal travel preferences.

CREATE TABLE "TripReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "recommendations" JSONB,
    "warnings" JSONB,
    "actualCostAmount" DECIMAL,
    "actualCostCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "actualPace" TEXT,
    "regrets" JSONB,
    "nextTimeAdvice" TEXT,
    "placeTags" JSONB,
    "stayTags" JSONB,
    "transportTags" JSONB,
    "aiDraftJson" JSONB,
    "nextTripSuggestions" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripReview_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TravelPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "sourceReviewId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TravelPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TravelPreference_sourceReviewId_fkey" FOREIGN KEY ("sourceReviewId") REFERENCES "TripReview" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TripReview_tripId_createdById_key" ON "TripReview"("tripId", "createdById");
CREATE INDEX "TripReview_tripId_idx" ON "TripReview"("tripId");
CREATE INDEX "TripReview_createdById_idx" ON "TripReview"("createdById");
CREATE INDEX "TripReview_status_idx" ON "TripReview"("status");
CREATE INDEX "TripReview_updatedAt_idx" ON "TripReview"("updatedAt");

CREATE UNIQUE INDEX "TravelPreference_userId_key_key" ON "TravelPreference"("userId", "key");
CREATE INDEX "TravelPreference_userId_idx" ON "TravelPreference"("userId");
CREATE INDEX "TravelPreference_visibility_idx" ON "TravelPreference"("visibility");
CREATE INDEX "TravelPreference_sourceReviewId_idx" ON "TravelPreference"("sourceReviewId");
CREATE INDEX "TravelPreference_updatedAt_idx" ON "TravelPreference"("updatedAt");

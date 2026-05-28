-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ItineraryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "placeId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CUSTOM',
    "startTime" DATETIME,
    "endTime" DATETIME,
    "durationMin" INTEGER,
    "costEstimate" DECIMAL,
    "bookingStatus" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "transportToNext" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItineraryItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItineraryItem_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ItineraryDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItineraryItem_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ItineraryItem" (
    "bookingStatus",
    "costEstimate",
    "createdAt",
    "dayId",
    "durationMin",
    "endTime",
    "id",
    "notes",
    "placeId",
    "priority",
    "sortOrder",
    "startTime",
    "status",
    "title",
    "transportToNext",
    "tripId",
    "type",
    "updatedAt"
)
SELECT
    "bookingStatus",
    "costEstimate",
    "createdAt",
    "dayId",
    "durationMin",
    "endTime",
    "id",
    "notes",
    "placeId",
    "priority",
    "sortOrder",
    "startTime",
    "status",
    "title",
    "transportToNext",
    "tripId",
    CASE "type"
        WHEN 'PLACE' THEN 'ATTRACTION'
        WHEN 'MEAL' THEN 'DINING'
        WHEN 'CHECK_IN' THEN 'LODGING'
        WHEN 'ACTIVITY' THEN 'SHOPPING'
        WHEN 'OTHER' THEN 'CUSTOM'
        ELSE "type"
    END,
    "updatedAt"
FROM "ItineraryItem";
DROP TABLE "ItineraryItem";
ALTER TABLE "new_ItineraryItem" RENAME TO "ItineraryItem";
CREATE INDEX "ItineraryItem_tripId_idx" ON "ItineraryItem"("tripId");
CREATE INDEX "ItineraryItem_dayId_idx" ON "ItineraryItem"("dayId");
CREATE INDEX "ItineraryItem_placeId_idx" ON "ItineraryItem"("placeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

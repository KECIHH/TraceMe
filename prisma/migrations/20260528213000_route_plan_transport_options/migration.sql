-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TransportOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "routePlanId" TEXT,
    "fromName" TEXT NOT NULL,
    "toName" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'OTHER',
    "provider" TEXT,
    "trainOrFlightNo" TEXT,
    "departTime" DATETIME,
    "arriveTime" DATETIME,
    "doorToDoorMinutes" INTEGER,
    "price" DECIMAL,
    "currency" TEXT,
    "transferCount" INTEGER,
    "comfortScore" INTEGER,
    "riskScore" INTEGER,
    "luggageFriendlyScore" INTEGER,
    "flexibilityScore" INTEGER,
    "bookingUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportOption_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportOption_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TransportOption" (
    "arriveTime",
    "bookingUrl",
    "comfortScore",
    "createdAt",
    "currency",
    "departTime",
    "doorToDoorMinutes",
    "flexibilityScore",
    "fromName",
    "id",
    "luggageFriendlyScore",
    "mode",
    "notes",
    "price",
    "provider",
    "riskScore",
    "status",
    "toName",
    "trainOrFlightNo",
    "transferCount",
    "tripId",
    "updatedAt"
)
SELECT
    "arriveTime",
    "bookingUrl",
    "comfortScore",
    "createdAt",
    "currency",
    "departTime",
    "doorToDoorMinutes",
    "flexibilityScore",
    "fromName",
    "id",
    "luggageFriendlyScore",
    "mode",
    "notes",
    "price",
    "provider",
    "riskScore",
    CASE "status"
      WHEN 'BOOKED' THEN 'BOOKED'
      WHEN 'CANCELLED' THEN 'CANCELLED'
      ELSE 'CANDIDATE'
    END,
    "toName",
    "trainOrFlightNo",
    "transferCount",
    "tripId",
    "updatedAt"
FROM "TransportOption";
DROP TABLE "TransportOption";
ALTER TABLE "new_TransportOption" RENAME TO "TransportOption";
CREATE INDEX "TransportOption_tripId_idx" ON "TransportOption"("tripId");
CREATE INDEX "TransportOption_routePlanId_idx" ON "TransportOption"("routePlanId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

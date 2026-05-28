-- CreateTable
CREATE TABLE "FoodDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "recommendedDishes" JSONB,
    "averageCost" DECIMAL,
    "foodStatus" TEXT NOT NULL DEFAULT 'WANT_TO_TRY',
    "reservationNeeded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodDetail_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StayDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "checkInDate" DATETIME,
    "checkOutDate" DATETIME,
    "bookingStatus" TEXT NOT NULL DEFAULT 'CONSIDERING',
    "totalCost" DECIMAL,
    "breakfastIncluded" BOOLEAN NOT NULL DEFAULT false,
    "luggageStorage" BOOLEAN NOT NULL DEFAULT false,
    "cancellationPolicy" TEXT,
    "bookingReference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StayDetail_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategoryBudget_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodDetail_placeId_key" ON "FoodDetail"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "StayDetail_placeId_key" ON "StayDetail"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_tripId_category_key" ON "CategoryBudget"("tripId", "category");

-- CreateIndex
CREATE INDEX "CategoryBudget_tripId_idx" ON "CategoryBudget"("tripId");

-- Stage 17: external data cache models for weather and exchange rates.
CREATE TABLE "WeatherSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "destinationId" TEXT,
    "locationName" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "date" DATETIME NOT NULL,
    "temperatureMin" REAL,
    "temperatureMax" REAL,
    "condition" TEXT,
    "precipitationProbability" INTEGER,
    "wind" TEXT,
    "source" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" JSONB,
    "manualNote" TEXT,
    CONSTRAINT "WeatherSnapshot_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeatherSnapshot_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT,
    "baseCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "rate" DECIMAL NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validDate" DATETIME NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CurrencyRate_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WeatherSnapshot_tripId_idx" ON "WeatherSnapshot"("tripId");
CREATE INDEX "WeatherSnapshot_destinationId_idx" ON "WeatherSnapshot"("destinationId");
CREATE INDEX "WeatherSnapshot_tripId_date_idx" ON "WeatherSnapshot"("tripId", "date");
CREATE INDEX "WeatherSnapshot_source_fetchedAt_idx" ON "WeatherSnapshot"("source", "fetchedAt");

CREATE INDEX "CurrencyRate_tripId_idx" ON "CurrencyRate"("tripId");
CREATE INDEX "CurrencyRate_baseCurrency_targetCurrency_validDate_idx" ON "CurrencyRate"("baseCurrency", "targetCurrency", "validDate");
CREATE INDEX "CurrencyRate_source_fetchedAt_idx" ON "CurrencyRate"("source", "fetchedAt");

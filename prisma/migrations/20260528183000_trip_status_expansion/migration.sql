-- Normalize existing status values after expanding the TripStatus enum.
UPDATE "Trip" SET "status" = 'INSPIRATION' WHERE "status" = 'DRAFT';
UPDATE "Trip" SET "status" = 'TRAVELING' WHERE "status" = 'ACTIVE';

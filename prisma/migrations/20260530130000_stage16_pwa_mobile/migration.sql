ALTER TABLE "Document" ADD COLUMN "thumbnailPath" TEXT;
ALTER TABLE "Document" ADD COLUMN "thumbnailMimeType" TEXT;
ALTER TABLE "Document" ADD COLUMN "thumbnailFileSize" INTEGER;
ALTER TABLE "Document" ADD COLUMN "imageWasCompressed" BOOLEAN NOT NULL DEFAULT false;

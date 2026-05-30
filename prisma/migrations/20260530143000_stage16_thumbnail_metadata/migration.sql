ALTER TABLE "Document" ADD COLUMN "thumbnailEncryptionAlgorithm" TEXT;
ALTER TABLE "Document" ADD COLUMN "thumbnailEncryptionIv" TEXT;
ALTER TABLE "Document" ADD COLUMN "thumbnailEncryptionAuthTag" TEXT;
ALTER TABLE "Document" ADD COLUMN "thumbnailEncryptedFileSize" INTEGER;
ALTER TABLE "Document" ADD COLUMN "thumbnailSha256" TEXT;
ALTER TABLE "Document" ADD COLUMN "thumbnailEncryptionVersion" INTEGER;

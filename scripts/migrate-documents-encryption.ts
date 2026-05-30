import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env", override: false });

const failures: Array<{ documentId: string; error: string; filePath: string }> = [];

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const { BACKUP_STORAGE_DIR, createSystemBackup } = await import("../src/lib/backup/index");
  const {
    encryptDocumentBuffer,
    getDocumentEncryptionStatus,
  } = await import("../src/lib/document-encryption");
  const { resolveUploadPath, UPLOAD_STORAGE_DIR } = await import("../src/lib/documents");
  const { prisma } = await import("../src/lib/prisma");

  try {
  const status = getDocumentEncryptionStatus();
  if (!status.ready) {
    throw new Error(status.message);
  }

  console.log("Creating pre-migration backup...");
  const backup = await createSystemBackup("Pre-document-encryption-migration backup");
  if (!backup.ok) {
    throw new Error("Pre-migration backup failed; aborting.");
  }
  console.log(`Backup created: ${backup.record.fileName}`);

  const documents = await prisma.document.findMany({
    where: { isEncrypted: false },
  });

  console.log(`Found ${documents.length} unencrypted document(s).`);
  await mkdir(UPLOAD_STORAGE_DIR, { recursive: true });

  for (const document of documents) {
    const oldFilePath = document.filePath;

    try {
      const oldPath = resolveUploadPath(oldFilePath);
      const plain = await readFile(oldPath);
      const encrypted = encryptDocumentBuffer(plain);
      const extension = path.extname(oldFilePath) || ".bin";
      const newFileName = `${randomUUID()}${extension.toLowerCase()}`;
      const newPath = resolveUploadPath(newFileName);
      const tempPath = `${newPath}.tmp`;

      await writeFile(tempPath, encrypted.ciphertext);
      await rename(tempPath, newPath);

      await prisma.document.update({
        data: {
          encryptedFileSize: encrypted.encryptedFileSize,
          encryptionAlgorithm: encrypted.encryptionAlgorithm,
          encryptionAuthTag: encrypted.encryptionAuthTag,
          encryptionIv: encrypted.encryptionIv,
          encryptionVersion: encrypted.encryptionVersion,
          filePath: newFileName,
          fileSha256: encrypted.fileSha256,
          isEncrypted: true,
        },
        where: { id: document.id },
      });

      await unlink(oldPath);
      console.log(`Encrypted document ${document.id}`);
    } catch (error) {
      failures.push({
        documentId: document.id,
        error: error instanceof Error ? error.message : "Unknown error",
        filePath: oldFilePath,
      });
      console.error(`Failed document ${document.id}; original file preserved.`);
    }
  }

  if (failures.length > 0) {
    const failureReportPath = await writeFailureReport(failures, BACKUP_STORAGE_DIR);

    console.error("Migration finished with failures:");
    console.error(JSON.stringify(failures, null, 2));
    console.error(`Failure report written to ${failureReportPath}`);
    process.exitCode = 1;
  } else {
    console.log("Document encryption migration completed successfully.");
  }
  } finally {
    await prisma.$disconnect();
  }
}

async function writeFailureReport(
  failedDocuments: Array<{ documentId: string; error: string; filePath: string }>,
  backupStorageDir: string,
): Promise<string> {
  await mkdir(backupStorageDir, { recursive: true });

  const now = new Date();
  const failureReportPath = path.join(
    backupStorageDir,
    `document-encryption-migration-failures-${formatTimestamp(now)}.json`,
  );

  await writeFile(
    failureReportPath,
    JSON.stringify(
      {
        createdAt: now.toISOString(),
        failures: failedDocuments,
        warning:
          "Original files were preserved for failed documents. This report contains storage paths only, not file contents or encryption keys.",
      },
      null,
      2,
    ),
    "utf8",
  );

  return failureReportPath;
}

function formatTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}

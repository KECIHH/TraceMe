import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env", override: false });

const command = process.argv[2];
const args = process.argv.slice(3);

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const {
    createSystemBackup,
    listBackupFiles,
    pruneBackups,
    restoreBackupFile,
    verifyBackupFile,
  } = await import("../src/lib/backup/index");
  const { writeAuditLog } = await import("../src/lib/audit");
  const { prisma } = await import("../src/lib/prisma");

  try {
    if (command === "create") {
      const notes = readOption("--notes") ?? "CLI backup";
      const result = await createSystemBackup(notes);

      if (!result.ok) {
        console.error(`Backup failed: ${result.record.notes ?? "unknown error"}`);
        process.exitCode = 1;
      } else {
        await writeAuditLog({
          action: "backup.created",
          entityId: result.record.id,
          entityType: "BackupRecord",
          metadata: { fileName: result.record.fileName, source: "cli" },
          userId: null,
        });
        console.log(`Created ${result.record.fileName}`);
        console.log(`sha256 ${result.record.sha256}`);
      }
    } else if (command === "list") {
      const [records, files] = await Promise.all([
        prisma.backupRecord.findMany({ orderBy: { createdAt: "desc" } }),
        listBackupFiles(),
      ]);
      const fileNames = new Set(files.map((file) => file.fileName));

      for (const record of records) {
        console.log(
          [
            record.createdAt.toISOString(),
            record.status,
            fileNames.has(record.fileName) ? "present" : "missing",
            record.fileName,
            record.sha256 ?? "no-sha256",
          ].join(" "),
        );
      }
    } else if (command === "verify") {
      const target = readOption("--file") ?? args[0];
      if (!target) {
        throw new Error("Usage: npm run backup:verify -- --file <backup.zip>");
      }

      const result = await verifyBackupFile(target);
      if (!result.ok) {
        console.error(`Backup verification failed:\n- ${result.errors.join("\n- ")}`);
        process.exitCode = 1;
      } else {
        console.log("Backup verification passed.");
        console.log(`archiveSha256 ${result.archiveSha256}`);
        console.log(`createdAt ${result.manifest.createdAt}`);
        console.log(`files ${result.manifest.files.length}`);
      }
    } else if (command === "restore") {
      const target = readOption("--file") ?? args[0];
      const confirmed = args.includes("--confirm-restore");

      if (!target || !confirmed) {
        throw new Error(
          "Usage: npm run backup:restore -- --file <backup.zip> --confirm-restore",
        );
      }

      const result = await restoreBackupFile(target, { confirm: true });
      await writeAuditLog({
        action: "backup.restored",
        entityId: result.safetyBackupRecordId,
        entityType: "BackupRecord",
        metadata: { backup: target, source: "cli" },
        userId: null,
      });
      console.log(`Restore completed. Safety backup record: ${result.safetyBackupRecordId}`);
    } else if (command === "prune") {
      const dryRun = args.includes("--dry-run");
      const result = await pruneBackups({ dryRun });

      if (!dryRun) {
        await Promise.all(
          result.pruned.map((item) =>
            writeAuditLog({
              action: "backup.deleted",
              entityId: item.fileName,
              entityType: "BackupRecord",
              metadata: { fileName: item.fileName, reason: item.reason, source: "cli" },
              userId: null,
            }),
          ),
        );
      }

      for (const item of result.plan) {
        console.log(`${item.keep ? "keep" : dryRun ? "would-prune" : "pruned"} ${item.fileName} ${item.reason}`);
      }
    } else {
      throw new Error("Usage: npm run backup:<create|list|verify|restore|prune>");
    }
  } finally {
    await prisma.$disconnect();
  }
}

function readOption(name: string): string | null {
  const index = args.indexOf(name);

  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

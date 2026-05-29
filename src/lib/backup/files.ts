import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { BACKUP_STORAGE_DIR } from "./paths";

export type BackupFileEntry = {
  fileName: string;
  filePath: string;
  fileSize: number;
  modifiedAt: Date;
};

export function formatBackupFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${unitIndex === 0 || value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export async function listBackupFiles(
  backupDir = BACKUP_STORAGE_DIR,
): Promise<BackupFileEntry[]> {
  await mkdir(/*turbopackIgnore: true*/ backupDir, { recursive: true });
  const entries = await readdir(/*turbopackIgnore: true*/ backupDir, {
    withFileTypes: true,
  });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".zip"))
      .map(async (entry) => {
        const filePath = path.join(backupDir, entry.name);
        const stats = await stat(/*turbopackIgnore: true*/ filePath);

        return {
          fileName: entry.name,
          filePath,
          fileSize: stats.size,
          modifiedAt: stats.mtime,
        };
      }),
  );

  return files.sort((first, second) => second.modifiedAt.getTime() - first.modifiedAt.getTime());
}

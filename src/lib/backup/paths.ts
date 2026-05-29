import path from "node:path";

export const BACKUP_STORAGE_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "storage",
  "backups",
);

export function resolveBackupPath(fileName: string): string {
  if (
    fileName !== path.basename(fileName) ||
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    !fileName.endsWith(".zip")
  ) {
    throw new Error("Unsafe backup file name.");
  }

  const backupDir = path.resolve(BACKUP_STORAGE_DIR);
  const resolvedPath = path.resolve(backupDir, fileName);

  if (!resolvedPath.startsWith(`${backupDir}${path.sep}`)) {
    throw new Error("Unsafe backup path.");
  }

  return resolvedPath;
}

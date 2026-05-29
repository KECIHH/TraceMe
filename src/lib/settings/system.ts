import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { getAiProviderConfig } from "@/lib/ai";
import packageJson from "../../../package.json";

export const APP_NAME = "TraceMe";
export const DATABASE_TYPE = "SQLite";
export const UPLOAD_STORAGE_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "storage",
  "uploads",
);
export const BACKUP_STORAGE_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "storage",
  "backups",
);

const SENSITIVE_ENV_KEY_PATTERNS = [
  /SECRET/i,
  /PASSWORD/i,
  /TOKEN/i,
  /API[_-]?KEY/i,
  /ENCRYPTION[_-]?KEY/i,
  /DATABASE_URL/i,
  /SESSION/i,
];

export type DirectoryStatus = {
  exists: boolean;
  fileCount: number;
  label: string;
  readable: boolean;
  totalBytes: number;
};

export type SystemCounts = {
  backupBytes: number;
  backupFileCount: number;
  documentCount: number;
  documentRecordBytes: number;
  itineraryItemCount: number;
  placeCount: number;
  recentBackupAt: Date | null;
  tripCount: number;
  uploadBytes: number;
  uploadFileCount: number;
};

export type SystemOverview = SystemCounts & {
  aiApiKeyConfigured: boolean;
  aiConfigured: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  appName: string;
  appVersion: string;
  backupDirectory: DirectoryStatus;
  currentTime: Date;
  databaseConnected: boolean;
  databaseType: string;
  nodeEnv: string;
  uploadDirectory: DirectoryStatus;
};

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${unitIndex === 0 || value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function sanitizeEnvironmentSnapshot(
  env: Record<string, string | undefined>,
) {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => !isSensitiveEnvironmentKey(key))
      .map(([key, value]) => [key, value ?? ""]),
  );
}

export function isSensitiveEnvironmentKey(key: string): boolean {
  return SENSITIVE_ENV_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function calculateSystemCounts(input: {
  backupBytes: number;
  backupFileCount: number;
  documentCount: number;
  documentRecordBytes?: number | null;
  itineraryItemCount: number;
  placeCount: number;
  recentBackupAt?: Date | null;
  tripCount: number;
  uploadBytes: number;
  uploadFileCount: number;
}): SystemCounts {
  return {
    backupBytes: Math.max(0, input.backupBytes),
    backupFileCount: Math.max(0, input.backupFileCount),
    documentCount: Math.max(0, input.documentCount),
    documentRecordBytes: Math.max(0, input.documentRecordBytes ?? 0),
    itineraryItemCount: Math.max(0, input.itineraryItemCount),
    placeCount: Math.max(0, input.placeCount),
    recentBackupAt: input.recentBackupAt ?? null,
    tripCount: Math.max(0, input.tripCount),
    uploadBytes: Math.max(0, input.uploadBytes),
    uploadFileCount: Math.max(0, input.uploadFileCount),
  };
}

export async function getSystemOverview(
  options: {
    aiEnabled?: boolean;
    appVersion?: string;
    backupDir?: string;
    currentTime?: Date;
    env?: Record<string, string | undefined>;
    uploadDir?: string;
  } = {},
): Promise<SystemOverview> {
  const env = options.env ?? process.env;
  const [databaseConnected, uploadDirectory, backupDirectory] =
    await Promise.all([
      checkDatabaseConnection(),
      getDirectoryStatus("上传目录", options.uploadDir ?? UPLOAD_STORAGE_DIR),
      getDirectoryStatus("备份目录", options.backupDir ?? BACKUP_STORAGE_DIR),
    ]);
  const counts = databaseConnected
    ? await getDatabaseCounts(uploadDirectory, backupDirectory)
    : calculateSystemCounts({
        backupBytes: backupDirectory.totalBytes,
        backupFileCount: backupDirectory.fileCount,
        documentCount: 0,
        itineraryItemCount: 0,
        placeCount: 0,
        tripCount: 0,
        uploadBytes: uploadDirectory.totalBytes,
        uploadFileCount: uploadDirectory.fileCount,
      });
  const aiConfig = getAiProviderConfig(env);

  return {
    ...counts,
    aiApiKeyConfigured: Boolean(env.OPENAI_API_KEY?.trim()),
    aiConfigured: aiConfig.configured,
    aiEnabled: options.aiEnabled ?? true,
    aiProvider: aiConfig.provider,
    appName: APP_NAME,
    appVersion: options.appVersion ?? packageJson.version,
    backupDirectory,
    currentTime: options.currentTime ?? new Date(),
    databaseConnected,
    databaseType: DATABASE_TYPE,
    nodeEnv: env.NODE_ENV ?? "development",
    uploadDirectory,
  };
}

export async function getDirectoryStatus(
  label: string,
  directory: string,
): Promise<DirectoryStatus> {
  const rootStats = await stat(/*turbopackIgnore: true*/ directory).catch(
    () => null,
  );

  if (!rootStats?.isDirectory()) {
    return {
      exists: false,
      fileCount: 0,
      label,
      readable: false,
      totalBytes: 0,
    };
  }

  const usage = await getDirectoryUsage(directory).catch(() => null);

  return {
    exists: true,
    fileCount: usage?.fileCount ?? 0,
    label,
    readable: Boolean(usage),
    totalBytes: usage?.totalBytes ?? 0,
  };
}

async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function getDatabaseCounts(
  uploadDirectory: DirectoryStatus,
  backupDirectory: DirectoryStatus,
): Promise<SystemCounts> {
  const [
    tripCount,
    placeCount,
    itineraryItemCount,
    documentCount,
    documentSize,
    recentBackup,
  ] = await Promise.all([
    prisma.trip.count(),
    prisma.place.count(),
    prisma.itineraryItem.count(),
    prisma.document.count(),
    prisma.document.aggregate({ _sum: { fileSize: true } }),
    prisma.backupRecord.findFirst({
      orderBy: { createdAt: "desc" },
      where: { status: "success" },
    }),
  ]);

  return calculateSystemCounts({
    backupBytes: backupDirectory.totalBytes,
    backupFileCount: backupDirectory.fileCount,
    documentCount,
    documentRecordBytes: documentSize._sum.fileSize,
    itineraryItemCount,
    placeCount,
    recentBackupAt: recentBackup?.createdAt ?? null,
    tripCount,
    uploadBytes: uploadDirectory.totalBytes,
    uploadFileCount: uploadDirectory.fileCount,
  });
}

async function getDirectoryUsage(directory: string): Promise<{
  fileCount: number;
  totalBytes: number;
}> {
  const entries = await readdir(/*turbopackIgnore: true*/ directory, {
    withFileTypes: true,
  });
  let fileCount = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const nested = await getDirectoryUsage(fullPath);
      fileCount += nested.fileCount;
      totalBytes += nested.totalBytes;
    } else if (entry.isFile() && entry.name !== ".gitkeep") {
      const fileStats = await stat(/*turbopackIgnore: true*/ fullPath);
      fileCount += 1;
      totalBytes += fileStats.size;
    }
  }

  return { fileCount, totalBytes };
}

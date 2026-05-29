import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";

import { BACKUP_STORAGE_DIR, resolveBackupPath } from "./paths";

export { deleteBackupRecord } from "./delete";
export { formatBackupFileSize, listBackupFiles } from "./files";
export { BACKUP_STORAGE_DIR, resolveBackupPath } from "./paths";

export const UPLOADS_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "storage",
  "uploads",
);

export type BackupManifest = {
  app: "TraceMe";
  createdAt: string;
  excluded: string[];
  files: Array<{ path: string; size: number }>;
  format: "zip";
  privacyWarning: string;
  schemaVersion: 1;
};

type ZipEntryInput = {
  data: Buffer;
  path: string;
};

type DatabaseSnapshot = {
  archiveName: string;
  path: string;
};

export function generateBackupFileName(createdAt = new Date()): string {
  return `travel-planner-backup-${formatBackupTimestamp(createdAt)}.zip`;
}

export function generateBackupManifest(input: {
  createdAt?: Date;
  files: Array<{ path: string; size: number }>;
}): BackupManifest {
  return {
    app: "TraceMe",
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    excluded: [".env", "node_modules", ".next", "logs", "运行缓存"],
    files: input.files,
    format: "zip",
    privacyWarning:
      "备份文件可能包含旅行行程、住宿地址、票据记录、预算和上传文件，请勿上传到不可信网盘、公开分享或发送给 AI。",
    schemaVersion: 1,
  };
}

export async function createSystemBackup(notes?: string) {
  const createdAt = new Date();
  const fileName = generateBackupFileName(createdAt);
  const backupPath = resolveBackupPath(fileName);
  let databaseSnapshot: DatabaseSnapshot | null = null;

  try {
    await mkdir(/*turbopackIgnore: true*/ BACKUP_STORAGE_DIR, { recursive: true });
    databaseSnapshot = await createSqliteDatabaseSnapshot();
    const entries = await collectBackupEntries(createdAt, databaseSnapshot);
    const archive = createZipArchive(entries);

    await writeFile(/*turbopackIgnore: true*/ backupPath, archive);

    const record = await prisma.backupRecord.create({
      data: {
        fileName,
        filePath: backupRelativePath(fileName),
        fileSize: archive.length,
        notes: notes?.trim() || null,
        status: "success",
      },
    });

    return { ok: true as const, record };
  } catch (error) {
    await unlink(/*turbopackIgnore: true*/ backupPath).catch(() => {});

    const record = await prisma.backupRecord.create({
      data: {
        fileName,
        filePath: backupRelativePath(fileName),
        fileSize: 0,
        notes: `备份失败：${error instanceof Error ? error.message : "未知错误"}`,
        status: "failed",
      },
    });

    return { error, ok: false as const, record };
  } finally {
    if (databaseSnapshot) {
      await unlink(/*turbopackIgnore: true*/ databaseSnapshot.path).catch(
        () => {},
      );
    }
  }
}

async function collectBackupEntries(
  createdAt: Date,
  databaseSnapshot: DatabaseSnapshot,
): Promise<ZipEntryInput[]> {
  const databaseFiles = await collectDatabaseFiles(databaseSnapshot);
  const uploadFiles = await collectUploadFiles();
  const manifestFiles = [...databaseFiles, ...uploadFiles].map((entry) => ({
    path: entry.path,
    size: entry.data.length,
  }));
  const manifest = generateBackupManifest({ createdAt, files: manifestFiles });

  return [
    {
      data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      path: "manifest.json",
    },
    ...databaseFiles,
    ...uploadFiles,
  ];
}

async function collectDatabaseFiles(
  databaseSnapshot: DatabaseSnapshot,
): Promise<ZipEntryInput[]> {
  return [
    {
      data: await readFile(/*turbopackIgnore: true*/ databaseSnapshot.path),
      path: `database/${databaseSnapshot.archiveName}`,
    },
  ];
}

async function collectUploadFiles(): Promise<ZipEntryInput[]> {
  const uploadStats = await stat(/*turbopackIgnore: true*/ UPLOADS_DIR).catch(
    () => null,
  );

  if (!uploadStats?.isDirectory()) {
    return [];
  }

  return collectFilesRecursively(UPLOADS_DIR, "storage/uploads");
}

async function collectFilesRecursively(
  directory: string,
  zipPrefix: string,
): Promise<ZipEntryInput[]> {
  const entries = await readdir(/*turbopackIgnore: true*/ directory, {
    withFileTypes: true,
  });
  const files: ZipEntryInput[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(
        ...(await collectFilesRecursively(
          fullPath,
          `${zipPrefix}/${safeZipSegment(entry.name)}`,
        )),
      );
    } else if (entry.isFile() && entry.name !== ".gitkeep") {
      files.push({
        data: await readFile(/*turbopackIgnore: true*/ fullPath),
        path: `${zipPrefix}/${safeZipSegment(entry.name)}`,
      });
    }
  }

  return files;
}

function createZipArchive(entries: ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path.replaceAll("\\", "/"), "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const { date, time } = toDosDateTime(new Date());
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function resolveSqliteDatabasePath(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl?.startsWith("file:")) {
    throw new Error("当前仅支持 SQLite file: 数据库备份。");
  }

  const rawPath = databaseUrl.replace(/^file:/, "").replace(/^"|"$/g, "");
  const normalizedPath = rawPath.startsWith("//") ? rawPath.slice(2) : rawPath;

  if (path.isAbsolute(normalizedPath)) {
    return normalizedPath;
  }

  const cwd =
    process.env.TRACEME_PROJECT_ROOT ??
    /*turbopackIgnore: true*/ process.cwd();
  const candidates = [
    path.resolve(cwd, "prisma", normalizedPath),
    path.resolve(cwd, normalizedPath),
  ];

  return candidates.find((candidate) => statSyncSafe(candidate)) ?? candidates[0];
}

function statSyncSafe(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

async function createSqliteDatabaseSnapshot(): Promise<DatabaseSnapshot> {
  const databasePath = resolveSqliteDatabasePath();
  const fileStats = await stat(/*turbopackIgnore: true*/ databasePath).catch(
    () => null,
  );

  if (!fileStats?.isFile()) {
    throw new Error("SQLite 数据库文件不存在，无法创建备份。");
  }

  await mkdir(/*turbopackIgnore: true*/ BACKUP_STORAGE_DIR, { recursive: true });

  const snapshotPath = path.join(
    BACKUP_STORAGE_DIR,
    `.snapshot-${randomUUID()}.db`,
  );

  await prisma.$executeRawUnsafe(
    `VACUUM INTO ${quoteSqliteString(snapshotPath)}`,
  );

  return {
    archiveName: path.basename(databasePath),
    path: snapshotPath,
  };
}

function safeZipSegment(value: string): string {
  return value.replaceAll("\\", "/").split("/").filter(Boolean).join("-");
}

function backupRelativePath(fileName: string): string {
  return path.join("storage", "backups", fileName).replaceAll("\\", "/");
}

function quoteSqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function formatBackupTimestamp(date: Date): string {
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

function toDosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);

  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

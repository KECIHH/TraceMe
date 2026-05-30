import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { sha256Hex } from "@/lib/crypto-utils";
import { prisma } from "@/lib/prisma";

import { listBackupFiles } from "./files";
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
  appVersion: string;
  createdAt: string;
  excluded: string[];
  files: Array<{ path: string; sha256: string; size: number }>;
  format: "zip";
  privacyWarning: string;
  schema: {
    database: "sqlite";
    migrations: string[];
  };
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
  files: Array<{ path: string; sha256?: string; size: number }>;
  migrations?: string[];
}): BackupManifest {
  return {
    app: "TraceMe",
    appVersion: getAppVersion(),
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    excluded: [".env", "node_modules", ".next", "logs", "运行缓存"],
    files: input.files.map((file) => ({
      path: file.path,
      sha256: file.sha256 ?? "",
      size: file.size,
    })),
    format: "zip",
    privacyWarning:
      "备份文件可能包含旅行行程、住宿地址、票据记录、预算和上传文件，请勿上传到不可信网盘、公开分享或发送给 AI。",
    schema: {
      database: "sqlite",
      migrations: input.migrations ?? [],
    },
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
    const archiveSha256 = sha256Hex(archive);

    await writeFile(/*turbopackIgnore: true*/ backupPath, archive);

    const record = await prisma.backupRecord.create({
      data: {
        fileName,
        filePath: backupRelativePath(fileName),
        fileSize: archive.length,
        sha256: archiveSha256,
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
    sha256: sha256Hex(entry.data),
    size: entry.data.length,
  }));
  const manifest = generateBackupManifest({
    createdAt,
    files: manifestFiles,
    migrations: await listPrismaMigrations(),
  });

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

export type BackupVerificationResult =
  | { ok: true; archiveSha256: string; manifest: BackupManifest }
  | { errors: string[]; ok: false };

export async function verifyBackupFile(fileNameOrPath: string): Promise<BackupVerificationResult> {
  const backupPath = path.isAbsolute(fileNameOrPath)
    ? fileNameOrPath
    : resolveBackupPath(fileNameOrPath);
  const archive = await readFile(/*turbopackIgnore: true*/ backupPath);
  const archiveSha256 = sha256Hex(archive);
  let entries: ZipEntryInput[];

  try {
    entries = parseZipArchive(archive);
  } catch (error) {
    return {
      errors: [
        `Invalid backup zip: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
      ok: false,
    };
  }

  const errors: string[] = [];
  const manifestEntry = entries.find((entry) => entry.path === "manifest.json");

  if (!manifestEntry) {
    return { errors: ["manifest.json is missing."], ok: false };
  }

  const manifest = parseManifest(manifestEntry.data, errors);

  if (!manifest) {
    return { errors, ok: false };
  }

  if (manifest.app !== "TraceMe") {
    errors.push("manifest app is not TraceMe.");
  }

  if (manifest.format !== "zip" || manifest.schemaVersion !== 1) {
    errors.push("manifest format or schemaVersion is unsupported.");
  }

  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));

  for (const file of manifest.files) {
    const entry = entriesByPath.get(file.path);

    if (!entry) {
      errors.push(`missing file: ${file.path}`);
      continue;
    }

    if (entry.data.length !== file.size) {
      errors.push(`size mismatch: ${file.path}`);
    }

    if (file.sha256 && sha256Hex(entry.data) !== file.sha256) {
      errors.push(`sha256 mismatch: ${file.path}`);
    }
  }

  for (const entry of entries) {
    if (
      entry.path.includes("..") ||
      entry.path.startsWith("/") ||
      entry.path.includes("\\") ||
      entry.path === ".env" ||
      entry.path.startsWith("node_modules/") ||
      entry.path.startsWith(".next/") ||
      entry.path.startsWith("storage/backups/")
    ) {
      errors.push(`forbidden archive path: ${entry.path}`);
    }
  }

  return errors.length > 0 ? { errors, ok: false } : { archiveSha256, manifest, ok: true };
}

export type BackupPruneCandidate = {
  fileName: string;
  keep: boolean;
  reason: string;
};

export function planBackupPrune(
  backups: Array<{ createdAt?: Date; fileName: string; modifiedAt?: Date }>,
  options: { daily?: number; weekly?: number } = {},
): BackupPruneCandidate[] {
  const daily = options.daily ?? Number(process.env.BACKUP_KEEP_DAILY ?? 7);
  const weekly = options.weekly ?? Number(process.env.BACKUP_KEEP_WEEKLY ?? 4);
  const sorted = [...backups].sort(
    (first, second) =>
      backupDate(second).getTime() - backupDate(first).getTime(),
  );
  const keep = new Map<string, string>();
  const dailyDates = new Set<string>();
  const weeklyKeys = new Set<string>();

  for (const backup of sorted) {
    const date = backupDate(backup);
    const dateKey = date.toISOString().slice(0, 10);

    if (dailyDates.size < daily && !dailyDates.has(dateKey)) {
      dailyDates.add(dateKey);
      keep.set(backup.fileName, "daily");
      continue;
    }

    const weekKey = isoWeekKey(date);
    if (weeklyKeys.size < weekly && !weeklyKeys.has(weekKey)) {
      weeklyKeys.add(weekKey);
      keep.set(backup.fileName, "weekly");
    }
  }

  return sorted.map((backup) => ({
    fileName: backup.fileName,
    keep: keep.has(backup.fileName),
    reason: keep.get(backup.fileName) ?? "retention_expired",
  }));
}

export async function pruneBackups(options: { dryRun?: boolean } = {}) {
  const files = await listBackupFiles(BACKUP_STORAGE_DIR);
  const plan = planBackupPrune(files);
  const prune = plan.filter((item) => !item.keep);

  if (!options.dryRun) {
    for (const item of prune) {
      await unlink(/*turbopackIgnore: true*/ resolveBackupPath(item.fileName)).catch(() => {});
      await prisma.backupRecord.updateMany({
        data: {
          notes: "Pruned by backup retention policy.",
          status: "deleted",
        },
        where: { fileName: item.fileName },
      });
    }
  }

  return { plan, pruned: prune };
}

export async function restoreBackupFile(
  fileNameOrPath: string,
  options: { confirm?: boolean } = {},
) {
  if (!options.confirm) {
    throw new Error("Restore requires explicit confirmation.");
  }

  const verification = await verifyBackupFile(fileNameOrPath);

  if (!verification.ok) {
    throw new Error(`Backup verification failed: ${verification.errors.join("; ")}`);
  }

  const backupPath = path.isAbsolute(fileNameOrPath)
    ? fileNameOrPath
    : resolveBackupPath(fileNameOrPath);
  const archive = await readFile(/*turbopackIgnore: true*/ backupPath);
  const entries = parseZipArchive(archive);
  const dbEntry = entries.find((entry) => entry.path.startsWith("database/"));

  if (!dbEntry) {
    throw new Error("Backup does not contain a database snapshot.");
  }

  const safetyBackup = await createSystemBackup("Pre-restore automatic safety backup");
  if (!safetyBackup.ok) {
    throw new Error("Could not create pre-restore safety backup.");
  }

  const databasePath = resolveSqliteDatabasePath();
  const restoreId = formatBackupTimestamp(new Date());
  const stagedDatabasePath = `${databasePath}.restore-${restoreId}`;
  const oldDatabasePath = `${databasePath}.pre-restore-${restoreId}`;
  const stagedUploadsDir = `${UPLOADS_DIR}.restore-${restoreId}`;
  const oldUploadsDir = `${UPLOADS_DIR}.pre-restore-${restoreId}`;

  await writeFile(/*turbopackIgnore: true*/ stagedDatabasePath, dbEntry.data);
  await rm(/*turbopackIgnore: true*/ stagedUploadsDir, { force: true, recursive: true });
  await mkdir(/*turbopackIgnore: true*/ stagedUploadsDir, { recursive: true });

  for (const entry of entries.filter((item) => item.path.startsWith("storage/uploads/"))) {
    const relativePath = entry.path.replace(/^storage\/uploads\//, "");
    const outputPath = path.resolve(stagedUploadsDir, relativePath);

    if (!outputPath.startsWith(`${path.resolve(stagedUploadsDir)}${path.sep}`)) {
      throw new Error("Unsafe upload path in backup.");
    }

    await mkdir(/*turbopackIgnore: true*/ path.dirname(outputPath), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ outputPath, entry.data);
  }

  await replaceDatabaseAndUploads({
    databasePath,
    oldDatabasePath,
    oldUploadsDir,
    stagedDatabasePath,
    stagedUploadsDir,
  });

  return { ok: true as const, safetyBackupRecordId: safetyBackup.record.id };
}

async function replaceDatabaseAndUploads(input: {
  databasePath: string;
  oldDatabasePath: string;
  oldUploadsDir: string;
  stagedDatabasePath: string;
  stagedUploadsDir: string;
}) {
  let databaseMoved = false;
  let uploadsReplacementStarted = false;
  let uploadsMoved = false;

  await rm(/*turbopackIgnore: true*/ input.oldDatabasePath, { force: true });
  await rm(/*turbopackIgnore: true*/ input.oldUploadsDir, {
    force: true,
    recursive: true,
  });

  try {
    await rename(/*turbopackIgnore: true*/ input.databasePath, input.oldDatabasePath);
    databaseMoved = true;
    await rename(/*turbopackIgnore: true*/ input.stagedDatabasePath, input.databasePath);

    if (await pathExists(input.oldUploadsDir)) {
      await rm(/*turbopackIgnore: true*/ input.oldUploadsDir, {
        force: true,
        recursive: true,
      });
    }

    uploadsMoved = await movePathIfExists(UPLOADS_DIR, input.oldUploadsDir);
    uploadsReplacementStarted = true;
    await rename(/*turbopackIgnore: true*/ input.stagedUploadsDir, UPLOADS_DIR);
  } catch (error) {
    await rm(/*turbopackIgnore: true*/ input.databasePath, { force: true }).catch(
      () => {},
    );

    if (databaseMoved) {
      await rename(
        /*turbopackIgnore: true*/ input.oldDatabasePath,
        input.databasePath,
      ).catch(() => {});
    }

    if (uploadsReplacementStarted) {
      await rm(/*turbopackIgnore: true*/ UPLOADS_DIR, {
        force: true,
        recursive: true,
      }).catch(() => {});
    }

    if (uploadsMoved) {
      await rename(
        /*turbopackIgnore: true*/ input.oldUploadsDir,
        UPLOADS_DIR,
      ).catch(() => {});
    }

    await rm(/*turbopackIgnore: true*/ input.stagedDatabasePath, {
      force: true,
    }).catch(() => {});
    await rm(/*turbopackIgnore: true*/ input.stagedUploadsDir, {
      force: true,
      recursive: true,
    }).catch(() => {});
    throw error;
  }

  await rm(/*turbopackIgnore: true*/ input.oldDatabasePath, { force: true });
  await rm(/*turbopackIgnore: true*/ input.oldUploadsDir, {
    force: true,
    recursive: true,
  });
}

async function movePathIfExists(from: string, to: string): Promise<boolean> {
  if (!(await pathExists(from))) {
    return false;
  }

  await rename(/*turbopackIgnore: true*/ from, to);
  return true;
}

async function pathExists(filePath: string): Promise<boolean> {
  return stat(/*turbopackIgnore: true*/ filePath)
    .then(() => true)
    .catch(() => false);
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

async function listPrismaMigrations(): Promise<string[]> {
  const migrationsDir = path.join(
    process.env.TRACEME_PROJECT_ROOT ?? process.cwd(),
    "prisma",
    "migrations",
  );
  const entries = await readdir(/*turbopackIgnore: true*/ migrationsDir, {
    withFileTypes: true,
  }).catch(() => []);

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function getAppVersion(): string {
  return process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.1.0";
}

function parseManifest(data: Buffer, errors: string[]): BackupManifest | null {
  try {
    const parsed = JSON.parse(data.toString("utf8")) as BackupManifest;

    if (!parsed || typeof parsed !== "object") {
      errors.push("manifest is not an object.");
      return null;
    }

    if (!Array.isArray(parsed.files)) {
      errors.push("manifest files must be an array.");
      return null;
    }

    return parsed;
  } catch {
    errors.push("manifest.json is not valid JSON.");
    return null;
  }
}

function parseZipArchive(archive: Buffer): ZipEntryInput[] {
  const entries: ZipEntryInput[] = [];
  let offset = 0;

  while (offset + 30 <= archive.length) {
    const signature = archive.readUInt32LE(offset);

    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }

    if (signature !== 0x04034b50) {
      throw new Error("Invalid zip local header.");
    }

    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const entryPath = archive
      .subarray(nameStart, nameStart + nameLength)
      .toString("utf8");
    const compressed = archive.subarray(dataStart, dataEnd);
    const data =
      method === 8
        ? inflateRawSync(compressed)
        : method === 0
          ? Buffer.from(compressed)
          : null;

    if (!data) {
      throw new Error("Unsupported zip compression method.");
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`Zip entry size mismatch: ${entryPath}`);
    }

    entries.push({ data, path: entryPath });
    offset = dataEnd;
  }

  return entries;
}

function backupDate(backup: {
  createdAt?: Date;
  fileName: string;
  modifiedAt?: Date;
}): Date {
  const match = backup.fileName.match(/(\d{8})-(\d{6})/);

  if (match) {
    const [, date, time] = match;

    return new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8)),
      Number(time.slice(0, 2)),
      Number(time.slice(2, 4)),
      Number(time.slice(4, 6)),
    );
  }

  return backup.createdAt ?? backup.modifiedAt ?? new Date(0);
}

function isoWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;

  utc.setUTCDate(utc.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return `${utc.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
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

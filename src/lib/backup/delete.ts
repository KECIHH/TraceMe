import { unlink } from "node:fs/promises";

import { prisma } from "@/lib/prisma";

import { resolveBackupPath } from "./paths";

export async function deleteBackupRecord(recordId: string) {
  const record = await prisma.backupRecord.findUnique({ where: { id: recordId } });

  if (!record) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const backupPath = resolveBackupPath(record.fileName);
  const deletionResult = await deleteBackupFile(backupPath);

  if (!deletionResult.ok) {
    await prisma.backupRecord.update({
      where: { id: record.id },
      data: {
        notes: appendDeletionFailureNote(record.notes),
      },
    });

    return { ok: false as const, reason: deletionResult.reason };
  }

  await prisma.backupRecord.update({
    where: { id: record.id },
    data: {
      status: "deleted",
      notes: appendDeletionNote(record.notes),
    },
  });

  return { ok: true as const };
}

function appendDeletionNote(notes: string | null): string {
  return notes ? `${notes}\n已删除备份文件。` : "已删除备份文件。";
}

function appendDeletionFailureNote(notes: string | null): string {
  const deletionNote =
    "删除备份文件失败，记录状态已保留。请确认文件未被占用后重试，或手动检查 storage/backups。";

  return notes ? `${notes}\n${deletionNote}` : deletionNote;
}

async function deleteBackupFile(
  backupPath: string,
): Promise<{ ok: true } | { ok: false; reason: "delete_failed" }> {
  try {
    await unlink(/*turbopackIgnore: true*/ backupPath);
    return { ok: true };
  } catch (error) {
    if (isFileMissingError(error)) {
      return { ok: true };
    }

    return { ok: false, reason: "delete_failed" };
  }
}

function isFileMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

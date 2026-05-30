"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { createSystemBackup } from "@/lib/backup";
import { requireAdmin } from "@/lib/collaboration";

export async function createBackupAction(formData: FormData) {
  const user = await requireAdmin();
  const notes = String(formData.get("notes") ?? "");
  const result = await createSystemBackup(notes);
  await writeAuditLog({
    action: "backup.created",
    entityId: result.record.id,
    entityType: "BackupRecord",
    metadata: {
      fileName: result.record.fileName,
      ok: result.ok,
      sha256: result.record.sha256,
    },
    userId: user.id,
  });

  revalidatePath("/settings/backups");

  if (!result.ok) {
    redirect(
      `/settings/backups?error=${encodeURIComponent("备份失败，请查看备份记录。")}`,
    );
  }

  redirect(
    `/settings/backups?message=${encodeURIComponent("系统备份已创建，请妥善保管备份文件。")}`,
  );
}

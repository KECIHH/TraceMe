"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSystemBackup } from "@/lib/backup";
import { requireUser } from "@/lib/auth/session";

export async function createBackupAction(formData: FormData) {
  await requireUser();
  const notes = String(formData.get("notes") ?? "");
  const result = await createSystemBackup(notes);

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

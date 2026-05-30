"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { deleteOtherSessionsForUser, requireUser } from "@/lib/auth/session";

export async function revokeOtherSessionsAction() {
  const user = await requireUser();
  const result = await deleteOtherSessionsForUser(user.id);

  await writeAuditLog({
    action: "logout",
    entityId: user.id,
    entityType: "User",
    metadata: { revokedOtherSessions: result.count },
    userId: user.id,
  });

  revalidatePath("/settings/sessions");
  redirect(
    `/settings/sessions?message=${encodeURIComponent("其他会话已退出。")}`,
  );
}

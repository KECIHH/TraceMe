"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  buildOtherSessionsWhere,
  getCurrentSessionTokenHash,
  requireUser,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { validatePasswordChangeFields } from "@/lib/settings/password";
import { setAiEnabledByUserSetting } from "@/server/services/ai/settings";

export async function setAiEnabledAction(formData: FormData) {
  const user = await requireUser();
  const enabled = formData.get("enabled") === "true";
  await setAiEnabledByUserSetting(enabled);
  await writeAuditLog({
    action: "ai_config.updated",
    entityType: "AppSetting",
    metadata: { enabled },
    userId: user.id,
  });
  revalidatePath("/settings");
  revalidatePath("/settings/ai");
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (displayName.length > 80) {
    redirect(
      `/settings/profile?error=${encodeURIComponent("显示名称不能超过 80 个字符。")}`,
    );
  }

  await prisma.user.update({
    data: { displayName: displayName || null },
    where: { id: user.id },
  });

  revalidatePath("/settings");
  revalidatePath("/settings/profile");
  redirect(
    `/settings/profile?message=${encodeURIComponent("个人资料已更新。")}`,
  );
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const fieldValidation = validatePasswordChangeFields({
    confirmPassword,
    currentPassword,
    newPassword,
  });

  if (!fieldValidation.strongEnough) {
    redirect(
      `/settings/password?error=${encodeURIComponent(fieldValidation.issues[0] ?? "密码表单不符合要求。")}`,
    );
  }

  const persistedUser = await prisma.user.findUnique({
    select: { id: true, passwordHash: true },
    where: { id: user.id },
  });

  if (
    !persistedUser ||
    !verifyPassword(currentPassword, persistedUser.passwordHash)
  ) {
    redirect(
      `/settings/password?error=${encodeURIComponent("无法修改密码，请检查输入后重试。")}`,
    );
  }

  const currentSessionTokenHash = await getCurrentSessionTokenHash();

  await prisma.$transaction([
    prisma.user.update({
      data: { passwordHash: hashPassword(newPassword) },
      where: { id: persistedUser.id },
    }),
    prisma.session.deleteMany({
      where: buildOtherSessionsWhere(persistedUser.id, currentSessionTokenHash),
    }),
  ]);
  await writeAuditLog({
    action: "password.changed",
    entityId: persistedUser.id,
    entityType: "User",
    metadata: { otherSessionsRevoked: true },
    userId: user.id,
  });

  revalidatePath("/settings");
  revalidatePath("/settings/password");
  redirect(
    `/settings/password?message=${encodeURIComponent("密码已更新，当前会话保持有效，其他会话已失效。")}`,
  );
}

export async function refreshSystemStatusAction() {
  await requireUser();
  revalidatePath("/settings");
  revalidatePath("/settings/system");
  redirect(
    `/settings/system?message=${encodeURIComponent("系统统计已重新计算。")}`,
  );
}

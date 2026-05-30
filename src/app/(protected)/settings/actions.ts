"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import {
  AI_ADVANCED_TASKS,
  mergePromptTemplates,
} from "@/lib/ai/advanced";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  buildOtherSessionsWhere,
  getCurrentSessionTokenHash,
  requireUser,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { validatePasswordChangeFields } from "@/lib/settings/password";
import {
  deleteAiProviderConfig,
  isAiProviderName,
  resolveAiProviderConfig,
  saveAiProviderConfig,
  testAiProviderConnection,
} from "@/server/services/ai/provider-config";
import {
  setAiEnabledByUserSetting,
  setAiPromptTemplates,
} from "@/server/services/ai/settings";

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

export async function updateAiProviderConfigAction(formData: FormData) {
  const user = await requireUser();
  const providerValue = String(formData.get("provider") ?? "");

  if (!isAiProviderName(providerValue)) {
    redirectWithSettingsMessage("error", "请选择有效的 AI provider。");
  }

  try {
    await saveAiProviderConfig({
      apiKey: String(formData.get("apiKey") ?? ""),
      model: String(formData.get("model") ?? ""),
      provider: providerValue,
    });
  } catch (error) {
    redirectWithSettingsMessage(
      "error",
      error instanceof Error ? error.message : "AI provider 配置保存失败。",
    );
  }

  await writeAuditLog({
    action: "ai_provider.updated",
    entityType: "AppSetting",
    metadata: { model: String(formData.get("model") ?? ""), provider: providerValue },
    userId: user.id,
  });
  revalidatePath("/settings");
  revalidatePath("/settings/ai");
  redirectWithSettingsMessage("message", "AI provider 配置已保存。");
}

export async function testAiProviderConfigAction() {
  await requireUser();
  const config = await resolveAiProviderConfig();
  const result = await testAiProviderConnection(config);

  if (!result.ok) {
    redirectWithSettingsMessage("error", result.message);
  }

  revalidatePath("/settings/ai");
  redirectWithSettingsMessage("message", "AI provider 连接测试通过。");
}

export async function deleteAiProviderConfigAction() {
  const user = await requireUser();
  await deleteAiProviderConfig();
  await writeAuditLog({
    action: "ai_provider.deleted",
    entityType: "AppSetting",
    metadata: { deleted: true },
    userId: user.id,
  });
  revalidatePath("/settings");
  revalidatePath("/settings/ai");
  redirectWithSettingsMessage("message", "AI provider 配置已删除。");
}

export async function updateAiPromptTemplatesAction(formData: FormData) {
  const user = await requireUser();
  const templates = mergePromptTemplates(
    Object.fromEntries(
      AI_ADVANCED_TASKS.map((task) => [
        task.id,
        String(formData.get(`template-${task.id}`) ?? ""),
      ]),
    ),
  );

  await setAiPromptTemplates(templates);
  await writeAuditLog({
    action: "ai_prompt_templates.updated",
    entityType: "AppSetting",
    metadata: { templateCount: AI_ADVANCED_TASKS.length },
    userId: user.id,
  });
  revalidatePath("/settings/ai");
  redirectWithSettingsMessage("message", "Prompt 模板已保存。");
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

function redirectWithSettingsMessage(key: "error" | "message", message: string): never {
  redirect(`/settings/ai?${key}=${encodeURIComponent(message)}`);
}

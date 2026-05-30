"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

const MIN_PASSWORD_LENGTH = 12;

export async function createUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const username = text(formData, "username").toLowerCase();
  const displayName = text(formData, "displayName");
  const password = String(formData.get("password") ?? "");

  if (!/^[a-z0-9._-]{3,80}$/.test(username)) {
    redirectWithMessage(
      "error",
      "用户名只能包含小写字母、数字、点、下划线和短横线，长度 3-80。",
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    redirectWithMessage("error", `初始密码至少 ${MIN_PASSWORD_LENGTH} 位。`);
  }

  const existing = await prisma.user.findUnique({
    select: { id: true },
    where: { username },
  });

  if (existing) {
    redirectWithMessage("error", "该用户名已存在。");
  }

  const user = await prisma.user.create({
    data: {
      displayName: displayName || null,
      passwordHash: hashPassword(password),
      role: "USER",
      username,
    },
  });

  await writeAuditLog({
    action: "user.created",
    entityId: user.id,
    entityType: "User",
    metadata: { username: user.username },
    userId: admin.id,
  });

  revalidatePath("/settings/users");
  redirectWithMessage("message", "用户已创建。");
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithMessage(key: "error" | "message", message: string): never {
  redirect(`/settings/users?${key}=${encodeURIComponent(message)}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import {
  createShareToken,
  hashSharePassword,
  hashShareToken,
  isTripMemberRole,
  parseShareExpiresAt,
  requireTripAccess,
} from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

export async function addTripMemberAction(tripId: string, formData: FormData) {
  const { user } = await requireTripAccess(tripId, "manageMembers");
  const username = text(formData, "username").toLowerCase();
  const roleValue = text(formData, "role");
  const canDownloadSensitiveDocuments =
    formData.get("canDownloadSensitiveDocuments") === "on";

  if (!username || !isTripMemberRole(roleValue)) {
    redirectWithMessage(tripId, "error", "请选择有效用户和成员角色。");
  }

  const targetUser = await prisma.user.findUnique({
    select: { id: true, username: true },
    where: { username },
  });

  if (!targetUser) {
    redirectWithMessage(tripId, "error", "用户不存在，请先由管理员创建用户。");
  }

  const existing = await prisma.tripMember.findUnique({
    select: { id: true },
    where: { tripId_userId: { tripId, userId: targetUser.id } },
  });

  if (existing) {
    redirectWithMessage(tripId, "error", "该用户已经是旅行成员。");
  }

  const member = await prisma.tripMember.create({
    data: {
      canDownloadSensitiveDocuments,
      invitedById: user.id,
      role: roleValue,
      tripId,
      userId: targetUser.id,
    },
  });

  await writeAuditLog({
    action: "trip.member_added",
    entityId: tripId,
    entityType: "Trip",
    metadata: {
      memberId: member.id,
      role: roleValue,
      targetUsername: targetUser.username,
    },
    userId: user.id,
  });

  revalidateMembers(tripId);
  redirectWithMessage(tripId, "message", "成员已添加。");
}

export async function updateTripMemberAction(
  tripId: string,
  memberId: string,
  formData: FormData,
) {
  const { user } = await requireTripAccess(tripId, "manageMembers");
  const roleValue = text(formData, "role");
  const canDownloadSensitiveDocuments =
    formData.get("canDownloadSensitiveDocuments") === "on";

  if (!isTripMemberRole(roleValue)) {
    redirectWithMessage(tripId, "error", "成员角色无效。");
  }

  const member = await prisma.tripMember.findFirst({
    include: { user: { select: { username: true } } },
    where: { id: memberId, tripId },
  });

  if (!member) {
    redirectWithMessage(tripId, "error", "成员不存在。");
  }

  if (member.role === "OWNER" && roleValue !== "OWNER") {
    await ensureAnotherOwner(tripId, member.id);
  }

  await prisma.tripMember.update({
    data: {
      canDownloadSensitiveDocuments,
      role: roleValue,
    },
    where: { id: member.id },
  });

  await writeAuditLog({
    action: "trip.member_updated",
    entityId: tripId,
    entityType: "Trip",
    metadata: {
      memberId,
      role: roleValue,
      targetUsername: member.user.username,
    },
    userId: user.id,
  });

  revalidateMembers(tripId);
  redirectWithMessage(tripId, "message", "成员权限已更新。");
}

export async function removeTripMemberAction(tripId: string, memberId: string) {
  const { user } = await requireTripAccess(tripId, "manageMembers");
  const member = await prisma.tripMember.findFirst({
    include: { user: { select: { username: true } } },
    where: { id: memberId, tripId },
  });

  if (!member) {
    redirectWithMessage(tripId, "error", "成员不存在。");
  }

  if (member.role === "OWNER") {
    await ensureAnotherOwner(tripId, member.id);
  }

  await prisma.tripMember.delete({ where: { id: member.id } });

  await writeAuditLog({
    action: "trip.member_removed",
    entityId: tripId,
    entityType: "Trip",
    metadata: { memberId, targetUsername: member.user.username },
    userId: user.id,
  });

  revalidateMembers(tripId);
  redirectWithMessage(tripId, "message", "成员已移除。");
}

export async function createShareLinkAction(tripId: string, formData: FormData) {
  const { user } = await requireTripAccess(tripId, "manageShareLinks");
  const token = createShareToken();
  const expiresAtValue = text(formData, "expiresAt");
  const expiresAt = parseShareExpiresAt(expiresAtValue);
  const password = String(formData.get("password") ?? "");

  if (expiresAtValue && !expiresAt) {
    redirectWithMessage(tripId, "error", "分享过期时间无效。");
  }

  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    redirectWithMessage(tripId, "error", "分享过期时间必须晚于当前时间。");
  }

  const link = await prisma.tripShareLink.create({
    data: {
      createdById: user.id,
      expiresAt,
      isEnabled: formData.get("isEnabled") === "on",
      label: text(formData, "label") || null,
      passwordHash: password ? hashSharePassword(password) : null,
      tokenHash: hashShareToken(token),
      tripId,
    },
  });

  await writeAuditLog({
    action: "trip.share_created",
    entityId: link.id,
    entityType: "TripShareLink",
    metadata: {
      expiresAt,
      isEnabled: link.isEnabled,
      passwordProtected: Boolean(password),
      tripId,
    },
    userId: user.id,
  });

  revalidateMembers(tripId);
  redirect(
    `/trips/${tripId}/members?message=${encodeURIComponent(
      "分享链接已创建。",
    )}&createdToken=${encodeURIComponent(token)}`,
  );
}

export async function updateShareLinkAction(
  tripId: string,
  shareLinkId: string,
  formData: FormData,
) {
  const { user } = await requireTripAccess(tripId, "manageShareLinks");
  const expiresAtValue = text(formData, "expiresAt");
  const expiresAt = parseShareExpiresAt(expiresAtValue);
  const password = String(formData.get("password") ?? "");

  if (expiresAtValue && !expiresAt) {
    redirectWithMessage(tripId, "error", "分享过期时间无效。");
  }

  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    redirectWithMessage(tripId, "error", "分享过期时间必须晚于当前时间。");
  }

  const link = await prisma.tripShareLink.findFirst({
    where: { id: shareLinkId, tripId },
  });

  if (!link) {
    redirectWithMessage(tripId, "error", "分享链接不存在。");
  }

  await prisma.tripShareLink.update({
    data: {
      expiresAt,
      isEnabled: formData.get("isEnabled") === "on",
      label: text(formData, "label") || null,
      ...(password ? { passwordHash: hashSharePassword(password) } : {}),
    },
    where: { id: link.id },
  });

  await writeAuditLog({
    action: "trip.share_updated",
    entityId: link.id,
    entityType: "TripShareLink",
    metadata: {
      expiresAt,
      isEnabled: formData.get("isEnabled") === "on",
      passwordChanged: Boolean(password),
      tripId,
    },
    userId: user.id,
  });

  revalidateMembers(tripId);
  redirectWithMessage(tripId, "message", "分享链接已更新。");
}

export async function revokeShareLinkAction(tripId: string, shareLinkId: string) {
  const { user } = await requireTripAccess(tripId, "manageShareLinks");
  const link = await prisma.tripShareLink.findFirst({
    where: { id: shareLinkId, tripId },
  });

  if (!link) {
    redirectWithMessage(tripId, "error", "分享链接不存在。");
  }

  await prisma.tripShareLink.update({
    data: {
      isEnabled: false,
      revokedAt: new Date(),
    },
    where: { id: link.id },
  });

  await writeAuditLog({
    action: "trip.share_revoked",
    entityId: link.id,
    entityType: "TripShareLink",
    metadata: { tripId },
    userId: user.id,
  });

  revalidateMembers(tripId);
  redirectWithMessage(tripId, "message", "分享链接已撤销。");
}

async function ensureAnotherOwner(tripId: string, memberId: string) {
  const otherOwnerCount = await prisma.tripMember.count({
    where: { id: { not: memberId }, role: "OWNER", tripId },
  });

  if (otherOwnerCount === 0) {
    redirectWithMessage(tripId, "error", "至少需要保留一位 Owner。");
  }
}

function revalidateMembers(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/members`);
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithMessage(
  tripId: string,
  key: "error" | "message",
  message: string,
): never {
  redirect(`/trips/${tripId}/members?${key}=${encodeURIComponent(message)}`);
}

import { createHash, randomBytes } from "node:crypto";

import type {
  Document,
  DocumentType,
  Place,
  Prisma,
  StayDetail,
  TripMember,
  TripMemberRole,
} from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import type { AuthUser } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type TripPermission =
  | "delete"
  | "downloadSensitiveDocuments"
  | "edit"
  | "manageMembers"
  | "manageShareLinks"
  | "read"
  | "uploadDocuments";

export type TripAccess = {
  canDelete: boolean;
  canDownloadSensitiveDocuments: boolean;
  canEdit: boolean;
  canManageMembers: boolean;
  canManageShareLinks: boolean;
  canRead: boolean;
  canUploadDocuments: boolean;
  member: Pick<TripMember, "canDownloadSensitiveDocuments" | "role">;
  role: TripMemberRole;
};

export type TripShareCheckResult =
  | { ok: true; requiresPassword: boolean }
  | { ok: false; reason: "disabled" | "expired" | "missing" | "revoked" };

export type SharePasswordCheckResult =
  | { ok: true }
  | { ok: false; reason: "missing_password" | "wrong_password" };

export type PublicTripDocument = Pick<
  Document,
  "id" | "mimeType" | "originalFileName" | "title" | "type"
>;

export type PublicTripPlace<T extends Place & { stayDetail?: StayDetail | null }> =
  Omit<T, "stayDetail"> & {
    stayDetail?: Omit<StayDetail, "bookingReference"> | null;
  };

export const TRIP_MEMBER_ROLE_OPTIONS: Array<{
  label: string;
  value: TripMemberRole;
}> = [
  { label: "Owner", value: "OWNER" },
  { label: "Editor", value: "EDITOR" },
  { label: "Viewer", value: "VIEWER" },
];

export function isTripMemberRole(value: string): value is TripMemberRole {
  return TRIP_MEMBER_ROLE_OPTIONS.some((option) => option.value === value);
}

export function visibleTripsWhere(userId: string): Prisma.TripWhereInput {
  return { members: { some: { userId } } };
}

export function getTripRoleLabel(role: TripMemberRole): string {
  return TRIP_MEMBER_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export function canTripRole(
  role: TripMemberRole,
  permission: TripPermission,
): boolean {
  const permissions: Record<TripMemberRole, Record<TripPermission, boolean>> = {
    OWNER: {
      delete: true,
      downloadSensitiveDocuments: true,
      edit: true,
      manageMembers: true,
      manageShareLinks: true,
      read: true,
      uploadDocuments: true,
    },
    EDITOR: {
      delete: false,
      downloadSensitiveDocuments: false,
      edit: true,
      manageMembers: false,
      manageShareLinks: false,
      read: true,
      uploadDocuments: true,
    },
    VIEWER: {
      delete: false,
      downloadSensitiveDocuments: false,
      edit: false,
      manageMembers: false,
      manageShareLinks: false,
      read: true,
      uploadDocuments: false,
    },
  };

  return permissions[role][permission];
}

export function buildTripAccess(
  member: Pick<TripMember, "canDownloadSensitiveDocuments" | "role">,
): TripAccess {
  const role = member.role;

  return {
    canDelete: canTripRole(role, "delete"),
    canDownloadSensitiveDocuments:
      canTripRole(role, "downloadSensitiveDocuments") ||
      member.canDownloadSensitiveDocuments,
    canEdit: canTripRole(role, "edit"),
    canManageMembers: canTripRole(role, "manageMembers"),
    canManageShareLinks: canTripRole(role, "manageShareLinks"),
    canRead: canTripRole(role, "read"),
    canUploadDocuments: canTripRole(role, "uploadDocuments"),
    member,
    role,
  };
}

export function canAccessDocument(
  access: Pick<TripAccess, "canDownloadSensitiveDocuments" | "canRead">,
  document: Pick<Document, "isSensitive">,
): boolean {
  return access.canRead && (!document.isSensitive || access.canDownloadSensitiveDocuments);
}

export function shouldShareLinkBeAccessible(
  link: {
    expiresAt: Date | null;
    isEnabled: boolean;
    passwordHash: string | null;
    revokedAt: Date | null;
  } | null,
  now = new Date(),
): TripShareCheckResult {
  if (!link) {
    return { ok: false, reason: "missing" };
  }

  if (!link.isEnabled) {
    return { ok: false, reason: "disabled" };
  }

  if (link.revokedAt) {
    return { ok: false, reason: "revoked" };
  }

  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, requiresPassword: Boolean(link.passwordHash) };
}

export function verifySharePassword(
  password: string | null | undefined,
  passwordHash: string | null | undefined,
): SharePasswordCheckResult {
  if (!passwordHash) {
    return { ok: true };
  }

  if (!password) {
    return { ok: false, reason: "missing_password" };
  }

  return verifyPassword(password, passwordHash)
    ? { ok: true }
    : { ok: false, reason: "wrong_password" };
}

export function createShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashSharePassword(password: string): string {
  return hashPassword(password);
}

export function filterPublicDocuments<T extends Document>(
  documents: T[],
): PublicTripDocument[] {
  return documents
    .filter(
      (document) =>
        !document.isSensitive && !isSensitiveDocumentType(document.type),
    )
    .map((document) => ({
      id: document.id,
      mimeType: document.mimeType,
      originalFileName: document.originalFileName,
      title: document.title,
      type: document.type,
    }));
}

export function isSensitiveDocumentType(type: DocumentType): boolean {
  return SENSITIVE_DOCUMENT_TYPES.has(type);
}

export function filterPublicPlace<
  T extends Place & { stayDetail?: StayDetail | null },
>(place: T): PublicTripPlace<T> {
  const { stayDetail, ...safePlace } = place;

  if (!stayDetail) {
    return { ...safePlace, stayDetail: null } as PublicTripPlace<T>;
  }

  const { bookingReference, ...safeStayDetail } = stayDetail;
  void bookingReference;

  return {
    ...safePlace,
    stayDetail: safeStayDetail,
  } as PublicTripPlace<T>;
}

export function parseShareExpiresAt(value: string): Date | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date;
}

export async function ensureOwnerForNewTrip(tripId: string, userId: string) {
  await prisma.tripMember.upsert({
    create: {
      canDownloadSensitiveDocuments: true,
      role: "OWNER",
      tripId,
      userId,
    },
    update: {
      canDownloadSensitiveDocuments: true,
      role: "OWNER",
    },
    where: { tripId_userId: { tripId, userId } },
  });
}

export async function getTripAccessForUser(
  tripId: string,
  userId: string,
): Promise<TripAccess | null> {
  const member = await prisma.tripMember.findUnique({
    select: {
      canDownloadSensitiveDocuments: true,
      role: true,
    },
    where: { tripId_userId: { tripId, userId } },
  });

  return member ? buildTripAccess(member) : null;
}

export async function getTripAccessOrNotFound(
  tripId: string,
  user: Pick<AuthUser, "id">,
): Promise<TripAccess> {
  const access = await getTripAccessForUser(tripId, user.id);

  if (!access?.canRead) {
    notFound();
  }

  return access;
}

export async function requireTripAccess(
  tripId: string,
  permission: TripPermission = "read",
): Promise<{ access: TripAccess; user: AuthUser }> {
  const user = await requireUser();
  const access = await getTripAccessOrNotFound(tripId, user);

  if (!hasPermission(access, permission)) {
    await auditTripAccessDenied({
      action: `requireTripAccess:${permission}`,
      permission,
      tripId,
      userId: user.id,
    });
    redirect(`/trips/${tripId}?error=${encodeURIComponent("没有权限执行此操作。")}`);
  }

  return { access, user };
}

export async function requireTripAccessOrNotFound(
  tripId: string,
  permission: TripPermission = "read",
): Promise<{ access: TripAccess; user: AuthUser }> {
  const user = await requireUser();
  const access = await getTripAccessOrNotFound(tripId, user);

  if (!hasPermission(access, permission)) {
    await auditTripAccessDenied({
      action: `requireTripAccessOrNotFound:${permission}`,
      permission,
      tripId,
      userId: user.id,
    });
    notFound();
  }

  return { access, user };
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return user;
}

export async function auditTripAccessDenied(input: {
  action: string;
  permission: TripPermission;
  tripId: string;
  userId: string;
}) {
  await writeAuditLog({
    action: "trip.permission_denied",
    entityId: input.tripId,
    entityType: "Trip",
    metadata: {
      attemptedAction: input.action,
      permission: input.permission,
    },
    userId: input.userId,
  });
}

function hasPermission(access: TripAccess, permission: TripPermission): boolean {
  switch (permission) {
    case "delete":
      return access.canDelete;
    case "downloadSensitiveDocuments":
      return access.canDownloadSensitiveDocuments;
    case "edit":
      return access.canEdit;
    case "manageMembers":
      return access.canManageMembers;
    case "manageShareLinks":
      return access.canManageShareLinks;
    case "read":
      return access.canRead;
    case "uploadDocuments":
      return access.canUploadDocuments;
  }
}

const SENSITIVE_DOCUMENT_TYPES = new Set<DocumentType>([
  "FLIGHT_TICKET",
  "TRAIN_TICKET",
  "HOTEL_BOOKING",
  "INSURANCE_POLICY",
  "CAR_RENTAL",
  "VISA_DOCUMENT",
  "PASSPORT",
  "ID_CARD",
  "PAYMENT_PROOF",
  "TICKET",
  "VISA",
  "BOOKING",
  "INSURANCE",
  "RECEIPT",
]);

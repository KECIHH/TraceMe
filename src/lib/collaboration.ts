import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type {
  ChecklistItem,
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
import { requireUser, shouldUseSecureCookies } from "@/lib/auth/session";
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

export type PublicTripChecklistItem = Pick<
  ChecklistItem,
  "category" | "id" | "title"
>;

export type PublicTripPlace<T extends Place & { stayDetail?: StayDetail | null }> =
  Omit<T, "stayDetail"> & {
    stayDetail?: Omit<StayDetail, "bookingReference"> | null;
  };

export const SHARE_UNLOCK_COOKIE_NAME_PREFIX = "traceme_share_unlock_";
export const SHARE_UNLOCK_MAX_AGE_SECONDS = 60 * 30;

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

export function getShareUnlockCookieName(tokenHash: string): string {
  return `${SHARE_UNLOCK_COOKIE_NAME_PREFIX}${tokenHash.slice(0, 32)}`;
}

export function createShareUnlockCookieValue(input: {
  now?: Date;
  passwordHash: string;
  secret?: string;
  tokenHash: string;
}): { expiresAt: Date; value: string } {
  const now = input.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + SHARE_UNLOCK_MAX_AGE_SECONDS * 1000,
  );
  const expiresAtMs = expiresAt.getTime();
  const signature = signShareUnlockCookie({
    expiresAtMs,
    passwordHash: input.passwordHash,
    secret: input.secret,
    tokenHash: input.tokenHash,
  });

  return {
    expiresAt,
    value: `${input.tokenHash}.${expiresAtMs}.${signature}`,
  };
}

export function verifyShareUnlockCookie(input: {
  cookieValue: string | null | undefined;
  now?: Date;
  passwordHash: string | null | undefined;
  secret?: string;
  tokenHash: string;
}): boolean {
  if (!input.passwordHash) {
    return true;
  }

  if (!input.cookieValue) {
    return false;
  }

  const parts = input.cookieValue.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [tokenHash, expiresAtMsValue, signature] = parts;
  if (tokenHash !== input.tokenHash || !/^\d+$/.test(expiresAtMsValue)) {
    return false;
  }

  const expiresAtMs = Number(expiresAtMsValue);
  const now = input.now ?? new Date();
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now.getTime()) {
    return false;
  }

  const expectedSignature = signShareUnlockCookie({
    expiresAtMs,
    passwordHash: input.passwordHash,
    secret: input.secret,
    tokenHash: input.tokenHash,
  });

  return timingSafeEqualHex(signature, expectedSignature);
}

export function getShareUnlockCookieOptions(
  expiresAt: Date,
  nodeEnv = process.env.NODE_ENV,
  appBaseUrl = process.env.APP_BASE_URL,
) {
  return {
    expires: expiresAt,
    httpOnly: true,
    path: "/share",
    sameSite: "lax",
    secure: shouldUseSecureCookies(nodeEnv, appBaseUrl),
  } as const;
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

export function filterPublicChecklistItems<
  T extends Pick<ChecklistItem, "category" | "id" | "notes" | "title">,
>(items: T[]): PublicTripChecklistItem[] {
  return items
    .filter((item) => !isSensitiveChecklistItem(item))
    .map((item) => ({
      category: item.category,
      id: item.id,
      title: item.title,
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

const SENSITIVE_CHECKLIST_PATTERN =
  /(护照|身份证|证件|签证|保单|保险|订单|预订|预约|票号|航班号|车次|联系人|紧急联系人|电话|手机号|邮箱|住址|银行卡|信用卡|支付|付款|密码|口令|密钥|健康|病历|处方|passport|id\s*card|visa|insurance|booking|reservation|order|ticket\s*number|contact|phone|email|address|card|payment|password|secret|token|api\s*key|medical|prescription)/i;

function isSensitiveChecklistItem(
  item: Pick<ChecklistItem, "category" | "notes" | "title">,
): boolean {
  return SENSITIVE_CHECKLIST_PATTERN.test(
    [item.category, item.title, item.notes].filter(Boolean).join(" "),
  );
}

function signShareUnlockCookie(input: {
  expiresAtMs: number;
  passwordHash: string;
  secret?: string;
  tokenHash: string;
}): string {
  return createHmac("sha256", getShareUnlockSecret(input.secret))
    .update(`${input.tokenHash}:${input.passwordHash}:${input.expiresAtMs}`)
    .digest("hex");
}

function getShareUnlockSecret(secret = process.env.SESSION_SECRET): string {
  return secret?.trim() || "traceme-dev-share-unlock-secret";
}

function timingSafeEqualHex(value: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(value) || !/^[a-f0-9]{64}$/i.test(expected)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(value, "hex"), Buffer.from(expected, "hex"));
}

import type { Prisma } from "@prisma/client";

import { logError } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import { getClientIp, hashIp, maskIp, truncateUserAgent } from "@/lib/request-context";

const SECRET_KEY_PATTERN =
  /(password|passcode|secret|token|session|cookie|api[_-]?key|authorization|document_encryption_key|encryption_key)/i;
const MAX_METADATA_STRING_LENGTH = 240;

export type AuditAction =
  | "login.success"
  | "login.failure"
  | "logout"
  | "password.changed"
  | "document.uploaded"
  | "document.downloaded"
  | "document.deleted"
  | "backup.created"
  | "backup.deleted"
  | "backup.restored"
  | "ai_config.updated"
  | "trip.deleted"
  | "trip.exported";

export type AuditLogInput = {
  action: AuditAction | string;
  entityId?: string | null;
  entityType?: string | null;
  metadata?: unknown;
  request?: Request | null;
  userId?: string | null;
};

export function redactAuditMetadata(value: unknown): Prisma.InputJsonValue {
  return redactValue(value) as Prisma.InputJsonValue;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const request = input.request ?? null;
  const ip = request ? getClientIp(request) : null;

  await prisma.auditLog
    .create({
      data: {
        action: input.action,
        entityId: input.entityId ?? null,
        entityType: input.entityType ?? null,
        ipHash: hashIp(ip),
        ipMasked: maskIp(ip),
        metadataRedacted:
          input.metadata === undefined ? undefined : redactAuditMetadata(input.metadata),
        userAgent: truncateUserAgent(request?.headers.get("user-agent")),
        userId: input.userId ?? null,
      },
    })
    .catch((error: unknown) => {
      logError("audit_log_write_failed", {
        action: input.action,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    });
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactValue(entry),
      ]),
    );
  }

  return String(value);
}

function redactString(value: string): string {
  return value
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "[REDACTED_API_KEY]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .slice(0, MAX_METADATA_STRING_LENGTH);
}

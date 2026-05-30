import { createHash } from "node:crypto";

const MAX_USER_AGENT_LENGTH = 180;

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function hashIp(ip: string | null | undefined): string | null {
  const normalized = ip?.trim();

  if (!normalized || normalized === "unknown") {
    return null;
  }

  const salt = process.env.AUDIT_LOG_IP_SALT ?? process.env.SESSION_SECRET ?? "";

  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}

export function maskIp(ip: string | null | undefined): string | null {
  const normalized = ip?.trim();

  if (!normalized || normalized === "unknown") {
    return null;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    const parts = normalized.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  if (normalized.includes(":")) {
    return `${normalized.split(":").slice(0, 3).join(":")}::`;
  }

  return "masked";
}

export function truncateUserAgent(userAgent: string | null | undefined): string | null {
  const normalized = userAgent?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_USER_AGENT_LENGTH);
}

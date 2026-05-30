import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordFailedLoginAttempt,
} from "@/lib/auth/rate-limit";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-context";

const MAX_USERNAME_LENGTH = 80;
const MAX_PASSWORD_LENGTH = 256;

function getRateLimitKeys(request: Request, username: string) {
  const clientIp = getClientIp(request);
  const normalizedUsername = username.toLowerCase();

  return [`ip:${clientIp}`, `username:${normalizedUsername}`];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: unknown; password?: unknown }
    | null;

  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "请输入用户名和密码。" },
      { status: 400 },
    );
  }

  if (
    username.length > MAX_USERNAME_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return NextResponse.json(
      { error: "用户名或密码长度不符合要求。" },
      { status: 400 },
    );
  }

  const rateLimitKeys = getRateLimitKeys(request, username);
  const rateLimitEnabled = shouldApplyLoginRateLimit(request);
  const blockedRateLimit = rateLimitEnabled
    ? rateLimitKeys
        .map((key) => checkLoginRateLimit(key))
        .find((result) => !result.allowed)
    : null;

  if (blockedRateLimit) {
    await writeAuditLog({
      action: "login.failure",
      metadata: { reason: "rate_limited", username },
      request,
    });
    return NextResponse.json(
      { error: "登录尝试过于频繁，请稍后再试。" },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    if (rateLimitEnabled) {
      for (const key of rateLimitKeys) {
        recordFailedLoginAttempt(key);
      }
    }
    await writeAuditLog({
      action: "login.failure",
      metadata: { reason: "invalid_credentials", username },
      request,
      userId: user?.id,
    });
    return NextResponse.json(
      { error: "用户名或密码不正确。" },
      { status: 401 },
    );
  }

  if (rateLimitEnabled) {
    for (const key of rateLimitKeys) {
      clearLoginRateLimit(key);
    }
  }

  const session = await createSession(user.id, {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  await setSessionCookie(session.token, session.expiresAt);
  await writeAuditLog({
    action: "login.success",
    entityId: user.id,
    entityType: "User",
    request,
    userId: user.id,
  });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
}

function shouldApplyLoginRateLimit(request: Request) {
  return (
    process.env.E2E_BYPASS_LOGIN_RATE_LIMIT !== "true" ||
    request.headers.get("x-e2e-enable-rate-limit") === "true"
  );
}

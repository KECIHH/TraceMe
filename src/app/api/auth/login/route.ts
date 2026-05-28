import { NextResponse } from "next/server";

import { verifyPassword } from "@/lib/auth/password";
import { checkLoginRateLimit } from "@/lib/auth/rate-limit";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const MAX_USERNAME_LENGTH = 80;
const MAX_PASSWORD_LENGTH = 256;

function getClientKey(request: Request, username: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0];
  const clientIp =
    forwardedFor?.trim() || request.headers.get("x-real-ip") || "unknown";

  return `${clientIp}:${username.toLowerCase()}`;
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

  const rateLimit = shouldApplyLoginRateLimit()
    ? checkLoginRateLimit(getClientKey(request, username))
    : { allowed: true, resetAt: Date.now() };

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "登录尝试过于频繁，请稍后再试。" },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "用户名或密码不正确。" },
      { status: 401 },
    );
  }

  const session = await createSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
}

function shouldApplyLoginRateLimit() {
  return process.env.E2E_BYPASS_LOGIN_RATE_LIMIT !== "true";
}

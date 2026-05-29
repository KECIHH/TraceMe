import { createHash, randomBytes } from "node:crypto";
import type { Prisma, UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "traceme_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_COOKIE_SAME_SITE = "lax";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isSessionExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function canAccessProtectedRoute(user: AuthUser | null): user is AuthUser {
  return Boolean(user);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await cleanupExpiredSessions().catch((error: unknown) => {
    console.error("Failed to clean up expired sessions.", error);
  });

  await prisma.session.create({
    data: {
      userId,
      sessionTokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function cleanupExpiredSessions(now = new Date()) {
  return prisma.session.deleteMany({
    where: { expiresAt: { lte: now } },
  });
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt));
}

export function getSessionCookieOptions(
  expiresAt: Date,
  nodeEnv = process.env.NODE_ENV,
  appBaseUrl = process.env.APP_BASE_URL,
) {
  return {
    httpOnly: true,
    sameSite: SESSION_COOKIE_SAME_SITE,
    secure: shouldUseSecureCookies(nodeEnv, appBaseUrl),
    path: "/",
    expires: expiresAt,
  } as const;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, "", getClearSessionCookieOptions());
}

export function getClearSessionCookieOptions(
  nodeEnv = process.env.NODE_ENV,
  appBaseUrl = process.env.APP_BASE_URL,
) {
  return {
    httpOnly: true,
    sameSite: SESSION_COOKIE_SAME_SITE,
    secure: shouldUseSecureCookies(nodeEnv, appBaseUrl),
    path: "/",
    maxAge: 0,
  } as const;
}

export function shouldUseSecureCookies(
  nodeEnv = process.env.NODE_ENV,
  appBaseUrl = process.env.APP_BASE_URL,
) {
  void appBaseUrl;
  return nodeEnv === "production";
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { sessionTokenHash: hashSessionToken(token) },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (isSessionExpired(session.expiresAt)) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    await clearSessionCookie();
    return null;
  }

  return {
    id: session.user.id,
    username: session.user.username,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!canAccessProtectedRoute(user)) {
    redirect("/login");
  }

  return user;
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session
      .deleteMany({ where: { sessionTokenHash: hashSessionToken(token) } })
      .catch(() => {});
  }

  await clearSessionCookie();
}

export async function getCurrentSessionTokenHash(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return token ? hashSessionToken(token) : null;
}

export function buildOtherSessionsWhere(
  userId: string,
  currentSessionTokenHash: string | null,
): Prisma.SessionWhereInput {
  return {
    userId,
    ...(currentSessionTokenHash
      ? { sessionTokenHash: { not: currentSessionTokenHash } }
      : {}),
  };
}

export async function deleteOtherSessionsForUser(userId: string) {
  const currentSessionTokenHash = await getCurrentSessionTokenHash();

  return prisma.session.deleteMany({
    where: buildOtherSessionsWhere(userId, currentSessionTokenHash),
  });
}

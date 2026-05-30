import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginRateLimitForTests,
} from "@/lib/auth/rate-limit";
import {
  buildOtherSessionsWhere,
  canAccessProtectedRoute,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  isSessionExpired,
  shouldUseSecureCookies,
  type AuthUser,
} from "@/lib/auth/session";

describe("password hashing", () => {
  it("hashes and verifies a password without storing plaintext", () => {
    const password = "phase-one-secret";
    const passwordHash = hashPassword(password);

    expect(passwordHash).not.toContain(password);
    expect(verifyPassword(password, passwordHash)).toBe(true);
    expect(verifyPassword("wrong-password", passwordHash)).toBe(false);
  });
});

describe("session expiry", () => {
  it("marks sessions expired at or before the current time", () => {
    const now = new Date("2026-05-28T10:00:00.000Z");

    expect(isSessionExpired(new Date("2026-05-28T09:59:59.000Z"), now)).toBe(
      true,
    );
    expect(isSessionExpired(now, now)).toBe(true);
    expect(isSessionExpired(new Date("2026-05-28T10:00:01.000Z"), now)).toBe(
      false,
    );
  });
});

describe("protected route access", () => {
  it("allows authenticated users and rejects guests", () => {
    const user: AuthUser = {
      id: "user_1",
      username: "admin",
      displayName: "TraceMe Admin",
      role: "ADMIN",
    };

    expect(canAccessProtectedRoute(user)).toBe(true);
    expect(canAccessProtectedRoute(null)).toBe(false);
  });
});

describe("session cookie options", () => {
  it("uses secure, httpOnly, sameSite cookies for HTTPS production deployments", () => {
    const expiresAt = new Date("2026-05-28T10:00:00.000Z");

    expect(
      getSessionCookieOptions(expiresAt, "production", "https://example.com"),
    ).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires: expiresAt,
    });
    expect(
      getClearSessionCookieOptions("production", "https://example.com"),
    ).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
  });

  it("allows non-secure cookies for temporary HTTP IP testing", () => {
    const expiresAt = new Date("2026-05-28T10:00:00.000Z");

    expect(
      getSessionCookieOptions(
        expiresAt,
        "production",
        "http://127.0.0.1:3000",
      ).secure,
    ).toBe(false);
    expect(
      getSessionCookieOptions(
        expiresAt,
        "production",
        "http://203.0.113.10:3000",
      ).secure,
    ).toBe(false);
  });

  it("keeps secure cookies for invalid or plain HTTP domain production URLs", () => {
    expect(
      getClearSessionCookieOptions("production", "http://example.com").secure,
    ).toBe(true);
    expect(getClearSessionCookieOptions("production", "not-a-url").secure).toBe(
      true,
    );
  });

  it("does not force secure cookies outside production", () => {
    const expiresAt = new Date("2026-05-28T10:00:00.000Z");

    expect(getSessionCookieOptions(expiresAt, "test").secure).toBe(false);
    expect(getClearSessionCookieOptions("test").secure).toBe(false);
  });

  it("falls back to secure cookies when the production base URL is missing", () => {
    expect(shouldUseSecureCookies("production", "")).toBe(true);
  });
});

describe("session cleanup filters", () => {
  it("keeps the current session when deleting other sessions", () => {
    expect(buildOtherSessionsWhere("user_1", "current_hash")).toEqual({
      userId: "user_1",
      sessionTokenHash: { not: "current_hash" },
    });
  });

  it("targets all user sessions when there is no current session token", () => {
    expect(buildOtherSessionsWhere("user_1", null)).toEqual({
      userId: "user_1",
    });
  });
});

describe("login rate limit", () => {
  it("blocks repeated attempts within the same window", () => {
    clearLoginRateLimitForTests();

    for (let index = 0; index < 5; index += 1) {
      expect(checkLoginRateLimit("ip:127.0.0.1", 1000).allowed).toBe(true);
      recordFailedLoginAttempt("ip:127.0.0.1", 1000);
    }

    expect(checkLoginRateLimit("ip:127.0.0.1", 1000).allowed).toBe(false);
    expect(checkLoginRateLimit("ip:127.0.0.1", 601_001).allowed).toBe(true);
  });
});

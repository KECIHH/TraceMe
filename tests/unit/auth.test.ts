import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  checkLoginRateLimit,
  clearLoginRateLimitForTests,
} from "@/lib/auth/rate-limit";
import {
  canAccessProtectedRoute,
  isSessionExpired,
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

describe("login rate limit", () => {
  it("blocks repeated attempts within the same window", () => {
    clearLoginRateLimitForTests();

    for (let index = 0; index < 5; index += 1) {
      expect(checkLoginRateLimit("127.0.0.1:admin", 1000).allowed).toBe(true);
    }

    expect(checkLoginRateLimit("127.0.0.1:admin", 1000).allowed).toBe(false);
    expect(checkLoginRateLimit("127.0.0.1:admin", 61_001).allowed).toBe(true);
  });
});

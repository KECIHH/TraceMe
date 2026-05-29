import { describe, expect, it } from "vitest";

import { validateProductionEnvironment } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "file:/app/prisma/data/traceme.db",
  APP_BASE_URL: "https://travel.example.com",
  SESSION_SECRET: "a-random-session-secret-with-more-than-32-chars",
  INITIAL_ADMIN_USERNAME: "admin",
  NODE_ENV: "production",
};

describe("production environment validation", () => {
  it("accepts the required private deployment variables", () => {
    expect(validateProductionEnvironment(validEnv)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("rejects missing required values and example secrets", () => {
    const result = validateProductionEnvironment({
      ...validEnv,
      DATABASE_URL: "",
      SESSION_SECRET: "replace-with-a-long-random-secret",
      INITIAL_ADMIN_PASSWORD: "change-me-before-use",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("DATABASE_URL is required.");
    expect(result.errors).toContain(
      "SESSION_SECRET must not use the example value.",
    );
  });

  it("validates initial admin password only for seed operations", () => {
    expect(validateProductionEnvironment(validEnv).ok).toBe(true);

    const missingSeedPassword = validateProductionEnvironment(validEnv, {
      requireInitialAdminPassword: true,
    });
    expect(missingSeedPassword.ok).toBe(false);
    expect(missingSeedPassword.errors).toContain(
      "INITIAL_ADMIN_PASSWORD is required when seeding admin.",
    );

    const weakSeedPassword = validateProductionEnvironment(
      {
        ...validEnv,
        INITIAL_ADMIN_PASSWORD: "change-me-before-use",
      },
      { requireInitialAdminPassword: true },
    );
    expect(weakSeedPassword.ok).toBe(false);
    expect(weakSeedPassword.errors).toContain(
      "INITIAL_ADMIN_PASSWORD must not use the example value.",
    );
  });

  it("requires an HTTPS base URL and production runtime", () => {
    const result = validateProductionEnvironment({
      ...validEnv,
      APP_BASE_URL: "http://travel.example.com",
      NODE_ENV: "development",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "APP_BASE_URL must use https in production, except loopback HTTP for local smoke tests.",
    );
    expect(result.errors).toContain(
      "NODE_ENV must be production for private deployment.",
    );
  });

  it("allows loopback HTTP for local Docker smoke tests", () => {
    expect(
      validateProductionEnvironment({
        ...validEnv,
        APP_BASE_URL: "http://localhost:3000",
      }).ok,
    ).toBe(true);
    expect(
      validateProductionEnvironment({
        ...validEnv,
        APP_BASE_URL: "http://127.0.0.1:3000",
      }).ok,
    ).toBe(true);
  });

  it("rejects invalid base URLs and short session secrets", () => {
    const result = validateProductionEnvironment({
      ...validEnv,
      APP_BASE_URL: "not-a-url",
      SESSION_SECRET: "short",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("APP_BASE_URL must be a valid URL.");
    expect(result.errors).toContain(
      "SESSION_SECRET must be at least 32 characters.",
    );
  });
});

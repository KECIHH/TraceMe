import { describe, expect, it } from "vitest";

import { validateProductionEnvironment } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "file:/app/prisma/data/traceme.db",
  APP_BASE_URL: "http://127.0.0.1:3000",
  SESSION_SECRET: "a-random-session-secret-with-more-than-32-chars",
  INITIAL_ADMIN_USERNAME: "admin",
  INITIAL_ADMIN_PASSWORD: "change-this-admin-password-now",
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
    expect(result.errors).toContain(
      "INITIAL_ADMIN_PASSWORD must not use the example value.",
    );
  });

  it("requires a valid base URL and production runtime", () => {
    const result = validateProductionEnvironment({
      ...validEnv,
      APP_BASE_URL: "ftp://example.invalid",
      NODE_ENV: "development",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("APP_BASE_URL must use http or https.");
    expect(result.errors).toContain(
      "NODE_ENV must be production for private deployment.",
    );
  });
});

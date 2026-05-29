import { describe, expect, it } from "vitest";

import {
  buildHealthPayload,
  GET,
  getHealthStatusCode,
} from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns a healthy status payload", async () => {
    const response = await GET();

    expect([200, 503]).toContain(response.status);
    await expect(response.json()).resolves.toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      timestamp: expect.any(String),
      version: expect.any(String),
      database: {
        connected: expect.any(Boolean),
      },
    });
  });

  it("does not expose sensitive deployment configuration", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body).not.toHaveProperty("databaseUrl");
    expect(body).not.toHaveProperty("sessionSecret");
    expect(body).not.toHaveProperty("openaiApiKey");
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(body)).not.toContain("SESSION_SECRET");
    expect(JSON.stringify(body)).not.toContain("OPENAI_API_KEY");
  });

  it("marks the service unhealthy when the database is disconnected", () => {
    const payload = buildHealthPayload(
      false,
      new Date("2026-05-29T00:00:00.000Z"),
    );

    expect(payload).toEqual({
      status: "degraded",
      timestamp: "2026-05-29T00:00:00.000Z",
      version: expect.any(String),
      database: {
        connected: false,
      },
    });
    expect(getHealthStatusCode(false)).toBe(503);
  });

  it("marks the service healthy when the database is connected", () => {
    expect(buildHealthPayload(true).status).toBe("ok");
    expect(getHealthStatusCode(true)).toBe(200);
  });
});

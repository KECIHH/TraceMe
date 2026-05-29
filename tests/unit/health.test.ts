import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns a healthy status payload", async () => {
    const response = GET();

    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "traceme",
      status: "ok",
      timestamp: expect.any(String),
      version: expect.any(String),
    });
  });

  it("does not expose sensitive deployment configuration", async () => {
    const response = GET();
    const body = await response.json();

    expect(body).not.toHaveProperty("databaseUrl");
    expect(body).not.toHaveProperty("sessionSecret");
    expect(body).not.toHaveProperty("openaiApiKey");
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(body)).not.toContain("SESSION_SECRET");
    expect(JSON.stringify(body)).not.toContain("OPENAI_API_KEY");
  });
});

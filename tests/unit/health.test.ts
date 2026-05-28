import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns a healthy status payload", async () => {
    const response = GET();

    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "traceme",
      status: "healthy",
    });
  });
});

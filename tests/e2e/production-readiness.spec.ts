import { expect, test } from "@playwright/test";

test("robots.txt is available and blocks indexing", async ({ page }) => {
  const response = await page.request.get("/robots.txt");

  expect(response.status()).toBe(200);
  await expect(response.text()).resolves.toContain("Disallow: /");
});

test("health endpoint is available without leaking sensitive fields", async ({
  page,
}) => {
  const response = await page.request.get("/api/health");
  const body = await response.json();
  const serialized = JSON.stringify(body);

  expect(response.status()).toBe(200);
  expect(body).toMatchObject({
    status: "ok",
    timestamp: expect.any(String),
    version: expect.any(String),
    database: {
      connected: true,
    },
  });
  expect(serialized).not.toContain("DATABASE_URL");
  expect(serialized).not.toContain("SESSION_SECRET");
  expect(serialized).not.toContain("OPENAI_API_KEY");
  expect(serialized).not.toContain("INITIAL_ADMIN_PASSWORD");
});

test("private storage paths are not served as public files", async ({ page }) => {
  const uploadResponse = await page.request.get("/storage/uploads/.gitkeep");
  const backupResponse = await page.request.get("/storage/backups/.gitkeep");

  expect(uploadResponse.status()).toBe(404);
  expect(backupResponse.status()).toBe(404);
});

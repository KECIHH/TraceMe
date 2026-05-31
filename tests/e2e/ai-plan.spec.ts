import { randomBytes, scryptSync } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/login") &&
      response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "登录" }).click();

  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`);
  }

  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

test("user can generate, compare, revise, preview, download, and apply an AI travel plan with mock provider", async ({
  page,
}) => {
  await login(page);

  await page.goto("/trips/new");
  await expect(
    page.getByRole("heading", { exact: true, name: "创建旅行计划" }),
  ).toBeVisible();
  await page.locator('a[href="/trips/ai-plan"]').click();
  await expect(page).toHaveURL(/\/trips\/ai-plan$/);

  await page.locator('textarea[name="travelGoal"]').fill("带父母轻松吃逛成都，预算别超太多，尽量少排队。");
  await page.locator('input[name="destination"]').fill("成都");
  await page.locator('input[name="homeCity"]').fill("上海");
  await page.locator('input[name="startDate"]').fill("2026-10-01");
  await page.locator('input[name="endDate"]').fill("2026-10-03");
  await page.locator('input[name="people"]').fill("2");
  await page.locator('input[name="budgetAmount"]').fill("9000");
  await page.getByLabel("美食").check();
  await page.getByLabel("历史").check();
  await page.getByLabel("高铁").check();
  await page.getByLabel("少换乘").check();
  await page.getByLabel("交通方便").check();
  await page.locator('textarea[name="mustVisit"]').fill("宽窄巷子, 武侯祠");
  await page.getByRole("button", { name: "生成 AI 方案" }).click();

  await expect(page).toHaveURL(/\/trips\/ai-plan\?draftId=/, {
    timeout: 15000,
  });
  await expect(page.getByTestId("ai-plan-preview")).toBeVisible();
  const draftId = new URL(page.url()).searchParams.get("draftId");
  expect(draftId).toBeTruthy();

  const intruderUsername = `ai-plan-intruder-${Date.now()}`;
  const intruderPassword = "AiPlanIntruderPass123";
  await prisma.user.create({
    data: {
      displayName: "AI Plan Intruder",
      passwordHash: hashPassword(intruderPassword),
      role: "USER",
      username: intruderUsername,
    },
  });

  await loginWithCredentials(page, intruderUsername, intruderPassword);
  await page.goto(`/trips/ai-plan?draftId=${draftId}`);
  await expect(page.getByTestId("ai-plan-preview")).toHaveCount(0);
  await expect(page.locator('textarea[name="travelGoal"]')).toBeVisible();
  const forbiddenDownload = await page.request.get(
    `/api/ai-plan-drafts/${draftId}/download?format=md`,
  );
  expect(forbiddenDownload.status()).toBe(404);

  await login(page);
  await page.goto(`/trips/ai-plan?draftId=${draftId}`);
  await expect(page.getByTestId("ai-plan-preview")).toBeVisible();
  await expect(page.getByText("方案比较")).toBeVisible();
  await expect(page.getByTestId("ai-plan-option")).toHaveCount(3);
  await expect(page.getByTestId("ai-plan-day")).toHaveCount(3);
  await expect(page.getByTestId("ai-plan-place").first()).toBeVisible();
  await expect(page.getByTestId("ai-plan-budget").first()).toBeVisible();
  await expect(page.getByTestId("ai-plan-checklist").first()).toBeVisible();
  await expect(page.getByTestId("ai-change-preview")).toBeVisible();

  await page
    .locator('[data-testid="ai-plan-option"] button:not([disabled])')
    .first()
    .click();
  await expect(page).toHaveURL(/\/trips\/ai-plan\?draftId=.*message=/, {
    timeout: 15000,
  });

  await page
    .locator('textarea[name="changeRequest"]')
    .fill("第二天更轻松一点，预算便宜一点，交通尽量少换乘。");
  await page.locator('form:has(textarea[name="changeRequest"]) button').click();
  await expect(page).toHaveURL(/\/trips\/ai-plan\?draftId=.*message=/, {
    timeout: 15000,
  });
  await expect(page.getByTestId("ai-plan-version")).toHaveCount(3);

  const previewLink = page.locator('a[href*="/api/ai-plan-drafts/"][href*="disposition=inline"]');
  const downloadLink = page.locator('a[href*="/api/ai-plan-drafts/"][href*="download?format=md"]').last();
  await expect(previewLink).toBeVisible();
  await expect(downloadLink).toBeVisible();
  const previewHref = await previewLink.getAttribute("href");
  expect(previewHref).toBeTruthy();
  const previewResponse = await page.request.get(previewHref!);
  expect(previewResponse.ok()).toBeTruthy();
  const previewMarkdown = await previewResponse.text();
  expect(previewMarkdown).toContain("AI 草稿");
  expect(previewMarkdown).toContain("风险提醒");

  await page.getByRole("button", { name: "确认写入 Trip" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!ai-plan)(?!new$)[^/]+$/, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("heading", { name: /成都3日 AI/ }),
  ).toBeVisible();

  const tripUrl = page.url();
  await page.goto(`${tripUrl}/itinerary`);
  await expect(page.getByTestId("itinerary-day-card")).toHaveCount(3);
  await expect(page.getByText("宽窄巷子").first()).toBeVisible();

  await page.goto(`${tripUrl}/places`);
  await expect(page.getByRole("heading", { name: "宽窄巷子" })).toBeVisible();

  await page.goto(`${tripUrl}/checklist`);
  await expect(page.getByRole("heading", { name: "身份证/护照等有效证件" })).toBeVisible();

  await page.goto(`${tripUrl}/budget`);
  await expect(
    page.getByRole("heading", { name: "AI 估算：交通" }),
  ).toBeVisible();
  await expect(page.getByText("交通").first()).toBeVisible();
});

async function loginWithCredentials(
  page: import("@playwright/test").Page,
  loginUsername: string,
  loginPassword: string,
) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("用户名").fill(loginUsername);
  await page.getByLabel("密码").fill(loginPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

function hashPassword(rawPassword: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(rawPassword, salt, 64).toString("hex");

  return `scrypt:${salt}:${derivedKey}`;
}
